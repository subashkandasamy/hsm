/*
 * Shared pieces of the SwiftEHR history import.
 *
 * Every write goes through `logThenInsert`: the import_log row (old key → new
 * row id) is written FIRST, then the row itself. A re-run finds the log and
 * skips rows that exist; `undo` deletes exactly the logged rows. Nothing else
 * in the hospital is touched.
 *
 * KMCH (slug karur) is the paying customer. Writing there needs --kmch-approved,
 * which is passed only after the owner says so for that step.
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const SOURCE = 'swiftehr'
export const RAW = path.join(__dirname, '..', 'raw')
const ROOT = path.join(__dirname, '..', '..', '..')

// ── Command line ────────────────────────────────────────────────────────────
export type Args = { step: string; tenant: string; write: boolean; undo: boolean; kmchApproved: boolean }
export function parseArgs(argv: string[]): Args {
  const flag = (f: string) => argv.includes(f)
  const val = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
  const step = argv.find((a) => !a.startsWith('--') && a !== val('--tenant')) ?? ''
  return { step, tenant: val('--tenant') ?? '', write: flag('--write'), undo: flag('--undo'), kmchApproved: flag('--kmch-approved') }
}

// ── Database (service role, read from .env.local at run time only) ──────────
let client: SupabaseClient | null = null
export function db(): SupabaseClient {
  if (client) return client
  const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
  client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  return client
}

export type Tenant = { id: string; slug: string; scramble: boolean; prefix: string }
/** Only demo (rehearsal, scrambled) and karur (real, only with --kmch-approved). */
export async function resolveTenant(a: Args): Promise<Tenant> {
  if (a.tenant !== 'demo' && a.tenant !== 'karur') throw new Error('--tenant must be demo or karur')
  if (a.tenant === 'karur' && (a.write || a.undo) && !a.kmchApproved) {
    throw new Error('Writing to KMCH needs --kmch-approved, given only after the owner approves this step.')
  }
  const { data, error } = await db().from('tenants').select('id, slug').eq('slug', a.tenant).single()
  if (error || !data) throw new Error(`tenant ${a.tenant} not found`)
  const { data: prefix, error: pe } = await db().rpc('tenant_doc_prefix', { p_tenant_id: data.id })
  if (pe || !prefix) throw new Error('could not read the hospital prefix')
  return { id: data.id as string, slug: data.slug as string, scramble: a.tenant === 'demo', prefix: prefix as string }
}

/** Every row of a query, 1,000 at a time. A failed read stops the run. */
export async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let f = 0; ; f += 1000) {
    const { data, error } = await q(f, f + 999)
    if (error) throw new Error(`read failed: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

export function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

// ── The export files ────────────────────────────────────────────────────────
/** All items of every part-file whose name starts with `swiftehr-<kind>-`. */
export function loadItems<T = any>(kind: string): T[] {
  const files = fs.readdirSync(RAW).filter((f) => f.startsWith(`swiftehr-${kind}-`) && f.endsWith('.json')).sort()
  if (!files.length) throw new Error(`no ${kind} files in ${RAW}`)
  return files.flatMap((f) => (JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')).items ?? []) as T[])
}

// ── Dates (SwiftEHR writes DD-MM-YYYY and 12-hour times, all IST) ───────────
export function ymd(s: unknown): string | null {
  if (typeof s !== 'string') return null
  let m = s.match(/^(\d{2})-(\d{2})-(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}
/** "22:22:28", "10:09 AM", "06:18 PM" → "HH:MM:SS" (24-hour). */
export function hms(s: unknown): string | null {
  if (typeof s !== 'string') return null
  const m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i)
  if (!m) return null
  let h = Number(m[1])
  if (m[4]) { const pm = m[4].toUpperCase() === 'PM'; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12 }
  return `${String(h).padStart(2, '0')}:${m[2]}:${m[3] ?? '00'}`
}
/** An IST date and time as a timestamp with the +05:30 offset spelled out. */
export function istStamp(date: string, time: string | null): string {
  return `${date}T${time ?? '00:00:00'}+05:30`
}

// ── Scrambling for the demo rehearsal ───────────────────────────────────────
// Real KMCH patients never land on demo. Names, phones, addresses and contact
// people are replaced with stable fakes: the same real value always gives the
// same fake, so families sharing a phone still share one on demo.
const h = (s: string) => crypto.createHash('sha256').update(`uyirly-demo:${s}`).digest()
const MALE = ['Arun', 'Bala', 'Chandran', 'Dinesh', 'Ganesh', 'Hari', 'Ilango', 'Jagan', 'Kumar', 'Mani', 'Naveen', 'Prakash', 'Raja', 'Senthil', 'Tamil', 'Vel', 'Vijay', 'Yogesh']
const FEMALE = ['Anitha', 'Bhuvana', 'Chitra', 'Deepa', 'Gowri', 'Indira', 'Jaya', 'Kavitha', 'Lakshmi', 'Meena', 'Nithya', 'Priya', 'Revathi', 'Sangeetha', 'Thenmozhi', 'Uma', 'Vasuki', 'Yamuna']
const INITIALS = 'ABCDEGKMNPRSTV'
export function fakeName(real: string, gender: string | null): string {
  const b = h(`name:${real}`)
  const list = gender === 'female' ? FEMALE : MALE
  return `${list[b[0] % list.length]} ${INITIALS[b[1] % INITIALS.length]}`
}
/** Starts with 5, which no Indian mobile number does, so it can never reach a real person. */
export function fakePhone(real: string): string {
  const b = h(`phone:${real}`)
  return '5' + Array.from(b.subarray(0, 9), (x) => String(x % 10)).join('')
}
export function fakeStreet(real: string): string {
  return `${(h(`addr:${real}`).readUInt16BE(0) % 200) + 1}, Test Street`
}

/**
 * Free text on demo: a patient's (or relative's) real name and any phone
 * number are blanked out of notes, complaints and summaries.
 */
export function scrubText(text: string | null, realNames: (string | null | undefined)[]): string | null {
  if (!text) return text
  let out = text.replace(/(?<!\d)\d{10}(?!\d)/g, '##########')
  const words = new Set(realNames.flatMap((n) => (n ?? '').toUpperCase().split(/[^A-Z]+/)).filter((w) => w.length >= 3))
  for (const w of words) out = out.replace(new RegExp(`\\b${w}\\b`, 'gi'), '[name]')
  return out
}

/** row ids already written by an earlier step, by old key (e.g. 'patient:240396'). */
export async function loggedIds(t: Tenant, table: string): Promise<Map<string, string>> {
  const rows = await all<{ source_key: string; row_id: string }>((f, to) => db().from('import_log')
    .select('source_key, row_id').eq('tenant_id', t.id).eq('source', SOURCE).eq('table_name', table).order('source_key').range(f, to))
  return new Map(rows.map((r) => [r.source_key, r.row_id]))
}

/**
 * The doctor every old record is filed under. KMCH: Dr karthikeyan (admin who
 * sees patients — the only doctor in SwiftEHR, incl. "Dr.Karthik DMO").
 * Demo: the first active doctor by name.
 */
export async function doctorFor(t: Tenant): Promise<{ id: string; name: string }> {
  if (t.slug === 'karur') {
    const { data } = await db().from('profiles').select('id, full_name, role, sees_patients, is_active')
      .eq('id', 'e6fe6c61-1f37-4b23-8a7c-96e3f3448a13').eq('tenant_id', t.id).single()
    if (!data || !data.is_active || !(data.role === 'doctor' || (data.role === 'admin' && data.sees_patients))) {
      throw new Error('Dr karthikeyan is not an active doctor on KMCH any more')
    }
    return { id: data.id as string, name: data.full_name as string }
  }
  const { data } = await db().from('profiles').select('id, full_name').eq('tenant_id', t.id)
    .eq('role', 'doctor').eq('is_active', true).order('full_name').limit(1).single()
  if (!data) throw new Error('no active doctor on demo')
  return { id: data.id as string, name: data.full_name as string }
}

// ── The import log ──────────────────────────────────────────────────────────
/** True once migration 0304 (import_log, legacy_uhid, legacy_ip_no, old months) is in the database. */
export async function migrationApplied(): Promise<boolean> {
  const { error } = await db().from('import_log').select('row_id').limit(1)
  return !error
}

export type Planned = { key: string; row: Record<string, unknown> & { id?: string } }

/**
 * Writes `planned` rows into `table`, skipping any already imported.
 * `finish(row)` runs just before a NEW row is inserted (e.g. to draw a UHID),
 * so nothing is drawn for rows that already exist.
 * Returns how many were inserted and how many already existed.
 */
export async function logThenInsert(
  t: Tenant, step: string, table: string, planned: Planned[],
  finish?: (row: Record<string, unknown>) => Promise<void>, batch = 200,
): Promise<{ inserted: number; existing: number }> {
  let inserted = 0, existing = 0
  for (const part of chunks(planned, batch)) {
    // 1. Log first. A key already logged keeps the id it was given then.
    const logRows = part.map((p) => ({
      tenant_id: t.id, source: SOURCE, table_name: table, source_key: p.key, row_id: crypto.randomUUID(), step,
    }))
    const { error: le } = await db().from('import_log')
      .upsert(logRows, { onConflict: 'tenant_id,source,table_name,source_key', ignoreDuplicates: true })
    if (le) throw new Error(`import_log write failed: ${le.message}`)
    const { data: logged, error: re } = await db().from('import_log').select('source_key, row_id')
      .eq('tenant_id', t.id).eq('source', SOURCE).eq('table_name', table).in('source_key', part.map((p) => p.key))
    if (re || !logged) throw new Error(`import_log read failed: ${re?.message}`)
    const idOf = new Map(logged.map((r) => [r.source_key as string, r.row_id as string]))

    // 2. Which of those rows are already there (a previous run got that far)?
    const ids = part.map((p) => idOf.get(p.key)!)
    const { data: have, error: he } = await db().from(table).select('id').in('id', ids)
    if (he) throw new Error(`${table} read failed: ${he.message}`)
    const present = new Set((have ?? []).map((r) => r.id as string))

    // 3. Insert the rest with the logged ids.
    const rows: Record<string, unknown>[] = []
    for (const p of part) {
      const id = idOf.get(p.key)!
      if (present.has(id)) { existing++; continue }
      const row = { ...p.row, id, tenant_id: t.id }
      if (finish) await finish(row)
      rows.push(row)
    }
    if (rows.length) {
      const { error: ie } = await db().from(table).insert(rows)
      if (ie) throw new Error(`${table} insert failed: ${ie.message}`)
      inserted += rows.length
    }
  }
  return { inserted, existing }
}

/** Deletes every row a step wrote (in the order of `tables`), then its log. */
export async function undoStep(t: Tenant, step: string, tables: string[]): Promise<void> {
  for (const table of tables) {
    const logged = await all<{ source_key: string; row_id: string }>((f, to) => db().from('import_log')
      .select('source_key, row_id').eq('tenant_id', t.id).eq('source', SOURCE).eq('step', step).eq('table_name', table)
      .order('source_key').range(f, to))
    for (const part of chunks(logged, 200)) {
      const { error } = await db().from(table).delete().eq('tenant_id', t.id).in('id', part.map((r) => r.row_id))
      if (error) throw new Error(`undo ${table} failed: ${error.message}`)
      const { error: le } = await db().from('import_log').delete()
        .eq('tenant_id', t.id).eq('source', SOURCE).eq('table_name', table).in('source_key', part.map((r) => r.source_key))
      if (le) throw new Error(`undo import_log failed: ${le.message}`)
    }
    console.log(`  undone ${table}: ${logged.length} rows`)
  }
}
