/*
 * Step 3 — inpatient stays.
 *
 * Every DISCHARGED SwiftEHR stay becomes a discharged Uyirly admission. Stays
 * still open in SwiftEHR are left out: they finish there and come in with the
 * final top-up.
 *
 *  - IP number: a new Uyirly one (IP-<year>-NNNNN) from the stay's own
 *    admission date, drawn by the database as each row goes in, oldest first.
 *    The old FAC-18-n is kept in legacy_ip_no and can be searched.
 *  - Times: SwiftEHR's admissionDate is UTC (it matches the bed start time
 *    +5:30 to the minute on every stay); the discharge time is the bill's.
 *  - Ward: the last SwiftEHR room when the hospital has a ward of that name in
 *    Uyirly (KMCH: 101–105), else none; never a bed (the old bed numbers are
 *    not Uyirly's). The room/bed history goes in the summary. Billed (the old
 *    IP bill comes in the bills step), so nothing offers to bill the stay again.
 *  - reason = the "findings" box, which is where KMCH wrote the diagnosis.
 *  - discharge_summary = the old summary's sections as text under their
 *    headings. The emergency-call footer (the same on every stay) is left out;
 *    Uyirly prints its own.
 *  - Deaths: the time of death is read from the doctor's own "TIME OF DEATH" /
 *    "DECLARED AS DEATH" line and must fall inside the stay. SwiftEHR's closing
 *    time is NOT used for it unless nothing was written (it can be weeks after
 *    the death); then the summary says so (owner's decision: use what exists).
 *  - Progress notes → ipd_progress_notes (doctor / nurse, nursing shift from
 *    the time), filed under the hospital's doctor like every old record (owner's
 *    decision); who wrote it in SwiftEHR starts the note.
 *  - TPR chart → icu_observations, the round chart (°F → °C). A reading in the
 *    first slot before the patient reached the bed is pinned to the admission
 *    time.
 *  - The in-stay medicine chart → one note per stay, as text, NOT as
 *    medication orders (no dose schedule, nothing for the nurses' due list).
 */
import { db, loadItems, ymd, hms, istStamp, scrubText, loggedIds, doctorFor, logThenInsert, undoStep, rewindCounter, type Tenant, type Planned } from '../lib'

const STEP = 'admissions'
const HOUR = 3600_000

/** One line of text: tabs and runs of spaces collapsed. */
const line = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v : v != null ? String(v) : ''
  return s.replace(/[ \t]+/g, ' ').trim() || null
}
/** A block of text: every line trimmed, blank runs collapsed, ends trimmed. */
const block = (v: unknown): string | null => {
  if (typeof v !== 'string') return line(v)
  const lines = v.replace(/\r/g, '').split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim())
  const out: string[] = []
  for (const l of lines) if (l || (out.length && out[out.length - 1] !== '')) out.push(l)
  while (out.length && out[out.length - 1] === '') out.pop()
  return out.join('\n') || null
}
const isNil = (s: string | null) => !s || /^(nil|no|none|na|n\/a|-+|\.+|not known|nothing)\.?$/i.test(s.trim())

/** "28-08-2026 | 12:24 PM" (IST) → timestamp. */
const swiftStamp = (s: unknown): string | null => {
  const d = ymd(s)
  return d ? istStamp(d, hms(s)) : null
}
/** "2026-08-08 05:36:43.0" is UTC. */
const utcStamp = (s: unknown): string | null =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s) ? `${s.slice(0, 10)}T${s.slice(11, 19)}Z` : null
const ms = (s: string) => new Date(s).getTime()

/** Same rule as src/lib/noteKinds.ts shiftOf (KMCH: 07–13, 13–19, 19–07). */
function shiftOf(at: string): 'morning' | 'evening' | 'night' {
  const h = new Date(ms(at) + 5.5 * HOUR).getUTCHours()
  return h >= 7 && h < 13 ? 'morning' : h >= 13 && h < 19 ? 'evening' : 'night'
}

function dischargeType(type: string | null, status: string | null): { type: string | null; atRequest: boolean } {
  const t = (type ?? '').toUpperCase().trim()
  if (/^(PLANNED|PLANED|NORMAL|STABLE)$/.test(t)) return { type: 'normal', atRequest: false }
  if (/^AT REQUEST$/.test(t)) return { type: 'normal', atRequest: true }
  if (/^REFER/.test(t)) return { type: 'referred', atRequest: false }
  if (t === 'DAMA') return { type: 'dama', atRequest: false }
  if (t === 'DEATH') return { type: 'death', atRequest: false }
  if (!t && /transfer/i.test(status ?? '')) return { type: 'referred', atRequest: false }
  return { type: null, atRequest: false }
}

/**
 * The time of death as the doctor wrote it, inside the stay. "TIME OF DEATH"
 * lines win over "DECLARED AS DEATH" lines (one stay has a wrong year in the
 * latter). Returns null when nothing usable was written.
 */
function deathTime(texts: string[], from: number, to: number): string | null {
  const lines = texts.join('\n').toUpperCase().split('\n')
  const ranked = [...lines.filter((l) => /TIME OF DEATH/.test(l)), ...lines.filter((l) => /DECLARED (AS )?DEA(TH|D)/.test(l))]
  for (const l of ranked) {
    const t = l.match(/(\d{1,2})(?:[.:](\d{2}))?\s*([AP])\.?\s*M\b/)
    const d = l.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
    if (!t || !d) continue
    let h = Number(t[1]) % 12
    if (t[3] === 'P') h += 12
    const y = d[3].length === 2 ? `20${d[3]}` : d[3]
    const at = `${y}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}T${String(h).padStart(2, '0')}:${t[2] ?? '00'}:00+05:30`
    if (!Number.isNaN(ms(at)) && ms(at) >= from - HOUR && ms(at) <= to + HOUR) return at
  }
  return null
}
function deathCause(texts: string[]): string | null {
  const lines = texts.join('\n').split('\n').map((l) => l.trim())
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/CAUSE OF DEATH\s*[:\-–]*\s*(.*)$/i)
    if (!m) continue
    const c = m[1].trim() || lines.slice(i + 1).find((l) => l) || ''
    if (c.length >= 3 && c.length <= 300) return c
  }
  return null
}

function medLine(m: any): string {
  const name = [line(m.drugName), line(m.strength), line(m.category)?.toLowerCase()].filter(Boolean).join(' ')
  const slots = (['morning', 'afternoon', 'evening', 'night'] as const)
    .filter((k) => line(m[k]) && line(m[k]) !== '0').map((k) => `${k} ${line(m[k])}`)
  const bits = [line(m.route), line(m.dosage), slots.join(', '), line(m.sos), m.days && `${m.days} days`,
    line(m.foodTiming) && `${line(m.foodTiming)!.toLowerCase()} food`, m.quantity && `× ${m.quantity}`].filter(Boolean)
  return `${name}${bits.length ? ` — ${bits.join(' · ')}` : ''}`
}

const SLOT_HOURS: Record<string, number> = { '6AM': 6, '10AM': 10, '2PM': 14, '6PM': 18, '10PM': 22, '2AM': 26 } // 2 AM ends the chart day
type Obs = { at: string; temp: number | null; hr: number | null; rr: number | null; sbp: number | null; dbp: number | null; glucose: number | null; glucoseNote: string | null; badBp: boolean }

/** The TPR grid: DATE has one entry per day, every other row six slots per day in the same order. */
function tprReadings(chart: any): Obs[] {
  const col: Record<string, { value: unknown }[]> = {}
  for (const r of chart?.data ?? []) col[r.lableName] = r.value ?? []
  const dates = (col['DATE'] ?? []).map((c) => c.value as string)
  const times = (col['TIME'] ?? []).map((c) => c.value as string)
  const at = (k: string, i: number) => line(col[k]?.[i]?.value)
  const num = (s: string | null) => (s && /^\d+(\.\d+)?$/.test(s) ? Number(s) : null)
  const out: Obs[] = []
  times.forEach((slot, i) => {
    const day = ymd(dates[Math.floor(i / 6)])
    if (!day || SLOT_HOURS[slot] === undefined) return
    const f = num(at('TEMPERATURE (°F)', i))
    const hr = num(at('PULSE RATE (Beats Per Minute)', i))
    const rr = num(at('RESPIRATION (Breaths Per Minute)', i))
    const bpRaw = at('BLOOD PRESSURE (mm Hg)', i)
    const bp = bpRaw?.match(/^(\d{2,3})\/(\d{2,3})$/)
    const sbp = bp ? Number(bp[1]) : null, dbp = bp ? Number(bp[2]) : null
    const bpOk = sbp !== null && dbp !== null && sbp >= 50 && sbp <= 260 && dbp >= 20 && dbp <= 160 && sbp > dbp
    const before = num(at('BEFORE FOOD (mg/dL)', i)), after = num(at('AFTER FOOD (mg/dL)', i))
    if (f === null && hr === null && rr === null && !bpRaw && before === null && after === null) return
    const d = new Date(`${day}T00:00:00+05:30`)
    out.push({
      at: new Date(d.getTime() + SLOT_HOURS[slot] * HOUR).toISOString(),
      temp: f !== null && f >= 90 && f <= 110 ? Math.round(((f - 32) * 5 / 9) * 10) / 10 : null,
      hr: hr !== null && hr >= 20 && hr <= 250 ? hr : null,
      rr: rr !== null && rr >= 4 && rr <= 80 ? rr : null,
      sbp: bpOk ? sbp : null, dbp: bpOk ? dbp : null,
      glucose: before ?? after, glucoseNote: before !== null ? 'Sugar before food' : after !== null ? 'Sugar after food' : null,
      badBp: !!bpRaw && !bpOk,
    })
  })
  return out
}

export async function plan(t: Tenant) {
  const patients = await loggedIds(t, 'patients')
  if (!patients.size) throw new Error('Run the patients step first.')
  const doctor = await doctorFor(t)
  // The old room number goes on the stay when the hospital has a ward of that name in Uyirly.
  const { data: wardRows, error: we } = await db().from('wards').select('id, name').eq('tenant_id', t.id)
  if (we) throw new Error(`wards read failed: ${we.message}`)
  const wardByName = new Map((wardRows ?? []).map((w) => [String(w.name).trim().toUpperCase(), w.id as string]))

  const admissions: Planned[] = []
  const notes: Planned[] = []
  const obs: Planned[] = []
  const open: string[] = []
  const deaths: { ip: string; death_at: string; from: string }[] = []
  const types: Record<string, number> = {}
  const c = { doctorNotes: 0, nurseNotes: 0, medCharts: 0, medUndated: 0, obs: 0, obsPinned: 0, badBp: 0, noBill: 0, noPatient: 0, badDates: 0, withReason: 0, withWard: 0, withWeight: 0, deathTimeMissing: 0 }

  for (const it of loadItems<any>('patients')) {
    const p = it.patient, det = it.detail ?? {}
    const names = t.scramble ? [p.patientName, p.firstName, p.lastName, det.incharge1Name, det.parentName, det.relativeFirstName] : []
    const txt = (s: unknown) => (t.scramble ? scrubText(block(s), names) : block(s))

    for (const v of it.visits ?? []) {
      if (!('discharge' in v)) continue
      const vis = v.visit ?? {}, d = v.discharge ?? {}, bill = v.bill?.lines ?? {}
      const ipNo = String(vis.ipNo)
      if (bill.patientDischarged !== true) { open.push(ipNo); continue }
      const patientId = patients.get(`patient:${p.patientId}`)
      if (!patientId) { c.noPatient++; continue }
      const admittedAt = utcStamp(vis.admissionDate)
      const dischargedAt = swiftStamp(bill.dischargeDate) ?? swiftStamp(v.stay?.[v.stay.length - 1]?.endDate)
      if (!admittedAt || !dischargedAt || ms(dischargedAt) < ms(admittedAt)) { c.badDates++; continue }
      if (!v.bill) c.noBill++

      // ── The summary, section by section ──
      const gi = d.generalInformation ?? {}, hopi = d.historyOfPresentIllness ?? {}, ge = d.generalExamination ?? {}
      const se = d.systematicExamination ?? {}, ds = d.dischargeStatus ?? {}
      const past: string[] = []
      for (const s of [gi.previousMedicalIssue, d.knownAllergies, d.preMedCondition].map(txt)) {
        if (!isNil(s) && !past.some((x) => x.toUpperCase() === s!.toUpperCase())) past.push(s!)
      }
      for (const [k, label] of [['historyOfDiabetesMellitus', 'Diabetes'], ['historyOfHypertension', 'Hypertension'], ['historyOfCoronaryArterydisease', 'Coronary artery disease'],
        ['historyOfAsthma', 'Asthma'], ['medical', 'Medical'], ['surgical', 'Surgical']] as const) {
        const s = txt(hopi[k]); if (!isNil(s)) past.push(`${label}: ${s}`)
      }
      const exam = [
        line(ge.pulse ?? ge.generalExaminationHr) && `Pulse ${line(ge.pulse ?? ge.generalExaminationHr)}`, line(ge.bp) && `BP ${line(ge.bp)}`,
        line(ge.temperature) && `Temp ${line(ge.temperature)}`, line(ge.generalExaminationRr) && `RR ${line(ge.generalExaminationRr)}`,
        line(ge.generalExaminationSpo2) && `SpO₂ ${line(ge.generalExaminationSpo2)}`, line(ge.generalExaminationGcs) && `GCS ${line(ge.generalExaminationGcs)}`,
        ge.generalExaminationPatientConscious && 'Conscious', ge.generalExaminationObeying && 'Obeying commands', ge.generalExaminationAfebrile && 'Afebrile',
        ...(['pallor', 'icterus', 'cyanosis', 'clubbing', 'lymphNodes', 'oedemaFeet', 'dehydration', 'oralCavity'] as const)
          .filter((k) => line(ge[k])).map((k) => `${k.replace(/([A-Z])/g, ' $1').toLowerCase()} ${line(ge[k])}`),
      ].filter(Boolean).join(' · ')
      const systems = [
        line(ge.cvs ?? se.systematicExaminationCvs) && `CVS: ${line(ge.cvs ?? se.systematicExaminationCvs)}`,
        line(ge.rs ?? se.systematicExaminationRs) && `RS: ${line(ge.rs ?? se.systematicExaminationRs)}`,
        line(ge.abdomen ?? se.systematicExaminationPa) && `P/A: ${line(ge.abdomen ?? se.systematicExaminationPa)}`,
        line(ge.cns) && `CNS: ${line(ge.cns)}`,
      ].filter(Boolean).join(' · ')
      const atDischarge = [
        line(d.conditionAtDischarge), line(d.patientStatus) && line(d.patientStatus) !== 'Alive' ? line(d.patientStatus) : null,
        ds.ptConscious && 'Conscious', ds.obeying && 'Obeying commands', ds.afebrile && 'Afebrile',
        line(ds.gcs) && `GCS ${line(ds.gcs)}`, line(ds.hr) && `HR ${line(ds.hr)}`, line(ds.dischargeStatusBp) && `BP ${line(ds.dischargeStatusBp)}`,
        line(ds.dischargeStatusTemperature) && `Temp ${line(ds.dischargeStatusTemperature)}`,
        line(ds.dischargeSpo2 ?? ds.saO2) && `SpO₂ ${line(ds.dischargeSpo2 ?? ds.saO2)}`,
        line(ds.dischargeStatusCvs) && `CVS: ${line(ds.dischargeStatusCvs)}`, line(ds.dischargeStatusRs) && `RS: ${line(ds.dischargeStatusRs)}`,
        line(ds.pia) && `P/A: ${line(ds.pia)}`,
      ].filter(Boolean).join(' · ')
      const { type, atRequest } = dischargeType(line(d.dischargeType), line(d.patientStatus))
      types[type ?? 'not recorded'] = (types[type ?? 'not recorded'] ?? 0) + 1
      const dischargeMeds = (d.dischargeMedicine?.medication ?? []).map(medLine)
      // ── Death ──
      let deathAt: string | null = null, deathWritten = true, cause: string | null = null
      if (type === 'death') {
        const texts = [d.courseInTheHospital, d.finalSummary, d.followUp, ...(v.notes?.progressNotes ?? []).map((n: any) => n.notes)].filter((x) => typeof x === 'string')
        deathAt = deathTime(texts, ms(admittedAt), ms(dischargedAt))
        deathWritten = !!deathAt
        cause = deathCause(texts)
        deaths.push({ ip: ipNo, death_at: deathAt ?? dischargedAt, from: deathAt ? 'written by the doctor' : 'NOT WRITTEN — stay closing time used' })
        if (!deathAt) { deathAt = dischargedAt; c.deathTimeMissing++ }
        if (cause && t.scramble) cause = scrubText(cause, names)
      }

      const section = (title: string, body: string | null | false | undefined) => (body ? `${title}\n${body}` : null)
      const rooms = (v.stay ?? []).filter((x: any) => line(x.roomNo) || line(x.bedNo)).map((x: any) =>
        `Room ${line(x.roomNo) ?? '—'} · bed ${line(x.bedNo) ?? '—'} · ${line(x.startDate)?.replace(' | ', ' ') ?? '?'} → ${line(x.endDate)?.replace(' | ', ' ') ?? '?'}${line(x.duration) ? ` (${line(x.duration)})` : ''}`)
      const summary = [
        section('CHIEF COMPLAINT', txt(hopi.cheifComplaint)),
        section('HISTORY OF PRESENT ILLNESS', txt(gi.symptoms)),
        section('PAST HISTORY', past.join('\n')),
        section('KNOWN ALLERGIES', txt(gi.knownAllergies)),
        section('ON EXAMINATION', [exam, systems].filter(Boolean).join('\n')),
        section('SOCIAL HISTORY', txt(d.socialHistory)),
        section('COURSE IN THE HOSPITAL', txt(d.courseInTheHospital)),
        section('TREATMENT GIVEN', txt(d.treatmentGivenDescription)),
        section('FINAL SUMMARY', txt(d.finalSummary)),
        section('CONDITION AT DISCHARGE', atDischarge),
        section('DISCHARGE', [atRequest && 'Discharged at request', line(d.dischargeType) && `SwiftEHR discharge type: ${line(d.dischargeType)}`,
          txt(d.transferReason) && `Transferred: ${txt(d.transferReason)}`,
          type === 'death' && !deathWritten && 'Time of death was not written in SwiftEHR; the time shown is when the stay was closed there.'].filter(Boolean).join('\n')),
        section('MEDICINES ON DISCHARGE', dischargeMeds.map((m: string, i: number) => `${i + 1}. ${m}`).join('\n')),
        section('FOLLOW-UP', txt(d.followUp)),
        !t.scramble && section('REFERRAL DOCTOR', line(d.pdfReferralDoctor)),
        section('ROOM / BED IN SWIFTEHR', rooms.join('\n')),
        `Imported from SwiftEHR · old IP no ${ipNo}${line(d.departmentValue) ? ` · department ${line(d.departmentValue)}` : ''}${!t.scramble && line(d.primaryConsultant) ? ` · consultant ${line(d.primaryConsultant)}` : ''}`,
      ].filter(Boolean).join('\n\n')

      const reason = txt(gi.findings) ?? txt(hopi.cheifComplaint)
      if (reason) c.withReason++
      const lastRoom = line(v.stay?.[v.stay.length - 1]?.roomNo ?? vis.roomNo)
      const wardId = lastRoom ? wardByName.get(lastRoom.toUpperCase()) ?? null : null
      if (wardId) c.withWard++
      const kg = (d.overview ?? []).map((o: any) => Number(o.weight)).find((x: number) => x >= 1 && x <= 300) ?? null
      if (kg) c.withWeight++
      const admKey = `admission:${vis.visitId}`
      admissions.push({
        key: admKey,
        row: {
          patient_id: patientId, admitting_doctor_id: doctor.id, ward_id: wardId, bed_id: null, weight_kg: kg,
          reason, admitted_at: admittedAt, discharged_at: dischargedAt, status: 'discharged', billing_status: 'billed',
          discharge_summary: summary, discharge_type: type, death_at: type === 'death' ? deathAt : null, death_cause: type === 'death' ? cause : null,
          legacy_ip_no: ipNo,
        },
      })

      // ── Progress notes ──
      for (const n of v.notes?.progressNotes ?? []) {
        const at = (() => { const dd = ymd(n.date); return dd ? istStamp(dd, hms(n.time)) : null })()
        const body = txt(n.notes)
        if (!at || !body) continue
        const kind = n.notesBy === 'nurse' ? 'nurse' : 'doctor'
        c[kind === 'nurse' ? 'nurseNotes' : 'doctorNotes']++
        const by = !t.scramble && line(n.addedBy) ? `SwiftEHR · ${line(n.addedBy)}` : 'SwiftEHR'
        notes.push({
          key: `note:${n.progressNotesId}`,
          row: { admission_id: admKey, author_id: doctor.id, note: `${by}\n${body}`, vitals: null, kind, shift: kind === 'nurse' ? shiftOf(at) : null, data: null, created_at: at },
        })
      }

      // ── The in-stay medicine chart, as one note ──
      const byDate = new Map<string, string[]>()
      const add = (date: unknown, s: string) => {
        const k = typeof date === 'string' && date ? date : 'undated'
        const list = byDate.get(k) ?? []
        if (!list.includes(s)) list.push(s)
        byDate.set(k, list)
      }
      for (const m of d.admitMedicine?.medication ?? []) add(m.date ?? m.createdDt, medLine(m))
      // The per-day screen re-serves the stay's chart stamped with the day it was
      // read (the extraction date), so only medicines not already on the chart
      // are kept, under the day they were listed for.
      const charted = new Set((d.admitMedicine?.medication ?? []).map((m: any) => `${line(m.drugName)}|${line(m.strength)}`))
      for (const day of v.days ?? []) {
        const on = ymd(day.date)
        for (const m of day.medication?.medication ?? []) {
          if (!on || charted.has(`${line(m.drugName)}|${line(m.strength)}`)) continue
          add(`${on.slice(8, 10)}-${on.slice(5, 7)}-${on.slice(0, 4)}`, medLine(m))
        }
      }
      const other = (v.chart ?? []).find((x: any) => x.chartName === 'Other Chart')
      const oc: Record<string, { value: unknown }[]> = {}
      for (const r of other?.data ?? []) oc[r.lableName] = r.value ?? []
      ;(oc['ANTIBIOTICS'] ?? []).forEach((cell, i) => {
        const s = line(cell.value)
        if (s) add(oc['DATE']?.[i]?.value, `Antibiotic chart: ${s}`) // one slot per day
      })
      // A date outside the stay is SwiftEHR's "today" stamp, not when it was
      // charted: drop the line if that medicine is charted on a real day,
      // otherwise keep it as undated.
      const first = ymd(new Date(ms(admittedAt) + 5.5 * HOUR).toISOString())!, last = ymd(new Date(ms(dischargedAt) + 5.5 * HOUR).toISOString())!
      const inStay = (k: string) => { const x = ymd(k); return !!x && x >= first && x <= last }
      const drug = (l: string) => l.split(' — ')[0]
      const onRealDays = new Set([...byDate].filter(([k]) => inStay(k)).flatMap(([, ls]) => ls.map(drug)))
      for (const [k, ls] of [...byDate]) {
        if (inStay(k) || k === 'undated') continue
        byDate.delete(k)
        for (const l of ls) if (!onRealDays.has(drug(l))) { c.medUndated++; add('undated', l) }
      }
      if (byDate.size) {
        c.medCharts++
        const days = [...byDate.keys()].sort((a, b) => (ymd(a) ?? '9').localeCompare(ymd(b) ?? '9'))
        notes.push({
          key: `medchart:${vis.visitId}`,
          row: {
            admission_id: admKey, author_id: doctor.id, kind: 'doctor', shift: null, vitals: null, data: null, created_at: admittedAt,
            note: ['SwiftEHR · medicine chart for this stay', ...days.map((k) => `${k === 'undated' ? 'Date not recorded' : k}\n${byDate.get(k)!.map((s) => `- ${s}`).join('\n')}`)].join('\n\n'),
          },
        })
      }

      // ── TPR chart → round chart ──
      const tpr = tprReadings((v.chart ?? []).find((x: any) => x.chartName === 'TPR Chart'))
      tpr.forEach((o, i) => {
        if (o.badBp) c.badBp++
        let at = o.at
        if (ms(at) < ms(admittedAt)) { at = admittedAt; c.obsPinned++ }
        if (ms(at) > ms(dischargedAt)) { at = dischargedAt; c.obsPinned++ }
        if (o.temp === null && o.hr === null && o.rr === null && o.sbp === null && o.glucose === null) return
        c.obs++
        obs.push({
          key: `tpr:${vis.visitId}:${i}`,
          row: {
            admission_id: admKey, recorded_at: at, recorded_by: null, temp: o.temp, hr: o.hr, rr: o.rr, sbp: o.sbp, dbp: o.dbp,
            glucose_mg_dl: o.glucose, glucose_source: o.glucose !== null ? 'capillary' : null,
            notes: ['SwiftEHR TPR chart', o.glucoseNote].filter(Boolean).join(' · '),
          },
        })
      })
    }
  }
  admissions.sort((a, b) => ms(String(a.row.admitted_at)) - ms(String(b.row.admitted_at)))
  return { doctor, admissions, notes, obs, open, deaths, types, c }
}

export async function run(t: Tenant, write: boolean): Promise<void> {
  const { doctor, admissions, notes, obs, open, deaths, types, c } = await plan(t)
  console.log(`doctor on every stay: ${doctor.name}`)
  console.log(`admissions: ${admissions.length} discharged stays · left out (still open in SwiftEHR): ${open.length} ${open.join(', ')}`)
  console.log('  discharge types:', types)
  console.log('  counts:', c)
  console.log(`progress notes: ${notes.length} (incl. ${c.medCharts} medicine charts) · round-chart readings: ${obs.length}`)
  const span = admissions.map((a) => String(a.row.admitted_at)).sort()
  console.log(`  admitted: ${span[0]} … ${span[span.length - 1]}`)
  console.log('  deaths (time of death):')
  for (const x of deaths) console.log(`    ${x.ip}  ${new Date(x.death_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}  ${x.from}`)
  if (c.noPatient || c.badDates) throw new Error(`${c.noPatient} stays have no imported patient, ${c.badDates} have unusable dates`)
  const sample = admissions.find((a) => String(a.row.discharge_summary).includes('COURSE IN THE HOSPITAL') && String(a.row.discharge_summary).includes('MEDICINES ON DISCHARGE'))
  if (sample && t.scramble) console.log('  a summary as it will be written:\n' + String(sample.row.discharge_summary).slice(0, 1500))
  if (!write) { console.log('dry run — nothing written. Add --write to write.'); return }

  const ra = await logThenInsert(t, STEP, 'admissions', admissions, undefined, 100)
  console.log(`admissions written: ${ra.inserted} new, ${ra.existing} already there`)
  const admIds = await loggedIds(t, 'admissions')
  for (const p of [...notes, ...obs]) {
    const id = admIds.get(String(p.row.admission_id))
    if (!id) throw new Error(`no admission for ${p.key}`)
    p.row.admission_id = id
  }
  const rn = await logThenInsert(t, STEP, 'ipd_progress_notes', notes)
  console.log(`progress notes written: ${rn.inserted} new, ${rn.existing} already there`)
  const ro = await logThenInsert(t, STEP, 'icu_observations', obs)
  console.log(`round-chart readings written: ${ro.inserted} new, ${ro.existing} already there`)
}

export async function undo(t: Tenant): Promise<void> {
  await undoStep(t, STEP, ['icu_observations', 'ipd_progress_notes', 'admissions'])
  await rewindCounter(t, { counter: 'ip_no_seq', valueCol: 'last_no', table: 'admissions', numberCol: 'ip_no', pattern: /^IP-(\d{4})-(\d+)$/ })
}
