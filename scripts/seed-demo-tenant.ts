/**
 * The demo hospital — the tenant every guide screenshot is taken from.
 *
 *   npx tsx scripts/seed-demo-tenant.ts
 *
 * Why a tenant of its own, rather than screenshotting a working one: every
 * screenshot published on the marketing site is public and gets indexed, and a
 * real tenant holds real patients — names, mobile numbers, Aadhaar. Nothing in
 * here is a real person. Names are common Indian names, the mobile numbers are
 * a fictional 99999 block, and no Aadhaar is stored at all.
 *
 * It is also re-runnable. Running it again wipes the demo tenant and rebuilds it
 * from scratch, so when the UI changes the screenshots can simply be retaken
 * against identical data.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY: row security is bypassed on purpose here.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// .env.local is not loaded for a bare tsx run.
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!URL_ || !SVC) { console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const db = createClient(URL_, SVC, { auth: { autoRefreshToken: false, persistSession: false } })

export const DEMO_SLUG = 'demo'
const DEMO_NAME = 'Uyirly Demo Hospital'
/** Everyone signs in with this, so a screenshot session is one login away. */
const DEMO_PASSWORD = 'DemoHospital#2026'
const uuid = () => crypto.randomUUID()

const ok = (label: string, error: { message: string } | null) => {
  if (error) { console.error(`  ✗ ${label}: ${error.message}`); process.exit(1) }
  console.log(`  ✓ ${label}`)
}

/** YYYY-MM-DD, n days from today. */
function day(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}
const yearsAgo = (n: number, monthDay = '-04-12') => `${new Date().getFullYear() - n}${monthDay}`

// ── 1. Start clean ───────────────────────────────────────────────────────────

async function wipe(): Promise<void> {
  const { data: t } = await db.from('tenants').select('id').eq('slug', DEMO_SLUG).maybeSingle()
  if (!t) { console.log('  ✓ no existing demo tenant'); return }
  const tenantId = t.id as string

  const { data: profs } = await db.from('profiles').select('id').eq('tenant_id', tenantId)
  const userIds = (profs ?? []).map((p) => p.id as string)

  // purge_tenant_data clears the tables that do not cascade; the tenant row then
  // takes the rest with it.
  const { error: purgeErr } = await db.rpc('purge_tenant_data', { p_tenant_id: tenantId })
  if (purgeErr) console.log(`  · purge_tenant_data: ${purgeErr.message} (continuing)`)
  await db.from('tenants').delete().eq('id', tenantId)
  for (const id of userIds) await db.auth.admin.deleteUser(id).catch(() => {})
  console.log(`  ✓ removed the previous demo tenant (${userIds.length} logins)`)
}

// ── 2. Tenant + staff ────────────────────────────────────────────────────────

/** status 'active' on purpose: a trial banner across the top of every screenshot. */
async function createTenant(): Promise<string> {
  const id = uuid()
  ok('tenant', (await db.from('tenants').insert({
    id, name: DEMO_NAME, slug: DEMO_SLUG,
    plan: 'growth', status: 'active',
    city: 'Chennai',
    terms_accepted_at: new Date().toISOString(),
    onboarding_dismissed_at: new Date().toISOString(),
  })).error)
  return id
}

interface Dept { id: string; name: string; template: string }

/** Each department carries the clinical template its specialty actually needs. */
async function createDepartments(tenantId: string): Promise<Dept[]> {
  const spec: [string, string][] = [
    ['General Medicine', 'general'],
    ['Paediatrics', 'paediatrics'],
    ['Gynaecology', 'obgyn'],
    ['Ophthalmology', 'ophthalmology'],
    ['Dental', 'dental'],
    ['Orthopaedics', 'general'],
    ['Surgery', 'general'],
    ['Emergency', 'general'],
    ['Pathology / Laboratory', 'general'],
    ['Radiology', 'general'],
    ['Pharmacy', 'general'],
  ]
  const rows = spec.map(([name, template]) => ({ id: uuid(), tenant_id: tenantId, name, clinical_template: template }))
  ok(`${rows.length} departments`, (await db.from('departments').insert(rows)).error)
  return rows.map((r) => ({ id: r.id, name: r.name, template: r.clinical_template }))
}

interface Staff { id: string; email: string; name: string; role: string }

async function createStaff(tenantId: string, depts: Dept[]): Promise<Staff[]> {
  const dept = (name: string) => depts.find((d) => d.name === name)?.id ?? null
  const spec: Array<{ name: string; role: string; dept: string | null; sees?: boolean }> = [
    { name: 'Dr. Meena Raghavan',  role: 'admin',        dept: 'General Medicine', sees: true },
    { name: 'Dr. Arun Prakash',    role: 'doctor',       dept: 'General Medicine' },
    { name: 'Dr. Kavitha Suresh',  role: 'doctor',       dept: 'Paediatrics' },
    { name: 'Dr. Lakshmi Iyer',    role: 'doctor',       dept: 'Gynaecology' },
    { name: 'Dr. Vignesh Kumar',   role: 'doctor',       dept: 'Ophthalmology' },
    { name: 'Sister Anitha John',  role: 'nurse',        dept: null },
    { name: 'Sister Radha Devi',   role: 'nurse',        dept: null },
    { name: 'Ramesh Babu',         role: 'pharmacist',   dept: 'Pharmacy' },
    { name: 'Priya Nandini',       role: 'receptionist', dept: null },
    { name: 'Suresh Anand',        role: 'lab_tech',     dept: 'Pathology / Laboratory' },
    { name: 'Deepa Krishnan',      role: 'accountant',   dept: null },
  ]

  const out: Staff[] = []
  for (const [i, s] of spec.entries()) {
    const email = `${s.role}${i === 0 ? '' : i}@demo.uyirly.com`
    const { data, error } = await db.auth.admin.createUser({
      email, password: DEMO_PASSWORD, email_confirm: true,
      user_metadata: { full_name: s.name },
    })
    if (error || !data.user) { console.error(`  ✗ login for ${s.name}: ${error?.message}`); process.exit(1) }
    const { error: pErr } = await db.from('profiles').insert({
      id: data.user.id, tenant_id: tenantId, full_name: s.name, role: s.role,
      department_id: s.dept ? dept(s.dept) : null,
      phone: `+919999900${String(100 + i)}`,
      is_active: true,
      ...(s.sees ? { sees_patients: true } : {}),
    })
    if (pErr) { console.error(`  ✗ profile for ${s.name}: ${pErr.message}`); process.exit(1) }
    out.push({ id: data.user.id, email, name: s.name, role: s.role })
  }
  ok(`${out.length} staff logins`, null)
  return out
}

// ── 3. Rooms and beds ────────────────────────────────────────────────────────

async function createWards(tenantId: string, depts: Dept[]): Promise<void> {
  const units = [
    { id: uuid(), tenant_id: tenantId, block: 'A', floor: '1', wing: 'East',  station_name: 'Station 1', target_ratio: 6 },
    { id: uuid(), tenant_id: tenantId, block: 'A', floor: '2', wing: 'West',  station_name: 'Station 2', target_ratio: 6 },
    { id: uuid(), tenant_id: tenantId, block: 'B', floor: '1', wing: 'ICU',   station_name: 'ICU Desk',  target_ratio: 1 },
  ]
  ok('3 nursing units', (await db.from('nursing_units').insert(units)).error)

  const types = [
    { id: uuid(), tenant_id: tenantId, name: 'General Ward', daily_rate: 1200, is_multi_bed: true,  is_icu: false },
    { id: uuid(), tenant_id: tenantId, name: 'Semi-Private', daily_rate: 2500, is_multi_bed: true,  is_icu: false },
    { id: uuid(), tenant_id: tenantId, name: 'Private AC',   daily_rate: 4500, is_multi_bed: false, is_icu: false },
    { id: uuid(), tenant_id: tenantId, name: 'ICU',          daily_rate: 9000, is_multi_bed: true,  is_icu: true  },
    { id: uuid(), tenant_id: tenantId, name: 'Labour Room',  daily_rate: 3500, is_multi_bed: false, is_icu: false },
  ]
  ok('5 room types', (await db.from('ward_room_types').insert(types)).error)

  const dept = (n: string) => depts.find((d) => d.name === n)?.id ?? null
  const type = (n: string) => types.find((t) => t.name === n)!
  const spec: Array<{ name: string; type: string; unit: number; dept: string | null; beds: number }> = [
    { name: 'Male General Ward',   type: 'General Ward', unit: 0, dept: 'General Medicine', beds: 8 },
    { name: 'Female General Ward', type: 'General Ward', unit: 0, dept: 'General Medicine', beds: 8 },
    { name: '201',                 type: 'Private AC',   unit: 1, dept: 'General Medicine', beds: 1 },
    { name: '202',                 type: 'Private AC',   unit: 1, dept: 'Surgery',          beds: 1 },
    { name: '203',                 type: 'Semi-Private', unit: 1, dept: 'Orthopaedics',     beds: 2 },
    { name: 'ICU',                 type: 'ICU',          unit: 2, dept: 'General Medicine', beds: 6 },
    { name: 'Labour Room 1',       type: 'Labour Room',  unit: 0, dept: 'Gynaecology',      beds: 1 },
  ]

  const wards = spec.map((w) => {
    const u = units[w.unit]
    return {
      id: uuid(), tenant_id: tenantId, name: w.name,
      room_type_id: type(w.type).id, daily_rate: type(w.type).daily_rate,
      nursing_unit_id: u.id, floor: u.floor, block: `${u.block} · ${u.wing}`,
      department_id: w.dept ? dept(w.dept) : null, is_temp: false,
    }
  })
  ok(`${wards.length} rooms`, (await db.from('wards').insert(wards)).error)

  const beds = wards.flatMap((w, i) =>
    Array.from({ length: spec[i].beds }, (_, b) => ({
      id: uuid(), tenant_id: tenantId, ward_id: w.id,
      bed_no: spec[i].beds === 1 ? w.name : `${w.name.split(' ')[0].slice(0, 1)}${b + 1}`,
      status: 'available',
    })))
  ok(`${beds.length} beds`, (await db.from('beds').insert(beds)).error)
}

// ── 4. Patients ──────────────────────────────────────────────────────────────

/**
 * Fictional people. The mobile numbers are a 99999 block chosen so they read as
 * real without being anyone's, and no Aadhaar is stored.
 */
async function createPatients(tenantId: string, staff: Staff[]): Promise<void> {
  const by = staff[0].id
  const spec: Array<{ name: string; dob: string; gender: string; phone: string; blood?: string; allergies?: string; est?: boolean }> = [
    { name: 'Anand Subramanian', dob: yearsAgo(46, '-02-18'), gender: 'male',   phone: '+919999900001', blood: 'O+' },
    { name: 'Lakshmi Narayanan', dob: yearsAgo(34, '-07-09'), gender: 'female', phone: '+919999900002', blood: 'B+' },
    { name: 'Kavya Ramesh',      dob: yearsAgo(28, '-11-30'), gender: 'female', phone: '+919999900003', blood: 'A+' },
    { name: 'Murugan Pillai',    dob: yearsAgo(63, '-01-05'), gender: 'male',   phone: '+919999900004', blood: 'AB+', allergies: 'Penicillin' },
    { name: 'Aarav Krishnan',    dob: day(-760),              gender: 'male',   phone: '+919999900005', blood: 'O+' },
    { name: 'Saraswathi Devi',   dob: yearsAgo(71, '-09-21'), gender: 'female', phone: '+919999900006', blood: 'B-' },
    { name: 'Vishal Menon',      dob: yearsAgo(19, '-03-14'), gender: 'male',   phone: '+919999900007', blood: 'A-' },
    { name: 'Fathima Beevi',     dob: yearsAgo(52),           gender: 'female', phone: '+919999900008', blood: 'O-', allergies: 'Sulfa drugs' },
    { name: 'Karthik Raja',      dob: yearsAgo(41, '-06-02'), gender: 'male',   phone: '+919999900009', blood: 'B+' },
    { name: 'Divya Bharathi',    dob: yearsAgo(31, '-12-25'), gender: 'female', phone: '+919999900010', blood: 'A+' },
  ]

  const rows = []
  for (const p of spec) {
    const { data: uhid, error } = await db.rpc('get_next_uhid_for', { p_tenant_id: tenantId })
    if (error || !uhid) { console.error(`  ✗ UHID: ${error?.message}`); process.exit(1) }
    rows.push({
      id: uuid(), tenant_id: tenantId, uhid: uhid as string,
      full_name: p.name, dob: p.dob, gender: p.gender, phone: p.phone,
      blood_group: p.blood ?? null, allergies: p.allergies ?? null,
      address: 'T. Nagar, Chennai, Tamil Nadu',
      notify_whatsapp_consent: true, notify_sms_consent: true,
      created_by: by,
    })
  }
  ok(`${rows.length} patients`, (await db.from('patients').insert(rows)).error)
}

// ── run ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nSeeding "${DEMO_NAME}" (/${DEMO_SLUG})\n`)
  await wipe()
  const tenantId = await createTenant()
  const depts = await createDepartments(tenantId)
  const staff = await createStaff(tenantId, depts)
  await createWards(tenantId, depts)
  await createPatients(tenantId, staff)

  console.log(`
Done.

  tenant   ${tenantId}
  sign in  https://${DEMO_SLUG}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'uyirly.com'}/login
  admin    ${staff[0].email}
  password ${DEMO_PASSWORD}

Every person in here is fictional. No Aadhaar, and the mobile numbers are a
99999 block that belongs to nobody.
`)
}

main()
