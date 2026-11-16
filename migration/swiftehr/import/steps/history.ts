/*
 * Step 10 — allergies and past illnesses.
 *
 * Allergies → patient_allergies, the list the prescribing safety check reads.
 * Only real allergies: SwiftEHR's allergy boxes are mostly "NIL" / "no known
 * allergy", and its discharge "known allergies" box (d.knownAllergies) held
 * comorbidities, not allergies — those go to past history instead. "SUGAR"
 * in an allergy box reads as diabetes, so it is history, said so.
 *
 * Past illnesses → patient_history (one row per patient): every distinct
 * past-history entry from OP visits (preMedCondition) and discharge
 * summaries (previous medical issue, comorbidities, the DM/HTN/CAD/asthma
 * flags), newest first, each with the date it was written; surgical history
 * → past_surgical; the discharge "medical" box (regular medicines) → drug_history. A patient who already has a history row is left alone.
 */
import { db, all, loadItems, ymd, scrubText, loggedIds, logThenInsert, undoStep, SOURCE, type Tenant, type Planned } from '../lib'

const STEP = 'history'
const block = (v: unknown) => (typeof v === 'string' ? v.replace(/\r/g, '').split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('; ') : '') || null
const isNil = (s: string | null) => !s || /^(nil|no|none|na|n\/a|-+|\.+|not known|nothing|no h\/o .*|not known .*|no known .*|no comorbid.*|not known comorbid.*|nil comorbid.*)\.?$/i.test(s.trim())
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
/** "OFLOXACIN\nMEFTAL SPAS" → two allergens; "ALLERGY TO MUTTON" → Mutton. */
function allergens(raw: string): string[] {
  return raw.replace(/\r/g, '').split(/\n|,|\/| AND /i).map((x) => x.replace(/^(H\/O\s*)?ALLERG(Y|IC)\s*(TO)?\s*/i, '').replace(/\s+/g, ' ').trim())
    .filter((x) => x && !isNil(x)).map((x) => x.charAt(0) + x.slice(1).toLowerCase())
}

export async function plan(t: Tenant) {
  const patients = await loggedIds(t, 'patients')
  if (!patients.size) throw new Error('Run the patients step first.')
  const allergyRows: Planned[] = [], historyRows: { pid: string; row: Record<string, unknown> }[] = []
  const c = { patientsWithHistory: 0, entries: 0, surgical: 0, allergies: 0, sugarAsHistory: 0 }
  const existingHistory = new Set((await all<{ patient_id: string }>((f, to) => db().from('patient_history').select('patient_id').eq('tenant_id', t.id).order('patient_id').range(f, to))).map((r) => r.patient_id))

  for (const it of loadItems<any>('patients')) {
    const p = it.patient, det = it.detail ?? {}
    const pid = patients.get(`patient:${p.patientId}`)
    if (!pid) continue
    const names = t.scramble ? [p.patientName, p.firstName, p.lastName, det.incharge1Name, det.parentName, det.relativeFirstName] : []
    const txt = (s: string | null) => (t.scramble && s ? scrubText(s, names) : s)
    const medical = new Map<string, { text: string; day: string }>(), surgical = new Map<string, { text: string; day: string }>(), drugs = new Map<string, { text: string; day: string }>()
    const addTo = (m: Map<string, { text: string; day: string }>, raw: unknown, day: string | null) => {
      const s = block(raw)
      if (isNil(s)) return
      // A medicine list typed into a history box is drug history (T./TAB/INJ…, or 1-0-1 doses).
      if (m === medical && /\b(T|TAB|CAP|INJ|SYP|SYR)\s*[.:]|\b\d\s*-\s*\d\s*-\s*\d\b/i.test(s!)) m = drugs
      const k = norm(s!), cur = m.get(k)
      if (!cur || (day ?? '') > cur.day) m.set(k, { text: s!, day: day ?? '' })
    }
    const allergySet = new Map<string, { name: string; where: string }>()
    const addAllergy = (raw: unknown, where: string) => {
      const s = typeof raw === 'string' ? raw.trim() : ''
      if (isNil(block(s))) return
      if (/^SUGAR$/i.test(s)) { c.sugarAsHistory++; addTo(medical, 'SUGAR (written in the allergy box in SwiftEHR)', null); return }
      for (const a of allergens(s)) if (!allergySet.has(norm(a))) allergySet.set(norm(a), { name: a, where })
    }
    addAllergy(det.knownAllergies, 'patient record')

    for (const v of it.visits ?? []) {
      if ('discharge' in v) {
        const d = v.discharge ?? {}, gi = d.generalInformation ?? {}, h = d.historyOfPresentIllness ?? {}
        const day = ymd(v.visit?.visitDate)
        addAllergy(gi.knownAllergies, `discharge summary ${v.visit?.ipNo}`)
        for (const x of [gi.previousMedicalIssue, d.knownAllergies, d.preMedCondition]) addTo(medical, x, day)
        // SwiftEHR's "medical" box held the regular medicines, not illnesses.
        addTo(drugs, h.medical, day)
        for (const [k, label] of [['historyOfDiabetesMellitus', 'Diabetes'], ['historyOfHypertension', 'Hypertension'], ['historyOfCoronaryArterydisease', 'Coronary artery disease'], ['historyOfAsthma', 'Asthma']] as const) {
          const s = block(h[k]); if (!isNil(s)) addTo(medical, `${label}: ${s}`, day)
        }
        addTo(surgical, h.surgical, day)
      } else {
        const e = v.caseSheet?.encounter ?? {}
        addTo(medical, e.preMedCondition ?? e.preMedCond, ymd(e.date) ?? ymd(v.visit?.visitDate))
      }
    }

    // Severity and reaction were never recorded; 'moderate' is the table's own default.
    for (const [k, a] of allergySet) {
      c.allergies++
      allergyRows.push({ key: `allergy:${p.patientId}:${k}`, row: { patient_id: pid, allergen: a.name, reaction: `Recorded in SwiftEHR (${a.where}); reaction not recorded`, severity: 'moderate', recorded_by: null } })
    }
    if ((medical.size || surgical.size || drugs.size) && !existingHistory.has(pid)) {
      const lines = (m: Map<string, { text: string; day: string }>) => [...m.values()].sort((a, z) => z.day.localeCompare(a.day))
        .map((x) => `${txt(x.text)}${x.day ? ` (SwiftEHR, ${x.day.split('-').reverse().join('-')})` : ' (SwiftEHR)'}`).join('\n') || null
      c.patientsWithHistory++; c.entries += medical.size; c.surgical += surgical.size
      historyRows.push({ pid, row: { patient_id: pid, past_medical: lines(medical), past_surgical: lines(surgical), family_history: null, social_history: null, drug_history: lines(drugs), updated_by: null } })
    }
  }
  return { allergyRows, historyRows, c }
}

export async function run(t: Tenant, write: boolean): Promise<void> {
  const { allergyRows, historyRows, c } = await plan(t)
  console.log(`allergies: ${allergyRows.length} · patients with past history: ${historyRows.length}`, c)
  for (const a of allergyRows) console.log('  allergy:', a.row.allergen, '·', a.row.reaction)
  const sample = historyRows.find((h) => String(h.row.past_medical).includes('\n'))
  if (sample && t.scramble) console.log('  a history as it will be written:\n' + String(sample.row.past_medical).split('\n').slice(0, 5).map((l) => '    ' + l).join('\n'))
  if (!write) { console.log('dry run — nothing written. Add --write to write.'); return }
  const ra = await logThenInsert(t, STEP, 'patient_allergies', allergyRows)
  console.log(`allergies written: ${ra.inserted} new, ${ra.existing} already there`)
  // patient_history is keyed by patient (no id column): logged with the patient id.
  let n = 0
  for (const h of historyRows) {
    const { error: le } = await db().from('import_log').upsert({ tenant_id: t.id, source: SOURCE, table_name: 'patient_history', source_key: `history:${h.pid}`, row_id: h.pid, step: STEP },
      { onConflict: 'tenant_id,source,table_name,source_key', ignoreDuplicates: true })
    if (le) throw new Error(`import_log write failed: ${le.message}`)
    const { error } = await db().from('patient_history').upsert({ ...h.row, tenant_id: t.id }, { onConflict: 'patient_id', ignoreDuplicates: true })
    if (error) throw new Error(`patient_history write failed: ${error.message}`)
    n++
  }
  console.log(`past histories written: ${n}`)
}

export async function undo(t: Tenant): Promise<void> {
  await undoStep(t, STEP, ['patient_allergies'])
  const logged = await all<{ source_key: string; row_id: string }>((f, to) => db().from('import_log').select('source_key, row_id')
    .eq('tenant_id', t.id).eq('source', SOURCE).eq('step', STEP).eq('table_name', 'patient_history').order('source_key').range(f, to))
  for (let i = 0; i < logged.length; i += 100) {
    const part = logged.slice(i, i + 100)
    const { error } = await db().from('patient_history').delete().eq('tenant_id', t.id).in('patient_id', part.map((r) => r.row_id))
    if (error) throw new Error(`undo patient_history failed: ${error.message}`)
    await db().from('import_log').delete().eq('tenant_id', t.id).eq('source', SOURCE).eq('table_name', 'patient_history').in('source_key', part.map((r) => r.source_key))
  }
  console.log(`  undone patient_history: ${logged.length} rows`)
}
