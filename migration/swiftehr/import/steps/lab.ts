/*
 * Step 4 — lab results.
 *
 * Every SwiftEHR lab request with a finished report becomes a reported Uyirly
 * lab order on its old date, linked to its OP visit or inpatient stay, with
 * the old request number (FAC-18-n) kept in legacy_request_no.
 *
 *  - Each reported test becomes an order line for the hospital's own catalogue
 *    test (lab-map.ts). A test the hospital's catalogue lacks is added to it
 *    SWITCHED OFF, so it can hold history without being orderable.
 *  - Panel values go into the panel's measurement lines; a one-box test keeps
 *    its value on the order line. A one-box test that printed several lines
 *    keeps them as text.
 *  - Health check-ups are split by line into the tests they contain (CBC, LFT,
 *    lipids …), so every value lands where Uyirly would put it.
 *  - Range: the one printed on the old report, as it was (owner's decision),
 *    converted with the value where the unit changes (platelets, T3).
 *  - Flag: SwiftEHR's own abnormal mark decides; the range only says whether
 *    it was high or low. Never critical — the critical alerts stay quiet.
 *  - Price: the old bill line's amount; split health check-up parts carry 0.
 *  - Tests never resulted in SwiftEHR (ECG, X-ray, sugar strips …) are not
 *    lab orders; they come in on the old bills (owner's decision).
 */
import { db, all, loadItems, ymd, hms, istStamp, scrubText, loggedIds, doctorFor, logThenInsert, undoStep, chunks, type Tenant, type Planned } from '../lib'
import { key, NOT_LAB, TEST_TO_KMCH, MISSING_AT_KMCH, LINE_TO_ANALYTE, LINE_OVERRIDES, CONVERT, RANGE_FROM, SPLIT_BY_ANALYTE, SPLIT_BY_LINE, HEALTH_CHECKS, JUNK_UNIT } from '../lab-map'

const STEP = 'lab'
type Cat = { id: string; name: string; code: string | null; price: number; is_active: boolean; package_only: boolean; lab_master_id: string | null; category: string; sample_type: string | null; unit: string | null; department: string | null; tube_type: string | null }
type Line = { lab_master_id: string; analyte_id: string; code: string; value_type: string; allowed: string[] | null; active: boolean; oldOnly: boolean }
type SwiftLine = { labTestName: string; uom: string | null; resultValue: string | null; normalRange: string | null; highlighted: boolean }

const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v != null ? String(v) : '') || null
const isNum = (s: string) => /^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)

/** "12-16" → both; "up to 6 …" / "< 6" → high only; "> 5" → low only. */
function parseRange(r: string | null): { lo: number | null; hi: number | null; numericOnly: boolean } {
  if (!r) return { lo: null, hi: null, numericOnly: false }
  let m = r.match(/^(-?\d*\.?\d+)\s*(?:-|–|to)\s*(-?\d*\.?\d+)$/i)
  if (m) return { lo: Number(m[1]), hi: Number(m[2]), numericOnly: true }
  m = r.match(/^(?:up\s*to|upto|<|less than|below)\s*(\d*\.?\d+)/i)
  if (m) return { lo: null, hi: Number(m[1]), numericOnly: false }
  m = r.match(/^(?:>|more than|above)\s*(\d*\.?\d+)/i)
  if (m) return { lo: Number(m[1]), hi: null, numericOnly: false }
  return { lo: null, hi: null, numericOnly: false }
}
function flagOf(highlighted: boolean, num: number | null, lo: number | null, hi: number | null, hasRange: boolean): string {
  if (!highlighted) return hasRange ? 'normal' : 'unranged'
  if (num !== null && hi !== null && num > hi) return 'high'
  if (num !== null && lo !== null && num < lo) return 'low'
  return 'abnormal'
}
const best = (rows: Cat[]) => rows.find((r) => r.is_active && !r.package_only) ?? rows.find((r) => r.is_active) ?? rows[0]

export async function plan(t: Tenant) {
  const patients = await loggedIds(t, 'patients')
  const visits = await loggedIds(t, 'visits')
  const admissions = await loggedIds(t, 'admissions')
  if (!patients.size || !visits.size || !admissions.size) throw new Error('Run the patients, opd and admissions steps first.')
  const doctor = await doctorFor(t)

  // ── Reference data ──
  const { data: kmchT } = await db().from('tenants').select('id').eq('slug', 'karur').single()
  const catOf = (tid: string) => all<Cat>((f, to) => db().from('lab_tests_catalog')
    .select('id, name, code, price, is_active, package_only, lab_master_id, category, sample_type, unit, department, tube_type').eq('tenant_id', tid).order('id').range(f, to))
  const kmchCat = await catOf(kmchT!.id as string)
  const ownCat = t.slug === 'karur' ? kmchCat : await catOf(t.id)
  const master = await all<{ id: string; code: string | null; name: string; category: string | null }>((f, to) => db().from('lab_tests_master').select('id, code, name, category').order('id').range(f, to))
  const rawLines = await all<any>((f, to) => db().from('lab_test_analytes')
    .select('lab_master_id, analyte_id, created_at, retired_at, analyte:lab_analytes(code, value_type, allowed_values)').order('id').range(f, to))
  const linesOf = new Map<string, Line[]>()
  for (const l of rawLines) {
    const oldOnly = !!l.retired_at && l.created_at === l.retired_at
    if (l.retired_at && !oldOnly) continue
    const arr = linesOf.get(l.lab_master_id) ?? []
    arr.push({ lab_master_id: l.lab_master_id, analyte_id: l.analyte_id, code: l.analyte.code, value_type: l.analyte.value_type, allowed: l.analyte.allowed_values, active: !l.retired_at, oldOnly })
    linesOf.set(l.lab_master_id, arr)
  }
  const kmchByName = new Map<string, Cat[]>()
  for (const c of kmchCat) kmchByName.set(key(c.name), [...(kmchByName.get(key(c.name)) ?? []), c])

  // The hospital's row for a KMCH test name; planned (switched off) when missing.
  const created: Planned[] = []
  const rowFor = new Map<string, Cat>()
  function tenantRow(kmchName: string): Cat | null {
    if (rowFor.has(kmchName)) return rowFor.get(kmchName)!
    let ref = kmchByName.get(key(kmchName)) ? best(kmchByName.get(key(kmchName))!) : null
    if (!ref && MISSING_AT_KMCH[kmchName]) {
      const m = master.find((x) => x.code === MISSING_AT_KMCH[kmchName])
      if (m) ref = { id: '', name: m.name, code: null, price: 0, is_active: false, package_only: false, lab_master_id: m.id, category: m.category ?? 'General', sample_type: null, unit: null, department: null, tube_type: null }
    }
    if (!ref) return null
    let row: Cat | undefined
    if (t.slug === 'karur') row = ref.id ? ref : undefined
    else {
      const same = ownCat.filter((c) => (ref!.lab_master_id ? c.lab_master_id === ref!.lab_master_id : key(c.name) === key(ref!.name)))
      row = same.length ? best(same) : undefined
    }
    if (!row) {
      const k = `labtest:${key(kmchName)}`
      row = { ...ref, id: k, is_active: false, code: null }
      created.push({ key: k, row: { name: ref.name, code: null, price: ref.price, is_active: false, package_only: false, lab_master_id: ref.lab_master_id,
        category: ref.category, sample_type: ref.sample_type, unit: ref.unit, department: ref.department, tube_type: ref.tube_type } })
    }
    rowFor.set(kmchName, row)
    return row
  }

  // Old bill line amounts by line id.
  const price = new Map<number, number>()
  for (const b of loadItems<any>('bills')) for (const l of [...(b.lines?.billItem ?? []), ...(b.lines?.labBillItems ?? [])]) price.set(l.billItemId, Number(l.netAmount ?? l.amount ?? 0))
  const patientItems = loadItems<any>('patients')
  // An inpatient's tests are on the stay's own bill.
  for (const it of patientItems) for (const v of it.visits ?? []) for (const l of v.bill?.lines?.billItem ?? []) price.set(l.billItemId, Number(l.netAmount ?? l.amount ?? 0))

  const orders: Planned[] = [], items: Planned[] = [], results: Planned[] = []
  const c = { requests: 0, noReport: 0, openStay: 0, notLabDone: 0, tests: 0, panelTests: 0, oneBox: 0, oneBoxText: 0, values: 0, converted: 0, healthSplit: 0,
    dupTest: 0, dupLine: 0, noPrice: 0, created: 0 }
  const unplaced = new Map<string, number>(), unknownTest = new Map<string, number>()
  const usedLines = new Map<string, Set<string>>() // test row → analyte codes that ever had a value
  const reports = new Map<string, Map<string, Set<string>>>() // order → test → codes (for the pending count)

  for (const it of patientItems) {
    const p = it.patient, det = it.detail ?? {}
    const patientId = patients.get(`patient:${p.patientId}`)!
    const names = t.scramble ? [p.patientName, p.firstName, p.lastName, det.incharge1Name, det.parentName, det.relativeFirstName] : []
    const txt = (s: string | null) => (t.scramble && s ? scrubText(s, names) : s)
    for (const v of it.visits ?? []) {
      const reqs = new Map((v.labRequests ?? []).map((r: any) => [r.labTestRequestId, r]))
      const ip = 'discharge' in v
      for (const r of v.labs ?? []) {
        c.requests++
        const rq: any = reqs.get(r.labTestRequestId) ?? {}
        const blocks: { lines: SwiftLine[]; pkg: string | null }[] = []
        for (const g of r.report?.labList ?? []) for (const lr of g.labrequest ?? []) for (const b of lr.labList ?? []) {
          const ls = (b.labTestItem ?? []).filter((l: SwiftLine) => clean(l.resultValue))
          if (ls.length) blocks.push({ lines: ls, pkg: clean(b.packageNameSpecimen) })
        }
        if (!blocks.length) { c.noReport++; continue }
        const admKey = ip ? `admission:${v.visit.visitId}` : null
        if (ip && !admissions.has(admKey!)) { c.openStay++; continue }
        const visitId = ip ? null : visits.get(`visit:${rq.encounterId ?? v.caseSheet?.encounter?.encounterId}`) ?? null
        const orderedAt = istStamp(ymd(rq.reqDt) ?? ymd(r.items?.labList?.[0]?.dotDate)!, hms(rq.reqTime))
        const rep = r.report?.reportedDate
        const reportedAt = rep && ymd(rep) ? istStamp(ymd(rep)!, hms(rep)) : orderedAt
        const oKey = `laborder:${r.labTestRequestId}`

        // Ordered tests, for their bill lines.
        const ordered = (r.items?.labList ?? []).filter((x: any) => x.statusName === 'Test Completed')
        const priceOf = (swiftName: string) => {
          const i = ordered.findIndex((x: any) => key(x.itemName) === key(swiftName))
          if (i < 0) return null
          const [x] = ordered.splice(i, 1)
          return price.has(x.billItemId) ? price.get(x.billItemId)! : null
        }

        // Each block → one or more (test, lines) entries.
        const entries = new Map<string, { lines: SwiftLine[]; price: number }>()
        const addEntry = (kmchName: string, lines: SwiftLine[], amount: number, part = false) => {
          const e = entries.get(kmchName)
          if (e) { if (!part) c.dupTest++; e.lines.push(...lines); e.price += amount } else entries.set(kmchName, { lines: [...lines], price: amount })
        }
        for (const b of blocks) {
          const swiftName = b.pkg ?? b.lines[0].labTestName
          if (NOT_LAB.has(key(swiftName))) { c.notLabDone++; continue }
          const kmchName = TEST_TO_KMCH[key(swiftName)] ?? (kmchByName.get(key(swiftName)) ? best(kmchByName.get(key(swiftName))!).name : null)
          if (!kmchName) { unknownTest.set(swiftName, (unknownTest.get(swiftName) ?? 0) + 1); continue }
          const amount = priceOf(swiftName)
          if (amount === null) c.noPrice++
          if (HEALTH_CHECKS.has(kmchName)) {
            c.healthSplit++
            for (const l of b.lines) {
              const code = key(l.labTestName) === 'ALBUMIN' && JUNK_UNIT.test(String(l.uom ?? '')) ? 'UR_ALB' : LINE_TO_ANALYTE[key(l.labTestName)]
              const target = (code && SPLIT_BY_ANALYTE[code]) ?? SPLIT_BY_LINE[key(l.labTestName)]
              if (!target) { unplaced.set(`${kmchName} › ${l.labTestName}`, (unplaced.get(`${kmchName} › ${l.labTestName}`) ?? 0) + 1); continue }
              addEntry(target, [l], 0, true)
            }
            continue
          }
          addEntry(kmchName, b.lines, amount ?? 0)
        }
        if (!entries.size) continue

        orders.push({
          key: oKey,
          row: {
            patient_id: patientId, visit_id: visitId, admission_id: admKey ? admissions.get(admKey) : null, ordered_by: doctor.id, status: 'reported', billing_status: 'billed',
            ordered_at: orderedAt, reported_at: reportedAt, verified_at: reportedAt, verified_by: doctor.id, priority: 'routine',
            legacy_request_no: clean(rq.requestNum),
          },
        })
        const rmap = new Map<string, Set<string>>()
        reports.set(oKey, rmap)

        for (const [kmchName, e] of entries) {
          const row = tenantRow(kmchName)
          if (!row) { unknownTest.set(kmchName, (unknownTest.get(kmchName) ?? 0) + 1); continue }
          c.tests++
          const lines = row.lab_master_id ? linesOf.get(row.lab_master_id) ?? [] : []
          const active = lines.filter((l) => l.active)
          const iKey = `labitem:${r.labTestRequestId}:${key(kmchName)}`
          const item: Record<string, unknown> = {
            lab_order_id: oKey, test_id: row.id, price_snapshot: e.price, result_value: null, result_text: null, unit: null,
            flag: 'pending', created_at: orderedAt, ref_low: null, ref_high: null, ref_text: null,
          }
          items.push({ key: iKey, row: item })

          if (active.length) {
            c.panelTests++
            const codes = new Set<string>()
            rmap.set(row.id, codes)
            for (const l of e.lines) {
              const code = active.length === 1 && e.lines.length === 1 ? active[0].code
                : LINE_OVERRIDES[key(kmchName)]?.[key(l.labTestName)] ?? LINE_TO_ANALYTE[key(l.labTestName)]
              const line = code ? lines.find((x) => x.code === code) : undefined
              if (!line) { unplaced.set(`${kmchName} › ${l.labTestName}`, (unplaced.get(`${kmchName} › ${l.labTestName}`) ?? 0) + 1); continue }
              if (codes.has(line.code)) { c.dupLine++; continue }
              codes.add(line.code)
              const raw = clean(l.resultValue)!
              const rangeFrom = RANGE_FROM[line.code]
              const range = rangeFrom ? clean(e.lines.find((x) => key(x.labTestName) === rangeFrom)?.normalRange) : clean(l.normalRange)
              const f = CONVERT[line.code] ?? 1
              let num: number | null = null, text: string | null = null
              if (line.value_type === 'numeric' && isNum(raw)) { num = Number(raw) * f; if (f !== 1) c.converted++ }
              else if (line.allowed) {
                const bare = raw.replace(/'/g, '').replace(/\s+/g, '').toUpperCase()
                text = line.allowed.find((a) => a.replace(/\s+/g, '').toUpperCase() === bare) ?? raw.replace(/''/g, '').trim()
              } else text = txt(raw)
              const pr = parseRange(range)
              const lo = pr.lo !== null ? pr.lo * f : null, hi = pr.hi !== null ? pr.hi * f : null
              const normalText = range && !pr.numericOnly ? (f === 1 ? range : null) : null
              results.push({
                key: `labres:${r.labTestRequestId}:${key(kmchName)}:${line.code}`,
                row: {
                  lab_order_id: oKey, test_id: row.id, analyte_id: line.analyte_id, value_num: num !== null ? Math.round(num * 10000) / 10000 : null,
                  value_text: num !== null ? null : text, unit_ucum: null, ref_low: lo, ref_high: hi, crit_low: null, crit_high: null,
                  flag: rangeFrom
                    ? (num !== null && hi !== null && num > hi ? 'high' : num !== null && lo !== null && num < lo ? 'low' : range ? 'normal' : 'unranged')
                    : flagOf(!!l.highlighted, num, lo, hi, !!range),
                  source: 'manual', analyzer_id: null, entered_by: null,
                  normal_text: normalText, created_at: orderedAt,
                },
              })
              c.values++
              const used = usedLines.get(row.id) ?? new Set<string>()
              used.add(line.code); usedLines.set(row.id, used)
            }
          } else if (e.lines.length === 1) {
            c.oneBox++
            const l = e.lines[0], raw = clean(l.resultValue)!, range = clean(l.normalRange), pr = parseRange(range)
            const num = isNum(raw) ? Number(raw) : null
            Object.assign(item, {
              result_value: num, result_text: num === null ? txt(raw) : null,
              unit: clean(l.uom) && !JUNK_UNIT.test(clean(l.uom)!) ? clean(l.uom) : null,
              ref_low: pr.lo, ref_high: pr.hi, ref_text: range, flag: flagOf(!!l.highlighted, num, pr.lo, pr.hi, !!range),
            })
            c.values++
          } else {
            c.oneBoxText++
            const text = e.lines.map((l) => {
              const u = clean(l.uom) && !JUNK_UNIT.test(clean(l.uom)!) ? ` ${clean(l.uom)}` : ''
              return `${clean(l.labTestName)}: ${clean(l.resultValue)}${u}${clean(l.normalRange) ? ` (${clean(l.normalRange)})` : ''}`
            }).join('\n')
            Object.assign(item, { result_text: txt(text), flag: e.lines.some((l) => l.highlighted) ? 'abnormal' : 'normal' })
            c.values += e.lines.length
          }
        }
      }
    }
  }
  c.created = created.length

  // Old reports that would still show an empty line: active panel lines with no
  // value, other than those never reported in SwiftEHR for that test (which the
  // labopt step makes optional).
  let withGap = 0
  const gapLines = new Map<string, number>()
  const nameOf = new Map([...rowFor.values()].map((r) => [r.id, r.name]))
  for (const [, rmap] of reports) {
    let gap = false
    for (const [testId, codes] of rmap) {
      const row = [...rowFor.values()].find((r) => r.id === testId)!
      for (const l of (linesOf.get(row.lab_master_id!) ?? []).filter((x) => x.active)) {
        if (!usedLines.get(testId)?.has(l.code)) continue // never reported → optional
        if (!codes.has(l.code)) { gap = true; gapLines.set(`${nameOf.get(testId)} › ${l.code}`, (gapLines.get(`${nameOf.get(testId)} › ${l.code}`) ?? 0) + 1) }
      }
    }
    if (gap) withGap++
  }
  return { doctor, created, orders, items, results, c, unplaced, unknownTest, usedLines, rowFor, linesOf, withGap, gapLines }
}

export async function run(t: Tenant, write: boolean): Promise<void> {
  const { doctor, created, orders, items, results, c, unplaced, unknownTest, withGap, gapLines } = await plan(t)
  console.log(`doctor on every order: ${doctor.name}`)
  console.log(`lab orders: ${orders.length} · test lines: ${items.length} · panel values: ${results.length}`)
  console.log('  counts:', c)
  if (created.length) console.log(`  tests added to this hospital's catalogue, switched off: ${created.map((x) => x.row.name).join(', ')}`)
  if (unknownTest.size) console.log('  TESTS WITH NO MATCH:', Object.fromEntries(unknownTest))
  if (unplaced.size) console.log('  LINES WITH NO PLACE:', Object.fromEntries([...unplaced].sort((a, b) => b[1] - a[1])))
  console.log(`  old reports that would still show an empty line: ${withGap}`, Object.fromEntries([...gapLines].sort((a, b) => b[1] - a[1]).slice(0, 15)))
  const span = orders.map((o) => String(o.row.ordered_at)).sort()
  console.log(`  ordered: ${span[0]} … ${span[span.length - 1]}`)
  if (!write) { console.log('dry run — nothing written. Add --write to write.'); return }
  if (unknownTest.size || unplaced.size) throw new Error('Every test and line needs a place before writing.')

  const rc = await logThenInsert(t, STEP, 'lab_tests_catalog', created)
  console.log(`catalogue tests added (switched off): ${rc.inserted} new, ${rc.existing} already there`)
  const testIds = await loggedIds(t, 'lab_tests_catalog')
  for (const i of [...items, ...results]) if (String(i.row.test_id).startsWith('labtest:')) i.row.test_id = testIds.get(String(i.row.test_id))
  const ro = await logThenInsert(t, STEP, 'lab_orders', orders, undefined, 100)
  console.log(`lab orders written: ${ro.inserted} new, ${ro.existing} already there`)
  const orderIds = await loggedIds(t, 'lab_orders')
  for (const i of [...items, ...results]) i.row.lab_order_id = orderIds.get(String(i.row.lab_order_id))
  const ri = await logThenInsert(t, STEP, 'lab_order_items', items)
  console.log(`test lines written: ${ri.inserted} new, ${ri.existing} already there`)
  const rr = await logThenInsert(t, STEP, 'lab_result_analytes', results)
  console.log(`panel values written: ${rr.inserted} new, ${rr.existing} already there`)
}

/** After an undo, each day's accession counter goes back to the highest number still in use. */
async function rewindAccessions(t: Tenant): Promise<void> {
  const rows = await all<{ accession_no: string | null }>((f, to) => db().from('lab_orders').select('accession_no').eq('tenant_id', t.id).order('id').range(f, to))
  const max = new Map<string, number>()
  for (const r of rows) {
    const m = String(r.accession_no ?? '').match(/^(\d{2})(\d{2})(\d{2})(\d{4})$/)
    if (m) { const d = `20${m[1]}-${m[2]}-${m[3]}`; max.set(d, Math.max(max.get(d) ?? 0, Number(m[4]))) }
  }
  const seq = await all<{ day: string; last_no: number }>((f, to) => db().from('lab_accession_seq').select('day, last_no').eq('tenant_id', t.id).order('day').range(f, to))
  let changed = 0
  for (const part of chunks(seq.filter((s) => (max.get(s.day) ?? 0) !== s.last_no), 50)) {
    for (const s of part) {
      const want = max.get(s.day) ?? 0
      const q = db().from('lab_accession_seq')
      const { error } = want === 0 ? await q.delete().eq('tenant_id', t.id).eq('day', s.day) : await q.update({ last_no: want }).eq('tenant_id', t.id).eq('day', s.day)
      if (error) throw new Error(`lab_accession_seq ${s.day} failed: ${error.message}`)
      changed++
    }
  }
  console.log(`  lab_accession_seq: ${changed} days wound back`)
}

export async function undo(t: Tenant): Promise<void> {
  // The orders first would leave lines pointing nowhere; results and lines go first.
  await undoStep(t, STEP, ['lab_result_analytes', 'lab_order_items', 'lab_orders', 'lab_tests_catalog'])
  await rewindAccessions(t)
}
