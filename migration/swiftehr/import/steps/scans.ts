/*
 * Step 6 — scans (X-ray, echo, ECG, PFT, ultrasound).
 *
 * SwiftEHR kept no scan reports or images, only what was charged. Each scan
 * charged — a line on an OP scan bill, or a "Scan" line on an inpatient's stay
 * bill — becomes one reported Uyirly radiology order on its date, linked to
 * its OP visit or stay, priced as charged. Its report says SwiftEHR kept no
 * report, and names what was charged and the old scan order number.
 *
 *  - Status 'reported', not 'performed': "Performed" is the radiology screen's
 *    queue of scans waiting for a report, and these will never get one.
 *    The machine worklist lists only 'ordered', so none reach a scanner.
 *  - Lines on cancelled bills are left out.
 *  - The 8 ECGs SwiftEHR recorded on its lab screen with a result ("NORMAL")
 *    come in as ECG orders carrying that result.
 *  - A scan the hospital's catalogue lacks is added to it switched off.
 *  - ECGs and X-rays charged on the lab screen but never resulted are only on
 *    the old bills (owner's decision for lab).
 */
import { db, all, loadItems, ymd, hms, istStamp, loggedIds, doctorFor, logThenInsert, undoStep, rewindDailyCounter, type Tenant, type Planned } from '../lib'
import { key } from '../lab-map'

const STEP = 'scans'
const HOUR = 3600_000
const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v != null ? String(v) : '') || null

/** What SwiftEHR charged → the catalogue name (KMCH's own, else the master's). */
const SCAN_TO: Record<string, string> = Object.fromEntries(Object.entries({
  'CHEST X-RAY': 'Chest X-Ray', 'CHEST XRAY': 'Chest X-Ray', 'CHEST X-RAY(MLC)': 'Chest X-Ray',
  'HAND X-RAY': 'Hand X-Ray', 'HAND X-RAY (MLC)': 'Hand X-Ray', 'XRAY LEFT HAND': 'Hand X-Ray', 'RIGHT HAND AP AND LAT': 'Hand X-Ray',
  'KNEE X-RAY': 'Knee X-Ray', 'SHOULDER X-RAY': 'Shoulder X-Ray', 'ELBOW X-RAY': 'Elbow X-Ray', 'ANKLE X-RAY': 'Ankle X-Ray', 'FEMUR X-RAY': 'Femur X-Ray',
  'FOOT X-RAY': 'Foot X-Ray', 'LEFT FOOT AP': 'Foot X-Ray', 'RIGHT FOOT AP': 'Foot X-Ray', 'X RAY RIGHT FOOT AP VIEW': 'Foot X-Ray',
  'WRIST X-RAY': 'Wrist X-Ray', 'WRIST X-RAY(MLC)': 'Wrist X-Ray', 'XRAY LEFT WRIST': 'Wrist X-Ray',
  'PELVIS X-RAY': 'Pelvis X-Ray', 'PELVIS X-RAY(MLC)': 'Pelvis X-Ray',
  'LEG X-RAY': 'Leg X-Ray (Tibia & Fibula)', 'TIBIA': 'Leg X-Ray (Tibia & Fibula)', 'FOREARM': 'Forearm X-Ray',
  'L.SPINE X-RAY': 'Lumbar Spine X-Ray AP & Lateral', 'C.SPINE X-RAY': 'Cervical Spine X-Ray AP & Lateral',
  'ABDOMEN X-RAY': 'Abdomen X-Ray Supine', 'NECK X-RAY': 'Neck X-Ray (Soft Tissue)',
  'ECHO': '2D Echocardiography', 'ECHO/TMT': '2D Echocardiography with Treadmill Test', 'ECG': 'Electrocardiogram (ECG)',
  'PULMONARY FUNCTION TEST': 'Pulmonary Function Test (Spirometry)', 'USG ABDOMEN': 'USG Abdomen',
}).map(([k, v]) => [key(k), v]))
/** Not in the master list: added as the hospital's own entry. */
const OWN: Record<string, { modality: string; body_part: string }> = { 'Neck X-Ray (Soft Tissue)': { modality: 'xray', body_part: 'Head & Neck' } }

type Cat = { id: string; name: string; modality: string | null; price: number; is_active: boolean; body_part: string; radiology_master_id: string | null }

export async function plan(t: Tenant) {
  const patients = await loggedIds(t, 'patients'), visits = await loggedIds(t, 'visits'), admissions = await loggedIds(t, 'admissions')
  if (!patients.size || !visits.size || !admissions.size) throw new Error('Run the patients, opd and admissions steps first.')
  const doctor = await doctorFor(t)

  const { data: kt } = await db().from('tenants').select('id').eq('slug', 'karur').single()
  const catOf = (tid: string) => all<Cat>((f, to) => db().from('radiology_catalog').select('id, name, modality, price, is_active, body_part, radiology_master_id')
    .eq('tenant_id', tid).order('id').range(f, to))
  const kmch = await catOf(kt!.id as string)
  const own = t.slug === 'karur' ? kmch : await catOf(t.id)
  const master = await all<{ id: string; name: string; modality: string | null; body_part: string | null; created_at: string }>((f, to) =>
    db().from('radiology_master').select('id, name, modality, body_part, created_at').order('created_at').order('id').range(f, to))

  const created: Planned[] = []
  const rowFor = new Map<string, Cat>()
  function tenantRow(target: string, price: number): Cat {
    if (rowFor.has(target)) return rowFor.get(target)!
    const same = own.filter((c) => key(c.name) === key(target))
    let row: Cat | undefined = same.find((c) => c.is_active) ?? same[0]
    if (!row) {
      const m = master.find((x) => key(x.name) === key(target)) // earliest of the duplicate pair
      const k = kmch.find((c) => key(c.name) === key(target))
      if (!m && !k && !OWN[target]) throw new Error(`no catalogue or master entry for ${target}`)
      const id = `radtest:${key(target)}`
      const fields = {
        name: target, modality: m?.modality ?? k?.modality ?? OWN[target]?.modality ?? 'xray', price: k?.price ?? price, is_active: false,
        body_part: m?.body_part ?? k?.body_part ?? OWN[target]?.body_part ?? 'General', radiology_master_id: m?.id ?? null,
      }
      created.push({ key: id, row: fields })
      row = { id, ...fields } as Cat
    }
    rowFor.set(target, row)
    return row
  }

  const orders: Planned[] = []
  const c = { opLines: 0, ipLines: 0, cancelled: 0, openStay: 0, ecgResults: 0, withVisit: 0, withStay: 0, patientOnly: 0, unknown: 0 }
  const unknown = new Map<string, number>()
  const items = loadItems<any>('patients')

  // Scan orders on visits, for their number and (inpatient) time.
  const presc = new Map<number, { no: string | null; visitKey: string | null; admKey: string | null; date: string | null; time: string | null }>()
  for (const it of items) for (const v of it.visits ?? []) {
    const list = Array.isArray(v.scans) ? v.scans : v.scans?.scanPrescriptionList ?? []
    for (const s of list) presc.set(s.scanPrescriptionId, {
      no: clean(s.prescriptionNo), visitKey: 'discharge' in v ? null : `visit:${v.caseSheet?.encounter?.encounterId ?? v.visit?.visitId}`,
      admKey: 'discharge' in v ? `admission:${v.visit.visitId}` : null, date: ymd(s.prescriptionDate), time: hms(s.prescriptionTime),
    })
  }
  const report = (charged: string, no: string | null, billNo: string | null) =>
    `SwiftEHR (the previous software) kept no report for this scan.\nCharged as: ${charged}${no ? ` · old scan order ${no}` : ''}${billNo ? ` · bill ${billNo}` : ''}`
  const push = (k: string, pid: string, target: string, price: number, at: string, visitId: string | null, admId: string | null, text: string) => {
    const row = tenantRow(target, price)
    if (visitId) c.withVisit++; else if (admId) c.withStay++; else c.patientOnly++
    orders.push({
      key: k,
      row: {
        patient_id: pid, visit_id: visitId, admission_id: admId, test_id: row.id, ordered_by: doctor.id, price_snapshot: price,
        status: 'reported', billing_status: 'billed', report: text, image_url: null, ordered_at: at, reported_at: at,
        priority: 'routine', verified_by: null, verified_at: null,
      },
    })
  }

  // ── OP scan bills ──
  for (const b of loadItems<any>('bills').filter((x) => x.type === 'scan')) {
    const pid = patients.get(`patient:${b.bill?.patientId}`)
    for (const l of b.lines?.billItem ?? []) {
      if (b.bill?.status === 'Cancelled') { c.cancelled++; continue }
      const target = SCAN_TO[key(l.itemName)]
      if (!target || !pid) { unknown.set(String(l.itemName), (unknown.get(String(l.itemName)) ?? 0) + 1); c.unknown++; continue }
      const p = presc.get(l.scanPrescriptionId)
      const day = ymd(l.dateOfService) ?? ymd(b.bill?.billedDate)!
      const billedDay = ymd(b.bill?.billedDate)
      const visitId = visits.get(p?.visitKey ?? `visit:${b.bill?.encounterId}`) ?? null
      const time = billedDay === day ? hms(b.bill?.billedDate) : '12:00:00'
      c.opLines++
      push(`scan:${l.billItemId}`, pid, target, Number(l.netAmount ?? l.amount ?? 0), istStamp(day, time), visitId, null,
        report(clean(l.itemName)!, p?.no ?? null, clean(b.bill?.billNo)))
    }
  }

  // ── Scans on inpatient stay bills, and the ECGs resulted on the lab screen ──
  for (const it of items) {
    const pid = patients.get(`patient:${it.patient.patientId}`)!
    for (const v of it.visits ?? []) {
      const ip = 'discharge' in v
      const admKey = ip ? `admission:${v.visit.visitId}` : null
      const admId = admKey ? admissions.get(admKey) ?? null : null
      if (ip) {
        const lines = (v.bill?.lines?.billItem ?? []).filter((l: any) => String(l.itemType ?? '').toLowerCase() === 'scan')
        if (lines.length && !admId) { c.openStay += lines.length; continue }
        const start = new Date(String(v.visit.admissionDate).replace(' ', 'T').slice(0, 19) + 'Z').getTime()
        const endS = v.bill?.lines?.dischargeDate
        const end = endS && ymd(endS) ? new Date(istStamp(ymd(endS)!, hms(endS))).getTime() : Infinity
        const sameDay = [...presc.values()].filter((p) => p.admKey === admKey)
        for (const l of lines) {
          const target = SCAN_TO[key(l.itemName)]
          if (!target) { unknown.set(String(l.itemName), (unknown.get(String(l.itemName)) ?? 0) + 1); c.unknown++; continue }
          const day = ymd(l.dateOfService)!
          const p = sameDay.find((x) => x.date === day)
          let at = new Date(istStamp(day, p?.time ?? '12:00:00')).getTime()
          at = Math.min(Math.max(at, start), end) // inside the stay
          c.ipLines++
          push(`scan:${l.billItemId}`, pid, target, Number(l.netAmount ?? l.amount ?? 0), new Date(at).toISOString(), null, admId,
            report(clean(l.itemName)!, p?.no ?? null, clean(v.bill?.lines?.billNo)))
        }
      }
      // ECG with a result on the lab screen.
      const reqs = new Map((v.labRequests ?? []).map((r: any) => [r.labTestRequestId, r]))
      for (const r of v.labs ?? []) {
        for (const g of r.report?.labList ?? []) for (const lr of g.labrequest ?? []) for (const blk of lr.labList ?? []) {
          const line = (blk.labTestItem ?? [])[0]
          if (!line || key(blk.packageNameSpecimen ?? line.labTestName) !== 'ECG' || !clean(line.resultValue)) continue
          if (ip && !admId) continue
          const rq: any = reqs.get(r.labTestRequestId) ?? {}
          const at = istStamp(ymd(rq.reqDt)!, hms(rq.reqTime))
          const visitId = ip ? null : visits.get(`visit:${rq.encounterId ?? v.caseSheet?.encounter?.encounterId}`) ?? null
          c.ecgResults++
          push(`scanecg:${r.labTestRequestId}`, pid, 'Electrocardiogram (ECG)', 0, at, visitId, admId,
            `${clean(line.resultValue)}\n(Recorded on SwiftEHR's lab screen, request ${clean(rq.requestNum) ?? r.labTestRequestId}.)`)
        }
      }
    }
  }
  return { doctor, orders, created, c, unknown }
}

export async function run(t: Tenant, write: boolean): Promise<void> {
  const { doctor, orders, created, c, unknown } = await plan(t)
  console.log(`doctor on every order: ${doctor.name}`)
  console.log(`scan orders: ${orders.length}`, c)
  if (created.length) console.log(`  scans added to this hospital's catalogue, switched off: ${created.map((x) => x.row.name).join(', ')}`)
  if (unknown.size) console.log('  SCANS WITH NO MATCH:', Object.fromEntries(unknown))
  const span = orders.map((o) => String(o.row.ordered_at)).sort()
  console.log(`  dates: ${span[0]} … ${span[span.length - 1]}`)
  if (!write) { console.log('dry run — nothing written. Add --write to write.'); return }
  if (unknown.size) throw new Error('Every scan needs a catalogue entry before writing.')
  const rc = await logThenInsert(t, STEP, 'radiology_catalog', created)
  console.log(`catalogue scans added (switched off): ${rc.inserted} new, ${rc.existing} already there`)
  const ids = await loggedIds(t, 'radiology_catalog')
  for (const o of orders) if (String(o.row.test_id).startsWith('radtest:')) o.row.test_id = ids.get(String(o.row.test_id))
  orders.sort((a, b) => new Date(String(a.row.ordered_at)).getTime() - new Date(String(b.row.ordered_at)).getTime()) // accession numbers in time order
  const ro = await logThenInsert(t, STEP, 'radiology_orders', orders, undefined, 100)
  console.log(`scan orders written: ${ro.inserted} new, ${ro.existing} already there`)
}

export async function undo(t: Tenant): Promise<void> {
  await undoStep(t, STEP, ['radiology_orders', 'radiology_catalog'])
  await rewindDailyCounter(t, { table: 'radiology_orders', seqTable: 'radiology_accession_seq', prefix: 'R' })
}
