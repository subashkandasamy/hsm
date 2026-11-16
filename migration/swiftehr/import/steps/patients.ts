/*
 * Step 1 — patients.
 *
 * Every SwiftEHR patient becomes a real Uyirly patient with a new UHID in the
 * year they first registered, numbered in the order of their old numbers:
 *   registered 2024 → <PFX>-UH-2024-00001 …   2025 → <PFX>-UH-2025-00001 …
 *   registered 2026 → drawn from the hospital's own counter (get_next_uhid_for),
 *                     exactly as the registration desk does, so new patients
 *                     carry on after them.
 * get_next_uhid_for only knows the current year, so 2024 and 2025 numbers are
 * written here and those years' counters are set to match.
 *
 * The old number (DRKMCH-123) goes into legacy_uhid and is searchable.
 * WhatsApp/SMS consent is off: nobody agreed to messages from Uyirly.
 *
 * Already registered in Uyirly (both systems in use for a while): a SwiftEHR
 * patient with the same phone AND a matching name (same first name, or a
 * shared name of 3+ letters with ages within 2 years) is LINKED to that
 * patient — no second record; their old number is added to it. Phone alone is
 * never enough: SwiftEHR has whole families on one number. Two possible
 * matches are listed for a person and a new record is made. An undo never
 * deletes a linked patient; it only takes the old number off again.
 */
import { db, migrationApplied, loadItems, ymd, hms, istStamp, fakeName, fakePhone, fakeStreet, logThenInsert, undoStep, rewindCounter, all, loggedIds, SOURCE, type Tenant, type Planned } from '../lib'

const STEP = 'patients'
const LINKED = 'patients-linked'

/** Name words of 3+ letters, upper-cased. */
const words = (s: unknown) => String(s ?? '').toUpperCase().split(/[^A-Z]+/).filter((w) => w.length >= 3)
const yearsApart = (a: unknown, b: unknown) => (a && b ? Math.abs(new Date(String(a)).getTime() - new Date(String(b)).getTime()) / (365.25 * 864e5) : null)
/** Same person? Called only for patients who already share a phone number. */
export function samePerson(a: { full_name: unknown; dob: unknown }, b: { full_name: unknown; dob: unknown }): boolean {
  const wa = words(a.full_name), wb = words(b.full_name)
  if (!wa.length || !wb.length) return false
  const apart = yearsApart(a.dob, b.dob)
  if (apart !== null && apart > 2) return false
  if (wa[0] === wb[0]) return true                          // same first name, ages compatible or unknown
  return apart !== null && wa.some((w) => wb.includes(w))   // a shared name only counts with ages known
}

type SwiftPatient = Record<string, any>
type Item = { patient: SwiftPatient; detail: SwiftPatient | null }

const pick = (it: Item, k: string) => {
  const d = it.detail?.[k]
  return d !== null && d !== undefined && d !== '' ? d : it.patient?.[k]
}
const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '') || null
const codeNo = (code: string) => Number(code.replace(/\D/g, '')) || 0

const GENDER: Record<string, 'male' | 'female' | 'other'> = { male: 'male', female: 'female', others: 'other', other: 'other' }
const BLOOD = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
function bloodGroup(v: unknown): string | null {
  const s = clean(v)?.toUpperCase().replace(/\s/g, '').replace(/VE$/, '')
  return s && BLOOD.has(s) ? s : null
}

/** An exact date of birth if SwiftEHR had one; otherwise one worked out from the age given at registration. */
function birth(it: Item, regDate: string): { dob: string | null; estimated: boolean } {
  const exact = ymd(pick(it, 'dob'))
  if (exact) return { dob: exact, estimated: false }
  const years = Number(pick(it, 'age')) || 0
  const months = Number(pick(it, 'ageInMonth')) || 0
  if (!years && !months) return { dob: null, estimated: false }
  const [y, m, d] = regDate.split('-').map(Number)
  const when = new Date(Date.UTC(y - years, m - 1 - (years ? 0 : months), Math.min(d, 28)))
  return { dob: when.toISOString().slice(0, 10), estimated: true }
}

export function plan(t: Tenant): { planned: Planned[]; perYear: Record<string, number>; items: Item[] } {
  const items = loadItems<Item>('patients').filter((x) => x?.patient?.patientCode)
  const seen = new Set<string>()
  const rows = items
    .filter((it) => !seen.has(it.patient.patientCode) && seen.add(it.patient.patientCode))
    .map((it) => {
      const regDate = ymd(pick(it, 'patientRegDate') ?? pick(it, 'regDate'))
      if (!regDate) throw new Error(`${it.patient.patientCode} has no registration date`)
      return { it, regDate, regTime: hms(pick(it, 'regTime')) }
    })
    // Year from the registration date; inside a year, the order of the old
    // numbers (SwiftEHR handed them out in entry order), so new follows old.
    .sort((a, b) => a.regDate.slice(0, 4).localeCompare(b.regDate.slice(0, 4))
      || codeNo(a.it.patient.patientCode) - codeNo(b.it.patient.patientCode))

  const perYear: Record<string, number> = {}
  const planned: Planned[] = rows.map(({ it, regDate, regTime }) => {
    const year = regDate.slice(0, 4)
    perYear[year] = (perYear[year] ?? 0) + 1
    const gender = GENDER[String(pick(it, 'gender') ?? '').toLowerCase()] ?? null
    const name = clean([pick(it, 'firstName'), pick(it, 'lastName')].filter(Boolean).join(' ')) ?? clean(pick(it, 'patientName')) ?? 'Unknown'
    const phone = String(pick(it, 'phoneNumber') ?? '').replace(/\D/g, '').slice(-10)
    const address = clean(pick(it, 'address'))
    const ecName = clean(pick(it, 'incharge1Name')) ?? clean(pick(it, 'parentName'))
    const ecPhone = String(pick(it, 'incharge1Phone') ?? '').replace(/\D/g, '').slice(-10) || null
    const { dob, estimated } = birth(it, regDate)
    const s = t.scramble
    return {
      key: `patient:${it.patient.patientId}`,
      row: {
        // 2024/2025: numbered here by registration order. 2026: drawn at insert time.
        uhid: year === '2026' ? null : `${t.prefix}-UH-${year}-${String(perYear[year]).padStart(5, '0')}`,
        legacy_uhid: it.patient.patientCode,
        full_name: s ? fakeName(name, gender) : name,
        phone: s ? fakePhone(phone) : phone,
        gender,
        dob,
        dob_estimated: estimated,
        address: address ? (s ? fakeStreet(address) : address) : null,
        district: clean(pick(it, 'city')),
        state: clean(pick(it, 'state')),
        pincode: s ? null : clean(pick(it, 'postalCode')),
        email: s ? null : clean(pick(it, 'email')),
        aadhaar_no: s ? null : clean(pick(it, 'aadharNumber')),
        blood_group: bloodGroup(pick(it, 'bloodGroup')),
        emergency_contact_name: ecName ? (s ? fakeName(ecName, null) : ecName) : null,
        emergency_contact_phone: ecPhone ? (s ? fakePhone(ecPhone) : ecPhone) : null,
        notify_whatsapp_consent: false,
        notify_sms_consent: false,
        self_registered: false,
        created_at: istStamp(regDate, regTime),
        created_by: null,
      },
    }
  })
  return { planned, perYear, items }
}

export async function run(t: Tenant, write: boolean): Promise<void> {
  const { planned, perYear } = plan(t)
  console.log(`patients in the export: ${planned.length}`, perYear)
  const thisYear = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 4)
  if (thisYear !== '2026') throw new Error(`The counter now draws ${thisYear} UHIDs; 2026 patients would get the wrong year. Stop and rethink.`)

  // Nothing of ours may clash with a patient the hospital already has.
  if (!(await migrationApplied())) throw new Error('Migration 0304 is not applied yet (supabase db push).')
  const ours = new Set((await all<{ row_id: string }>((f, to) => db().from('import_log').select('row_id')
    .eq('tenant_id', t.id).eq('table_name', 'patients').order('source_key').range(f, to))).map((r) => r.row_id))
  const existing = await all<{ id: string; uhid: string; legacy_uhid: string | null; full_name: string; phone: string | null; dob: string | null }>((f, to) => db().from('patients')
    .select('id, uhid, legacy_uhid, full_name, phone, dob').eq('tenant_id', t.id).order('id').range(f, to))
  const theirs = existing.filter((p) => !ours.has(p.id))
  const theirUhids = new Set(theirs.map((p) => p.uhid))
  const clashes = planned.filter((p) => p.row.uhid && theirUhids.has(p.row.uhid as string))
  const legacyClash = theirs.filter((p) => p.legacy_uhid)
  console.log(`hospital already has ${theirs.length} patients of its own; ${ours.size} imported earlier`)
  if (clashes.length) throw new Error(`UHID clash with existing patients: ${clashes.slice(0, 5).map((c) => c.row.uhid).join(', ')}`)
  if (legacyClash.length) throw new Error(`${legacyClash.length} existing patients already carry an old number — import ran another way before?`)

  // The same person registered in Uyirly already → link, don't duplicate.
  const imported = await loggedIds(t, 'patients')
  const byPhone = new Map<string, typeof theirs>()
  for (const e of theirs) {
    const ph = String(e.phone ?? '').replace(/\D/g, '').slice(-10)
    if (ph.length === 10) byPhone.set(ph, [...(byPhone.get(ph) ?? []), e])
  }
  const linked: { key: string; id: string; code: string; uhid: string }[] = []
  const ambiguous: string[] = []
  const toWrite = planned.filter((p) => {
    if (imported.has(p.key)) return true
    const ph = String(p.row.phone ?? '').replace(/\D/g, '').slice(-10)
    const cands = (byPhone.get(ph) ?? []).filter((e) => samePerson(e, { full_name: p.row.full_name, dob: p.row.dob }))
    if (cands.length === 1) { linked.push({ key: p.key, id: cands[0].id, code: String(p.row.legacy_uhid), uhid: cands[0].uhid }); return false }
    if (cands.length > 1) ambiguous.push(`${p.row.legacy_uhid} could be ${cands.map((x) => x.uhid).join(' or ')}`)
    return true
  })
  console.log(`already registered in Uyirly — linked, not created: ${linked.length}`, linked.slice(0, 10).map((l) => `${l.code} → ${l.uhid}`))
  if (ambiguous.length) console.log(`  MORE THAN ONE POSSIBLE MATCH (a new record is made; check by hand): ${ambiguous.length}`, ambiguous.slice(0, 10))

  for (const y of Object.keys(perYear).sort()) {
    const ofYear = planned.filter((p) => String(p.row.created_at).startsWith(y))
    const a = ofYear[0].row, z = ofYear[ofYear.length - 1].row
    console.log(`  ${y}: ${ofYear.length} patients, ${a.uhid ?? '(drawn)'} … ${z.uhid ?? '(drawn)'} | old ${a.legacy_uhid} … ${z.legacy_uhid}`)
  }
  const sample = planned[planned.length - 1].row
  console.log('  last row as it will be written:', JSON.stringify(t.scramble ? sample
    : { ...sample, full_name: '(real)', phone: '(real)', address: '(real)', emergency_contact_name: '(real)', emergency_contact_phone: '(real)' }))
  const fill = (k: string) => planned.filter((p) => p.row[k] !== null && p.row[k] !== '').length
  console.log('  filled:', Object.fromEntries(['dob', 'gender', 'address', 'district', 'blood_group', 'emergency_contact_name', 'emergency_contact_phone'].map((k) => [k, fill(k)])),
    `estimated dob: ${planned.filter((p) => p.row.dob_estimated).length}`)
  if (!write) { console.log('dry run — nothing written. Add --write to write.'); return }

  for (const l of linked) {
    const { error: le } = await db().from('import_log').upsert({ tenant_id: t.id, source: SOURCE, table_name: 'patients', source_key: l.key, row_id: l.id, step: LINKED },
      { onConflict: 'tenant_id,source,table_name,source_key', ignoreDuplicates: true })
    if (le) throw new Error(`import_log write failed: ${le.message}`)
    const { error } = await db().from('patients').update({ legacy_uhid: l.code }).eq('tenant_id', t.id).eq('id', l.id).is('legacy_uhid', null)
    if (error) throw new Error(`linking ${l.code} failed: ${error.message}`)
  }
  if (linked.length) console.log(`linked: ${linked.length}`)
  const res = await logThenInsert(t, STEP, 'patients', toWrite, async (row) => {
    if (row.uhid) return
    const { data, error } = await db().rpc('get_next_uhid_for', { p_tenant_id: t.id })
    if (error || !data) throw new Error(`could not draw a UHID: ${error?.message}`)
    row.uhid = data
  })
  console.log(`written: ${res.inserted} new, ${res.existing} already there`)

  // Keep the 2024/2025 counters level with the numbers written.
  for (const y of ['2024', '2025']) {
    if (!perYear[y]) continue
    const { data: cur } = await db().from('uhid_counter').select('last_val').eq('tenant_id', t.id).eq('year', Number(y)).maybeSingle()
    const want = Math.max(Number(cur?.last_val ?? 0), perYear[y])
    const { error } = await db().from('uhid_counter').upsert({ tenant_id: t.id, year: Number(y), last_val: want }, { onConflict: 'tenant_id,year' })
    if (error) throw new Error(`uhid_counter ${y} failed: ${error.message}`)
    console.log(`  uhid_counter ${y} = ${want}`)
  }
}

export async function undo(t: Tenant): Promise<void> {
  // Linked patients were the hospital's own: only their old number comes off.
  const links = await all<{ source_key: string; row_id: string }>((f, to) => db().from('import_log').select('source_key, row_id')
    .eq('tenant_id', t.id).eq('source', SOURCE).eq('step', LINKED).order('source_key').range(f, to))
  for (const l of links) {
    await db().from('patients').update({ legacy_uhid: null }).eq('tenant_id', t.id).eq('id', l.row_id)
    await db().from('import_log').delete().eq('tenant_id', t.id).eq('source', SOURCE).eq('table_name', 'patients').eq('source_key', l.source_key)
  }
  if (links.length) console.log(`  unlinked ${links.length} patients the hospital had registered itself`)
  await undoStep(t, STEP, ['patients'])
  await rewindCounter(t, { counter: 'uhid_counter', valueCol: 'last_val', table: 'patients', numberCol: 'uhid', pattern: /-UH-(\d{4})-(\d+)$/ })
}
