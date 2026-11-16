/*
 * Step 2 — appointments and OP visits.
 *
 * Appointments: seen by the doctor → done, never seen → no_show, cancelled stays
 * cancelled. SwiftEHR gave no token numbers, so token_no stays empty and no
 * token counter is touched.
 *
 * OP visits: closed 'opd' visits on their old date and time, linked to their
 * appointment. Complaint → complaint; BP, pulse, temperature, SpO₂, weight,
 * height → vitals (the keys the OPD screen reads). Breathing rate, sugar, pain,
 * BMI, past history, advice, follow-up and the old medicines go into notes as
 * text — the medicines NOT as prescriptions, or every one would wait in the
 * pharmacy queue as "not dispensed".
 *
 * The fee is the visit's CONSULTING FEE line(s) from its old OP bill, and the
 * visit is marked billed (the bill itself comes in the bills step). A visit
 * with no old bill gets fee 0, waived, so Uyirly never offers to bill it.
 */
import { loadItems, ymd, hms, istStamp, scrubText, loggedIds, doctorFor, logThenInsert, undoStep, type Tenant, type Planned } from '../lib'

const STEP = 'opd'
const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/[ \t]+/g, ' ').trim() : v != null && v !== '' ? String(v) : '') || null

export async function plan(t: Tenant) {
  const patients = await loggedIds(t, 'patients')
  if (!patients.size) throw new Error('Run the patients step first.')
  const doctor = await doctorFor(t)

  // OP visits and the real names to blank out of their text on demo.
  const items = loadItems<any>('patients')
  const realNames = new Map<string, string[]>()
  const visits: any[] = []
  for (const it of items) {
    const p = it.patient, d = it.detail ?? {}
    realNames.set(String(p.patientId), [p.patientName, p.firstName, p.lastName, d.incharge1Name, d.parentName, d.relativeFirstName])
    for (const v of it.visits ?? []) if (!('details' in v) && !('discharge' in v)) visits.push(v)
  }
  const seenVisit = new Set(visits.map((v) => String(v.caseSheet?.encounter?.encounterId ?? v.visit?.visitId)))

  // Fees from the old OP bills, by visit.
  const fee = new Map<string, number>()
  for (const b of loadItems<any>('bills').filter((x) => x.type === 'op')) {
    const enc = b.bill?.encounterId
    if (!enc) continue
    const lines = b.lines?.billItem ?? []
    const consult = lines.filter((l: any) => /CONSULT/i.test(l.itemName ?? '')).reduce((s: number, l: any) => s + Number(l.netAmount ?? l.amount ?? 0), 0)
    fee.set(String(enc), (fee.get(String(enc)) ?? 0) + consult)
  }

  // ── Appointments ──
  const appts: Planned[] = []
  const status = { done: 0, no_show: 0, cancelled: 0 }
  let noPatient = 0
  for (const { appointment: a } of loadItems<any>('appointments')) {
    const patientId = patients.get(`patient:${a.patientId}`)
    const date = ymd(a.appointmentDate)
    if (!patientId || !date) { noPatient++; continue }
    const st = a.status === 'Cancelled' ? 'cancelled' : seenVisit.has(String(a.encounterId)) ? 'done' : 'no_show'
    status[st]++
    const at = istStamp(date, hms(a.appointmentTime))
    appts.push({
      key: `appointment:${a.appointmentId}`,
      row: {
        patient_id: patientId, doctor_id: doctor.id, department_id: null, scheduled_at: at, token_no: null, status: st,
        reason: st === 'cancelled' && !t.scramble ? clean(a.reasonForEdit) : null, created_at: at,
      },
    })
  }

  // ── Visits ──
  const apptKey = new Set(appts.map((a) => a.key))
  const planned: Planned[] = []
  const counts = { complaint: 0, vitals: 0, notes: 0, billed: 0, waived: 0, noAppointment: 0 }
  for (const v of visits) {
    const e = v.caseSheet?.encounter ?? {}
    const encId = String(e.encounterId ?? v.visit?.visitId)
    const patientId = patients.get(`patient:${e.patientId}`)
    const date = ymd(e.date) ?? ymd(v.visit?.visitDate)
    if (!patientId || !date) { noPatient++; continue }
    const names = t.scramble ? realNames.get(String(e.patientId)) ?? [] : []
    const txt = (s: unknown) => (t.scramble ? scrubText(clean(s), names) : clean(s))

    const vitals: Record<string, string> = {}
    for (const [k, from] of [['bp', 'bp'], ['pulse', 'pulse'], ['temp', 'temp'], ['spo2', 'oxygen'], ['weight', 'weight'], ['height', 'height']] as const) {
      const x = clean(e[from]); if (x) vitals[k] = x
    }
    const extra = [e.rr && `RR ${e.rr}`, e.sugar && `Sugar ${e.sugar}`, e.pain && `Pain ${e.pain}/10`, e.bmi && `BMI ${e.bmi}`].filter(Boolean).join(' · ')
    const meds = (v.prescription?.medicineList ?? []).map((m: any) => {
      const dose = [m.morning ?? 0, m.afternoon ?? 0, m.night ?? 0].join('-')
      return `${[m.drugName, m.strength, m.form?.toLowerCase()].filter(Boolean).join(' ')} — ${dose}${m.foodTiming ? ` ${m.foodTiming.toLowerCase()} food` : ''}${m.quantity ? ` × ${m.quantity}` : ''}`
    })
    const notes = [
      txt(e.preMedCondition ?? e.preMedCond) && `Past history: ${txt(e.preMedCondition ?? e.preMedCond)}`,
      extra,
      txt(e.advice) && `Advice: ${txt(e.advice)}`,
      e.followupDate && `Follow-up: ${ymd(e.followupDate) ?? e.followupDate}`,
      meds.length && `Medicines (SwiftEHR):\n${meds.join('\n')}`,
    ].filter(Boolean).join('\n')
    const visitFee = fee.get(encId)
    const at = istStamp(date, hms(e.time))
    const aKey = `appointment:${e.appointmentId}`
    if (!apptKey.has(aKey)) counts.noAppointment++
    if (e.chiefComplaint) counts.complaint++
    if (Object.keys(vitals).length) counts.vitals++
    if (notes) counts.notes++
    counts[visitFee !== undefined ? 'billed' : 'waived']++
    planned.push({
      key: `visit:${encId}`,
      row: {
        patient_id: patientId, doctor_id: doctor.id, appointment_id: aKey, // resolved to the row id at write time
        type: 'opd', status: 'closed', visit_date: at, created_at: at,
        complaint: txt(e.chiefComplaint), vitals: Object.keys(vitals).length ? vitals : null, notes: notes || null,
        diagnosis: null, icd_code: null, clinical_data: null,
        consultation_fee: visitFee ?? 0, billing_status: visitFee !== undefined ? 'billed' : 'waived',
      },
    })
  }
  return { doctor, appts, status, planned, counts, noPatient }
}

export async function run(t: Tenant, write: boolean): Promise<void> {
  const { doctor, appts, status, planned, counts, noPatient } = await plan(t)
  console.log(`doctor on every record: ${doctor.name}`)
  console.log(`appointments: ${appts.length}`, status)
  console.log(`OP visits: ${planned.length}`, counts, `fees total ₹${planned.reduce((s, p) => s + Number(p.row.consultation_fee), 0)}`)
  if (noPatient) throw new Error(`${noPatient} records have no imported patient or no date`)
  const span = (xs: Planned[], k: string) => xs.map((x) => String(x.row[k])).sort()
  const a = span(appts, 'scheduled_at'), v = span(planned, 'visit_date')
  console.log(`  dates: appointments ${a[0]} … ${a[a.length - 1]} | visits ${v[0]} … ${v[v.length - 1]}`)
  const sample = planned.find((p) => p.row.notes && p.row.vitals && p.row.complaint)
  if (sample) console.log('  a visit as it will be written:', JSON.stringify(t.scramble ? sample.row : { ...sample.row, complaint: '(real)', notes: '(real)' }).slice(0, 700))
  if (!write) { console.log('dry run — nothing written. Add --write to write.'); return }

  const ra = await logThenInsert(t, STEP, 'appointments', appts)
  console.log(`appointments written: ${ra.inserted} new, ${ra.existing} already there`)
  const apptIds = await loggedIds(t, 'appointments')
  for (const p of planned) p.row.appointment_id = apptIds.get(String(p.row.appointment_id)) ?? null
  const rv = await logThenInsert(t, STEP, 'visits', planned)
  console.log(`visits written: ${rv.inserted} new, ${rv.existing} already there`)
}

export async function undo(t: Tenant): Promise<void> {
  await undoStep(t, STEP, ['visits', 'appointments'])
}
