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
import { hashPassword } from '../src/lib/patientAuth'

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
/** The patient-portal login, which is a different account system from staff. */
const PORTAL_EMAIL = 'family@demo.uyirly.com'
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
async function createPatients(tenantId: string, staff: Staff[]): Promise<Array<{ id: string; name: string }>> {
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

  const rows: Array<Record<string, unknown> & { id: string; full_name: string }> = []
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

  // patients.allergies is the old free-text field; the allergy that actually
  // warns a doctor at prescribing time lives in patient_allergies, one row per
  // allergen with its reaction and severity.
  const allergyOf = (name: string) => rows.find((r) => r.full_name.startsWith(name))!.id
  ok('2 recorded allergies', (await db.from('patient_allergies').insert([
    { id: uuid(), tenant_id: tenantId, patient_id: allergyOf('Murugan'), allergen: 'Penicillin',
      reaction: 'Widespread rash and facial swelling within an hour', severity: 'severe', recorded_by: by },
    { id: uuid(), tenant_id: tenantId, patient_id: allergyOf('Fathima'), allergen: 'Sulfa drugs',
      reaction: 'Itchy rash', severity: 'moderate', recorded_by: by },
  ])).error)

  return rows.map((r) => ({ id: r.id, name: r.full_name }))
}

// ── 5. Catalogues the hospital would have set up ─────────────────────────────

/** A handful of common tests, priced — a fresh tenant starts with none. */
async function createLabCatalogue(tenantId: string): Promise<Array<{ id: string; name: string; price: number }>> {
  const spec: Array<[string, string, string, string | null, number, number | null, number | null]> = [
    ['Complete Blood Count (CBC)', 'CBC',  'Blood', 'g/dL',    350, 13, 17],
    ['Haemoglobin',                'HB',   'Blood', 'g/dL',    120, 13, 17],
    ['Random Blood Sugar',         'RBS',  'Blood', 'mg/dL',   100, 70, 140],
    ['HbA1c',                      'HBA1C','Blood', '%',       550, 4,  5.7],
    ['Serum Creatinine',           'CREA', 'Blood', 'mg/dL',   250, 0.6, 1.3],
    ['Liver Function Test',        'LFT',  'Blood', 'U/L',     750, null, null],
    ['Thyroid Profile (T3 T4 TSH)','THY',  'Blood', 'mIU/L',   650, 0.4, 4.0],
    ['Urine Routine',              'URIN', 'Urine', null,      200, null, null],
  ]
  const rows = spec.map(([name, code, sample, unit, price, lo, hi]) => ({
    id: uuid(), tenant_id: tenantId, name, code, sample_type: sample,
    unit, price, ref_low: lo, ref_high: hi, category: 'General', is_active: true,
  }))
  ok(`${rows.length} lab tests`, (await db.from('lab_tests_catalog').insert(rows)).error)

  const scans = [
    ['Chest X-Ray (PA view)', 'X-Ray', 'Chest',   450],
    ['X-Ray Knee (AP/Lat)',   'X-Ray', 'Knee',    500],
    ['Ultrasound Abdomen',    'Ultrasound', 'Abdomen', 1200],
    ['Obstetric Ultrasound',  'Ultrasound', 'Pelvis',  1400],
    ['CT Brain (plain)',      'CT', 'Brain',      3500],
  ].map(([name, modality, body_part, price]) => ({
    id: uuid(), tenant_id: tenantId, name, modality, body_part, price, is_active: true,
  }))
  ok(`${scans.length} radiology studies`, (await db.from('radiology_catalog').insert(scans)).error)
  return rows.map((r) => ({ id: r.id, name: r.name, price: r.price }))
}

// ── 6. Pharmacy stock ────────────────────────────────────────────────────────

/**
 * Real shelf conditions, not just "some stock": one medicine below its reorder
 * level, one batch a few weeks from expiry, one sold out, and two vaccines set
 * up for the immunisation screens.
 */
async function createStock(tenantId: string, staff: Staff[]): Promise<void> {
  const pharmacist = staff.find((s) => s.role === 'pharmacist')!.id

  const receipt = {
    id: uuid(), tenant_id: tenantId,
    supplier_name: 'Apex Pharma Distributors', invoice_no: 'APX/26-27/1184',
    invoice_date: day(-9), invoice_total: 48250, opening_stock: false,
    received_by: pharmacist,
  }
  ok('stock receipt', (await db.from('stock_receipts').insert(receipt)).error)

  // name to search the shared catalogue with, brand, pack, rate, mrp, qty, reorder, expiry, rack
  const spec: Array<[string, string, number, number, number, number, number, number, string]> = [
    ['paracetamol',  'Dolo 650',      15,  31.5,  2.50, 450, 150, 400, 'Rack A · Shelf 1'],
    ['amoxicillin',  'Mox 500',       10,  62.0,  8.90, 180,  60, 300, 'Rack A · Shelf 2'],
    ['pantoprazole', 'Pan 40',        15, 118.0,  9.50,  45,  90, 320, 'Rack B · Shelf 1'],
    ['cefixime',     'Taxim-O 200',   10, 148.0, 19.50,  90,  40, 260, 'Rack B · Shelf 2'],
    ['metformin',    'Glycomet 500',  20,  38.0,  2.35, 600, 200, 500, 'Rack C · Shelf 1'],
    ['amlodipine',   'Amlopres 5',    15,  42.0,  3.10, 300, 120, 450, 'Rack C · Shelf 2'],
    ['azithromycin', 'Azithral 500',   5, 105.0, 24.00, 100,  30,  38, 'Rack B · Shelf 3'],
    ['ondansetron',  'Emeset 4',      10,  46.0,  5.20,   0,  50, 280, 'Rack D · Shelf 1'],
  ]

  const batches: Record<string, unknown>[] = []
  for (const [search, brand, pack, rate, mrp, qty, reorder, expiryDays, rack] of spec) {
    const { data: master } = await db.from('drug_master')
      .select('id, name').ilike('name', `${search}%`).eq('is_active', true).order('name').limit(1).maybeSingle()
    if (!master) { console.log(`  · no catalogue match for ${search}, skipped`); continue }
    batches.push({
      id: uuid(), tenant_id: tenantId, drug_master_id: master.id,
      batch_no: `${brand.split(' ')[0].toUpperCase().slice(0, 4)}${expiryDays}`,
      expiry: day(expiryDays), qty_available: qty, free_qty: 0,
      purchase_price: rate, mrp, reorder_level: reorder,
      brand_name: brand, manufacturer: 'Demo Pharma Ltd',
      pack_size: pack, pack_unit: 'strip', hsn_code: '30049099', gst_rate: 12,
      supplier_name: receipt.supplier_name, supplier_invoice_no: receipt.invoice_no,
      purchase_date: receipt.invoice_date, storage_location: rack, receipt_id: receipt.id,
    })
  }
  ok(`${batches.length} medicine batches`, (await db.from('drug_batches').insert(batches)).error)

  // Two vaccines the paediatric screens can actually give.
  for (const [vaccine, search, brand, mrp] of [
    ['Hepatitis B', 'hepatitis b', 'Engerix-B', 320],
    ['Pentavalent (DPT-HepB-Hib)', 'pentavalent', 'Pentavac', 750],
  ] as Array<[string, string, string, number]>) {
    const { data: master } = await db.from('drug_master')
      .select('id').ilike('name', `%${search}%`).eq('is_active', true).order('name').limit(1).maybeSingle()
    if (!master) { console.log(`  · no catalogue match for ${vaccine}, skipped`); continue }
    const { count } = await db.from('immunization_schedule')
      .select('vaccine', { count: 'exact', head: true }).eq('vaccine', vaccine)
    if (!count) { console.log(`  · ${vaccine} is not in the schedule, skipped`); continue }
    await db.from('vaccine_products').insert({
      id: uuid(), tenant_id: tenantId, vaccine, drug_master_id: master.id, updated_by: pharmacist,
    })
    await db.from('drug_batches').insert({
      id: uuid(), tenant_id: tenantId, drug_master_id: master.id,
      batch_no: `VAX${brand.slice(0, 4).toUpperCase()}1`, expiry: day(210),
      qty_available: 24, mrp, purchase_price: mrp * 0.72, reorder_level: 10,
      brand_name: brand, manufacturer: 'Demo Biologicals', pack_size: 1, pack_unit: 'vial',
      hsn_code: '30022029', gst_rate: 5, storage_location: 'Vaccine Fridge · Tray 2',
      supplier_name: receipt.supplier_name, purchase_date: receipt.invoice_date,
    })
    ok(`vaccine: ${vaccine}`, null)
  }
}

// ── 7. OPD visits ────────────────────────────────────────────────────────────

interface Seeded { patients: Array<{ id: string; name: string }>; staff: Staff[] }

const patientId = (s: Seeded, name: string) => s.patients.find((p) => p.name.startsWith(name))!.id
const doctorId  = (s: Seeded, name: string) => s.staff.find((d) => d.name.includes(name))!.id

/** One visit per specialty, so every clinical template has something to show. */
async function createVisits(tenantId: string, s: Seeded, tests: Array<{ id: string; name: string; price: number }>): Promise<void> {
  const visits: Record<string, unknown>[] = []
  const rx: Record<string, unknown>[] = []

  const add = (opts: {
    patient: string; doctor: string; daysAgo: number; fee: number
    complaint: string; diagnosis: string; icd?: string; notes?: string
    vitals?: Record<string, string>; status?: string; billed?: string
    drugs?: Array<[string, string, string, string]>
  }) => {
    const id = uuid()
    visits.push({
      id, tenant_id: tenantId, patient_id: patientId(s, opts.patient),
      doctor_id: doctorId(s, opts.doctor), type: 'opd',
      visit_date: new Date(Date.now() - opts.daysAgo * 86400000).toISOString(),
      complaint: opts.complaint, diagnosis: opts.diagnosis, icd_code: opts.icd ?? null,
      notes: opts.notes ?? null, vitals: opts.vitals ?? null,
      status: opts.status ?? 'closed', consultation_fee: opts.fee,
      billing_status: opts.billed ?? 'billed',
    })
    for (const [name, dosage, freq, dur] of opts.drugs ?? []) {
      rx.push({ id: uuid(), tenant_id: tenantId, visit_id: id, drug_name: name, dosage, frequency: freq, duration: dur })
    }
    return id
  }

  add({ patient: 'Anand', doctor: 'Arun Prakash', daysAgo: 3, fee: 500,
    complaint: 'Fever with body ache for 3 days, mild cough',
    diagnosis: 'Acute viral fever', icd: 'J06.9',
    notes: 'Advised rest and plenty of fluids. Review if fever persists beyond 3 days.',
    vitals: { bp: '128/82', pulse: '92', temp: '101.2', spo2: '98', weight: '74' },
    drugs: [['Dolo 650', '1 tablet', 'Three times a day', '3 days'],
            ['Azithral 500', '1 tablet', 'Once a day', '3 days']] })

  add({ patient: 'Murugan', doctor: 'Arun Prakash', daysAgo: 1, fee: 500,
    complaint: 'Follow-up for diabetes and hypertension, occasional giddiness',
    diagnosis: 'Type 2 diabetes mellitus with hypertension', icd: 'E11.9',
    notes: 'Continue current medication. HbA1c and creatinine sent.',
    vitals: { bp: '146/90', pulse: '78', temp: '98.4', spo2: '97', weight: '68' },
    drugs: [['Glycomet 500', '1 tablet', 'Twice a day', '30 days'],
            ['Amlopres 5', '1 tablet', 'Once a day at night', '30 days']] })

  const paedVisit = add({ patient: 'Aarav', doctor: 'Kavitha Suresh', daysAgo: 2, fee: 400,
    complaint: 'Loose stools since yesterday, taking fluids well',
    diagnosis: 'Acute gastroenteritis, no dehydration', icd: 'A09',
    notes: 'ORS explained to mother. Growth on track. Weight-for-age within normal range.',
    vitals: { temp: '99.1', pulse: '112', weight: '11.4' },
    drugs: [['ORS sachet', '1 sachet in 200 ml water', 'After each loose stool', '3 days']] })

  const ancVisit = add({ patient: 'Lakshmi', doctor: 'Lakshmi Iyer', daysAgo: 5, fee: 600, status: 'closed',
    complaint: 'Routine antenatal check, 34 weeks',
    diagnosis: 'Single live intrauterine pregnancy, 34 weeks',
    notes: 'Fetal movements good. Iron and calcium continued. Review in 2 weeks.',
    vitals: { bp: '118/76', pulse: '84', weight: '63' } })

  add({ patient: 'Kavya', doctor: 'Vignesh Kumar', daysAgo: 6, fee: 450,
    complaint: 'Blurred distance vision for 2 months, headache while reading',
    diagnosis: 'Myopia with astigmatism, both eyes', icd: 'H52.2',
    notes: 'Spectacles prescribed. Review after 6 months.',
    vitals: { bp: '112/74', pulse: '76' } })

  add({ patient: 'Divya', doctor: 'Arun Prakash', daysAgo: 0, fee: 500, status: 'open', billed: 'unbilled',
    complaint: 'Sore throat and difficulty swallowing for 2 days',
    diagnosis: 'Acute pharyngitis', icd: 'J02.9',
    vitals: { bp: '118/78', pulse: '88', temp: '100.4', spo2: '99', weight: '58' } })

  ok(`${visits.length} OPD visits`, (await db.from('visits').insert(visits)).error)
  ok(`${rx.length} prescriptions`, (await db.from('prescriptions').insert(rx)).error)

  // Paediatrics: birth history and two growth points, so the WHO chart has a line.
  const aarav = patientId(s, 'Aarav')
  ok('paediatric profile', (await db.from('pediatric_profiles').insert({
    patient_id: aarav, tenant_id: tenantId, gestational_age_weeks: 38,
    birth_weight_kg: 2.9, birth_length_cm: 48, birth_head_circ_cm: 34,
    delivery_mode: 'normal', nicu_admission: false, feeding: 'family_diet',
    updated_by: doctorId(s, 'Kavitha Suresh'),
  })).error)
  ok('growth measurements', (await db.from('pediatric_growth').insert([
    { id: uuid(), tenant_id: tenantId, patient_id: aarav, recorded_at: day(-190),
      weight_kg: 9.8, height_cm: 78.5, head_circ_cm: 46.5, muac_cm: 14.2,
      recorded_by: doctorId(s, 'Kavitha Suresh') },
    { id: uuid(), tenant_id: tenantId, patient_id: aarav, recorded_at: day(-2), visit_id: paedVisit,
      weight_kg: 11.4, height_cm: 86.0, head_circ_cm: 48.0, muac_cm: 15.1,
      recorded_by: doctorId(s, 'Kavitha Suresh') },
  ])).error)

  // Obstetrics: an active pregnancy at 34 weeks, with this visit's check recorded.
  const ancId = uuid()
  ok('pregnancy record', (await db.from('anc_records').insert({
    id: ancId, tenant_id: tenantId, patient_id: patientId(s, 'Lakshmi'),
    lmp: day(-238), edd: day(42), gravida: 2, para: 1, abortions: 0, living: 1,
    previous_caesareans: 0, blood_group: 'B+', high_risk: false, status: 'active',
    edd_basis: 'lmp', created_by: doctorId(s, 'Lakshmi Iyer'),
  })).error)
  ok('antenatal check', (await db.from('anc_visits').insert({
    id: uuid(), tenant_id: tenantId, anc_id: ancId, visit_id: ancVisit,
    visit_date: day(-5), weight_kg: 63, bp: '118/76', pallor: false,
    fundal_height_cm: 33, fetal_heart_rate: 142, fetal_movements: 'good',
    urine_albumin: 'nil', urine_sugar: 'nil', hb: 11.4, presentation: 'cephalic',
    notes: 'Well. Continue iron and calcium.', recorded_by: doctorId(s, 'Lakshmi Iyer'),
  })).error)

  // Imaging: one reported with findings, one still waiting.
  const { data: scans } = await db.from('radiology_catalog').select('id, name, price').eq('tenant_id', tenantId)
  const scan = (n: string) => (scans ?? []).find((x) => (x.name as string).startsWith(n))!
  if (scans?.length) {
    ok('2 radiology orders', (await db.from('radiology_orders').insert([
      {
        id: uuid(), tenant_id: tenantId, patient_id: patientId(s, 'Saraswathi'),
        test_id: scan('Chest X-Ray').id, price_snapshot: scan('Chest X-Ray').price,
        ordered_by: doctorId(s, 'Arun Prakash'), status: 'reported', billing_status: 'billed',
        ordered_at: new Date(Date.now() - 2 * 86400000).toISOString(),
        reported_at: new Date(Date.now() - 86400000 * 1.8).toISOString(),
        priority: 'urgent',
        report: 'Right lower zone consolidation with air bronchograms. Cardiac silhouette normal. No pleural effusion. Findings consistent with lobar pneumonia.',
      },
      {
        id: uuid(), tenant_id: tenantId, patient_id: patientId(s, 'Lakshmi'),
        test_id: scan('Obstetric Ultrasound').id, price_snapshot: scan('Obstetric Ultrasound').price,
        ordered_by: doctorId(s, 'Lakshmi Iyer'), status: 'ordered', billing_status: 'unbilled',
        ordered_at: new Date().toISOString(), priority: 'routine',
      },
    ])).error)
  }

  // A lab order with results, and one still waiting.
  const murugan = patientId(s, 'Murugan')
  const pick = (n: string) => tests.find((t) => t.name.startsWith(n))!
  const reported = uuid(), pending = uuid()
  ok('2 lab orders', (await db.from('lab_orders').insert([
    { id: reported, tenant_id: tenantId, patient_id: murugan, ordered_by: doctorId(s, 'Arun Prakash'),
      status: 'reported', billing_status: 'billed', ordered_at: new Date(Date.now() - 86400000).toISOString(),
      reported_at: new Date(Date.now() - 3600000 * 6).toISOString(), priority: 'routine' },
    { id: pending, tenant_id: tenantId, patient_id: patientId(s, 'Divya'), ordered_by: doctorId(s, 'Arun Prakash'),
      status: 'ordered', billing_status: 'unbilled', ordered_at: new Date().toISOString(), priority: 'routine' },
  ])).error)
  ok('lab results', (await db.from('lab_order_items').insert([
    { id: uuid(), tenant_id: tenantId, lab_order_id: reported, test_id: pick('HbA1c').id,
      price_snapshot: pick('HbA1c').price, result_value: 8.2, unit: '%', flag: 'high' },
    { id: uuid(), tenant_id: tenantId, lab_order_id: reported, test_id: pick('Serum Creatinine').id,
      price_snapshot: pick('Serum Creatinine').price, result_value: 1.1, unit: 'mg/dL', flag: 'normal' },
    { id: uuid(), tenant_id: tenantId, lab_order_id: pending, test_id: pick('Complete Blood Count').id,
      price_snapshot: pick('Complete Blood Count').price, flag: 'pending' },
  ])).error)
}

// ── 8. Inpatients ────────────────────────────────────────────────────────────

/** Two admissions: a general-ward case and a mother in the labour room. */
async function createAdmissions(tenantId: string, s: Seeded): Promise<void> {
  const { data: beds } = await db.from('beds')
    .select('id, bed_no, ward_id, ward:wards(name)').eq('tenant_id', tenantId)
  type Bed = { id: string; bed_no: string; ward_id: string; ward: { name: string } | null }
  const all = (beds ?? []) as unknown as Bed[]
  const bed = (ward: string, no?: string) =>
    all.find((b) => b.ward?.name === ward && (!no || b.bed_no === no))!

  const f1 = bed('Female General Ward', 'F1')
  const labour = bed('Labour Room 1')

  const rows = [
    { id: uuid(), tenant_id: tenantId, patient_id: patientId(s, 'Saraswathi'),
      admitting_doctor_id: doctorId(s, 'Arun Prakash'), ward_id: f1.ward_id, bed_id: f1.id,
      reason: 'Community-acquired pneumonia, needs IV antibiotics and oxygen',
      admitted_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      status: 'admitted', billing_status: 'unbilled' },
    { id: uuid(), tenant_id: tenantId, patient_id: patientId(s, 'Lakshmi'),
      admitting_doctor_id: doctorId(s, 'Lakshmi Iyer'), ward_id: labour.ward_id, bed_id: labour.id,
      reason: 'Term pregnancy in early labour',
      admitted_at: new Date(Date.now() - 6 * 3600000).toISOString(),
      status: 'admitted', billing_status: 'unbilled' },
  ]
  ok('2 admissions', (await db.from('admissions').insert(rows)).error)
  for (const b of [f1, labour]) {
    await db.from('beds').update({ status: 'occupied' }).eq('id', b.id)
  }
  ok('beds marked occupied', null)

  // Progress notes on the pneumonia case.
  ok('progress notes', (await db.from('ipd_progress_notes').insert([
    { id: uuid(), tenant_id: tenantId, admission_id: rows[0].id, author_id: doctorId(s, 'Arun Prakash'),
      note: 'Day 1: Febrile 100.8°F, SpO2 94% on room air. Started on IV Ceftriaxone. Chest X-ray shows right lower zone consolidation.',
      created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
    { id: uuid(), tenant_id: tenantId, admission_id: rows[0].id, author_id: doctorId(s, 'Arun Prakash'),
      note: 'Day 2: Fever settling, 99.1°F. SpO2 97% on room air. Appetite improving. Continue antibiotics.',
      created_at: new Date(Date.now() - 86400000).toISOString() },
  ])).error)

  // Early labour: two partograph readings, four hours apart.
  const labourAdm = rows[1].id
  ok('partograph readings', (await db.from('partograph_obs').insert([
    { id: uuid(), tenant_id: tenantId, admission_id: labourAdm,
      recorded_at: new Date(Date.now() - 5 * 3600000).toISOString(),
      cervix_cm: 4, contractions_per10: 3, contraction_duration: '20-40',
      fetal_heart_rate: 140, bp: '116/74', pulse: 86, temp: 98.6,
      recorded_by: doctorId(s, 'Lakshmi Iyer') },
    { id: uuid(), tenant_id: tenantId, admission_id: labourAdm,
      recorded_at: new Date(Date.now() - 3600000).toISOString(),
      cervix_cm: 6, contractions_per10: 4, contraction_duration: '40+',
      fetal_heart_rate: 144, bp: '120/78', pulse: 90, temp: 98.8,
      recorded_by: doctorId(s, 'Lakshmi Iyer') },
  ])).error)
}

// ── 9. The rest of a configured hospital ─────────────────────────────────────

/**
 * The setup checklist on the dashboard is real: it counts rows. Rather than
 * hiding the reminder, the demo hospital simply finishes setting itself up —
 * letterhead, OPD hours, a tariff list and a radiology catalogue.
 */
async function completeSetup(tenantId: string, s: Seeded): Promise<void> {
  ok('hospital letterhead', (await db.from('tenant_profiles').insert({
    tenant_id: tenantId, name: DEMO_NAME,
    tagline: 'Multi-Specialty Hospital', tagline2: 'Caring since 1998',
    address_line1: '142, Venkatanarayana Road', address_line2: 'T. Nagar',
    city: 'Chennai', state: 'Tamil Nadu', pincode: '600017',
    phone1: '+914428150000', phone2: '+919999900100',
    email: 'care@demo.uyirly.com', website: 'www.uyirly.com',
    gst_no: '33AABCU9999A1ZK', gst_enabled: true, gst_state_code: '33',
    pharmacy_default_gst_rate: 12,
    emergency_contact: '+914428150108',
  })).error)

  ok('hospital code', (await db.from('tenants').update({ code: 'UDH' }).eq('id', tenantId)).error)

  // Nursing shifts — a real signup seeds these; a tenant built by hand must too.
  ok('3 nursing shifts', (await db.from('shift_definitions').insert([
    { id: uuid(), tenant_id: tenantId, code: 'morning', label: 'Morning', start_time: '07:00', end_time: '19:00', crosses_midnight: false, sort_order: 1, is_active: true },
    { id: uuid(), tenant_id: tenantId, code: 'evening', label: 'Evening', start_time: '14:00', end_time: '21:00', crosses_midnight: false, sort_order: 2, is_active: false },
    { id: uuid(), tenant_id: tenantId, code: 'night',   label: 'Night',   start_time: '19:00', end_time: '07:00', crosses_midnight: true,  sort_order: 3, is_active: true },
  ])).error)

  // OPD hours — Monday to Saturday for each consulting doctor.
  const consulting = s.staff.filter((x) => x.role === 'doctor' || x.name === 'Dr. Meena Raghavan')
  const hours = consulting.flatMap((doc) =>
    [1, 2, 3, 4, 5, 6].map((dow) => ({
      id: uuid(), tenant_id: tenantId, doctor_id: doc.id, day_of_week: dow,
      start_time: '09:00', end_time: '13:00', label: 'Morning OPD',
      token_cap: 20, is_active: true,
    })))
  ok(`${hours.length} OPD sessions`, (await db.from('doctor_availability').insert(hours)).error)

  // 'general' is a single default tariff per hospital, not a category to file
  // consultations under — there is a unique index enforcing exactly one active.
  // Consultation fees live on the visit, so they are not tariffs at all.
  const tariffs = [
    ['General Procedure',               'general',    500],
    ['Normal Delivery',                 'package',  28000],
    ['Caesarean Section (LSCS)',        'package',  55000],
    ['Appendectomy',                    'surgery',  42000],
    ['Cataract Surgery (Phaco + IOL)',  'surgery',  24000],
    ['Hernia Repair (Laparoscopic)',    'surgery',  48000],
    ['Dressing — Minor',                'procedure',  250],
    ['Nebulisation',                    'procedure',  200],
    ['Nursing Charges — General Ward',  'procedure',  400],
    ['Nursing Charges — ICU',           'procedure', 1200],
    ['Physiotherapy Session',           'procedure',  350],
    ['Casualty Attendance',             'emergency',  800],
  ].map(([name, category, price]) => ({
    id: uuid(), tenant_id: tenantId, name, category, default_price: price, is_active: true,
  }))
  ok(`${tariffs.length} tariffs`, (await db.from('procedure_tariffs').insert(tariffs)).error)

}

// ── 10. Today ────────────────────────────────────────────────────────────────

/**
 * A dashboard of zeroes tells a reader nothing. This gives the demo a working
 * day: booked appointments, money taken at the counter, and one bill still open.
 */
async function createToday(tenantId: string, s: Seeded): Promise<void> {
  const today = new Date()
  const at = (h: number, m = 0) => {
    const d = new Date(today); d.setHours(h, m, 0, 0); return d.toISOString()
  }

  const { data: depts } = await db.from('departments').select('id, name').eq('tenant_id', tenantId)
  const deptId = (n: string) => (depts ?? []).find((d) => d.name === n)?.id ?? null

  const appts = [
    ['Anand',      'Arun Prakash',   'General Medicine', 9,  30, 1, 'done',       'Fever review'],
    ['Murugan',    'Arun Prakash',   'General Medicine', 10,  0, 2, 'done',       'Diabetes follow-up'],
    ['Aarav',      'Kavitha Suresh', 'Paediatrics',      10, 30, 1, 'checked_in', 'Vaccination due'],
    ['Kavya',      'Vignesh Kumar',  'Ophthalmology',    11,  0, 1, 'booked',     'Spectacle review'],
    ['Divya',      'Arun Prakash',   'General Medicine', 11, 30, 3, 'checked_in', 'Sore throat'],
    ['Fathima',    'Arun Prakash',   'General Medicine', 12,  0, 4, 'booked',     'Blood pressure check'],
  ].map(([pat, doc, dept, h, m, token, status, reason]) => ({
    id: uuid(), tenant_id: tenantId,
    patient_id: patientId(s, pat as string), doctor_id: doctorId(s, doc as string),
    department_id: deptId(dept as string),
    scheduled_at: at(h as number, m as number), token_no: token as number,
    status: status as string, reason: reason as string,
  }))
  ok(`${appts.length} appointments today`, (await db.from('appointments').insert(appts)).error)

  // A Schedule H1 medicine handed over, so the register has a line in it. The
  // entry writes itself: a trigger on dispenses fills the H1 register.
  const { data: h1Batch } = await db.from('drug_batches')
    .select('id, drug_master_id, mrp').eq('tenant_id', tenantId).eq('brand_name', 'Taxim-O 200').maybeSingle()
  if (h1Batch) {
    await db.from('dispenses').insert({
      id: uuid(), tenant_id: tenantId, patient_id: patientId(s, 'Anand'),
      drug_master_id: h1Batch.drug_master_id, drug_batch_id: h1Batch.id,
      qty: 10, price_snapshot: h1Batch.mrp,
      dispensed_by: s.staff.find((x) => x.role === 'pharmacist')!.id,
      dispensed_at: at(10, 15), billing_status: 'billed',
    })
    await db.from('drug_batches').update({ qty_available: 80 }).eq('id', h1Batch.id)
    ok('Schedule H1 supply (register entry)', null)
  }

  // Bills. Two settled at the counter this morning, one still open.
  const cashier = s.staff.find((x) => x.role === 'accountant')!.id
  const billNo = async () => {
    const { data, error } = await db.rpc('get_next_bill_no', { p_tenant_id: tenantId })
    if (error || !data) { console.error(`  ✗ bill number: ${error?.message}`); process.exit(1) }
    return data as string
  }

  const spec: Array<{ patient: string; items: Array<[string, string, number]>; paid: boolean; method: string }> = [
    { patient: 'Anand',   items: [['consultation', 'Consultation — Dr. Arun Prakash', 500]], paid: true,  method: 'cash' },
    { patient: 'Murugan', items: [['consultation', 'Consultation — Dr. Arun Prakash', 500],
                                  ['lab', 'HbA1c', 550], ['lab', 'Serum Creatinine', 250]], paid: true, method: 'upi' },
    { patient: 'Divya',   items: [['consultation', 'Consultation — Dr. Arun Prakash', 500]], paid: false, method: 'cash' },
  ]

  for (const b of spec) {
    const id = uuid()
    const total = b.items.reduce((sum, [, , amt]) => sum + amt, 0)
    const { error: bErr } = await db.from('bills').insert({
      id, tenant_id: tenantId, patient_id: patientId(s, b.patient),
      bill_no: await billNo(), bill_source: b.items.length > 1 ? 'consolidated' : 'consultation',
      subtotal: total, discount: 0, tax: 0, total,
      paid: b.paid ? total : 0, status: b.paid ? 'paid' : 'unpaid',
      billing_date: today.toISOString().slice(0, 10),
      created_by: cashier,
    })
    if (bErr) { console.error(`  ✗ bill for ${b.patient}: ${bErr.message}`); process.exit(1) }

    await db.from('bill_items').insert(b.items.map(([source, description, amount]) => ({
      id: uuid(), tenant_id: tenantId, bill_id: id, source, description,
      qty: 1, unit_price: amount, amount, taxable_value: amount, tax_amount: 0, gst_rate: 0,
    })))

    if (b.paid) {
      await db.from('payments').insert({
        id: uuid(), tenant_id: tenantId, bill_id: id, amount: total,
        method: b.method, received_by: cashier, received_at: at(9, 45),
      })
    }
  }
  ok(`${spec.length} bills (2 settled, 1 open)`, null)
}

/**
 * A stay that has been running two days, billed the way the daily cron does it:
 * a separate bill per source per day, so the admission carries several small
 * bills rather than one running invoice — which is what the screens expect.
 */
async function createIpdBilling(tenantId: string, s: Seeded): Promise<void> {
  const { data: adm } = await db.from('admissions')
    .select('id, patient_id, ward:wards(name, daily_rate)')
    .eq('tenant_id', tenantId).eq('status', 'admitted').order('admitted_at').limit(1).maybeSingle()
  if (!adm) return
  const ward = adm.ward as unknown as { name: string; daily_rate: number } | null
  const cashier = s.staff.find((x) => x.role === 'accountant')!.id

  const billNo = async () => {
    const { data } = await db.rpc('get_next_bill_no', { p_tenant_id: tenantId })
    return data as string
  }

  const add = async (source: string, date: string, lines: Array<[string, number, number]>) => {
    const id = uuid()
    const total = lines.reduce((sum, [, qty, price]) => sum + qty * price, 0)
    await db.from('bills').insert({
      id, tenant_id: tenantId, patient_id: adm.patient_id, admission_id: adm.id,
      bill_no: await billNo(), bill_source: source, billing_date: date,
      subtotal: total, discount: 0, tax: 0, total, paid: 0, status: 'unpaid',
      created_by: cashier,
    })
    await db.from('bill_items').insert(lines.map(([description, qty, unit_price]) => ({
      id: uuid(), tenant_id: tenantId, bill_id: id, source,
      description, qty, unit_price, amount: qty * unit_price,
      taxable_value: qty * unit_price, tax_amount: 0, gst_rate: 0,
    })))
  }

  const rate = ward?.daily_rate ?? 1200
  for (const offset of [-1, 0]) {
    await add('bed', day(offset), [[`${ward?.name ?? 'Ward'} — Room Rent`, 1, rate]])
    await add('nursing', day(offset), [['Nursing — Morning Shift', 1, 400], ['Nursing — Night Shift', 1, 400]])
  }
  await add('ipd_pharmacy', day(0), [['Mox 500 — 6 capsules', 6, 8.9], ['Pan 40 — 2 tablets', 2, 9.5]])
  await add('lab', day(-1), [['Complete Blood Count (CBC)', 1, 350], ['Serum Creatinine', 1, 250]])

  // An advance taken at admission, which discharge will settle against.
  await db.from('admission_advances').insert({
    id: uuid(), tenant_id: tenantId, admission_id: adm.id,
    amount: 10000, method: 'upi', received_by: cashier,
    received_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  })
  ok('IPD bills across two days, plus an advance', null)
}

/**
 * The money screens need something to show: an estimate given before admission,
 * a discount waiting for approval, and an advance collected at the counter today.
 */
async function createFinance(tenantId: string, s: Seeded): Promise<void> {
  const cashier = s.staff.find((x) => x.role === 'accountant')!.id
  const admin = s.staff[0].id

  // What a family is told a delivery will cost, before they agree to it.
  const estId = uuid()
  const items: Array<[string, string, number, number]> = [
    ['Room', 'Private AC room — 3 days', 3, 4500],
    ['Procedure', 'Normal Delivery — package', 1, 28000],
    ['Investigations', 'Routine antenatal bloods and scan', 1, 2600],
    ['Pharmacy', 'Medicines and consumables (estimated)', 1, 4500],
    ['Nursing', 'Nursing charges — 3 days', 3, 400],
  ]
  const subtotal = items.reduce((sum, [, , qty, price]) => sum + qty * price, 0)
  const { error: eErr } = await db.from('cost_estimates').insert({
    id: estId, tenant_id: tenantId, estimate_no: 'UDH-EST-2026-0001',
    patient_id: patientId(s, 'Lakshmi'), patient_name: 'Lakshmi Narayanan',
    patient_phone: '+919999900002', room_type: 'Private AC', estimated_days: 3,
    validity_date: day(30),
    notes: 'Normal delivery. A caesarean, if needed, is quoted separately and would replace the procedure line.',
    subtotal, total: subtotal, status: 'final', created_by: cashier,
  })
  if (eErr) { console.log(`  · estimate: ${eErr.message}`); return }
  await db.from('cost_estimate_items').insert(items.map(([category, description, qty, unit_price]) => ({
    id: uuid(), tenant_id: tenantId, estimate_id: estId,
    category, description, qty, unit_price, amount: qty * unit_price,
  })))
  ok('a cost estimate before admission', null)

  // Who may discount how much, and one request over the line waiting on a decision.
  await db.from('discount_limits').upsert([
    { tenant_id: tenantId, role: 'receptionist', max_percent: 0 },
    { tenant_id: tenantId, role: 'accountant', max_percent: 10 },
    { tenant_id: tenantId, role: 'admin', max_percent: 100 },
  ], { onConflict: 'tenant_id,role' })

  const { data: bill } = await db.from('bills')
    .select('id, total').eq('tenant_id', tenantId).eq('status', 'unpaid').order('total', { ascending: false }).limit(1).maybeSingle()
  if (bill) {
    await db.from('discount_requests').insert({
      id: uuid(), tenant_id: tenantId, bill_id: bill.id,
      requested_by: cashier, requested_pct: 20,
      requested_amount: Math.round((bill.total as number) * 0.2),
      reason: 'Long-standing patient, family requesting concession on the room charge.',
      status: 'pending',
    })
    ok('a discount request over the limit', null)
  }

  // An advance topped up at the counter this morning, so the day book shows one.
  const { data: adm } = await db.from('admissions')
    .select('id').eq('tenant_id', tenantId).eq('status', 'admitted').order('admitted_at').limit(1).maybeSingle()
  if (adm) {
    const at = new Date(); at.setHours(11, 20, 0, 0)
    await db.from('admission_advances').insert({
      id: uuid(), tenant_id: tenantId, admission_id: adm.id,
      amount: 5000, method: 'cash', received_by: cashier, received_at: at.toISOString(),
    })
    ok('an advance collected today', null)
  }
  void admin
}

/**
 * The theatre, the blood bank, emergency and an insurance claim — each with just
 * enough in it that the screen shows how it is meant to be read.
 */
async function createRestOfHospital(tenantId: string, s: Seeded): Promise<void> {
  const admin = s.staff[0].id

  // ── Operation theatre ──────────────────────────────────────────────────────
  const rooms = [
    { id: uuid(), tenant_id: tenantId, name: 'OT 1', ot_type: 'Major', floor: '2', block: 'B', is_active: true, status: 'available' },
    { id: uuid(), tenant_id: tenantId, name: 'OT 2', ot_type: 'Minor', floor: '2', block: 'B', is_active: true, status: 'available' },
  ]
  ok('2 operation theatres', (await db.from('ot_rooms').insert(rooms)).error)

  const at = (dayOffset: number, h: number, m = 0) => {
    const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0)
    return d.toISOString()
  }
  ok('2 theatre cases', (await db.from('ot_schedules').insert([
    {
      id: uuid(), tenant_id: tenantId, patient_id: patientId(s, 'Fathima'),
      surgeon_id: doctorId(s, 'Arun Prakash'), anaesthetist_id: doctorId(s, 'Meena Raghavan'),
      ot_room_id: rooms[0].id, procedure_name: 'Laparoscopic Cholecystectomy',
      scheduled_start: at(1, 9), scheduled_end: at(1, 11),
      status: 'scheduled', billing_status: 'unbilled', price_snapshot: 48000,
      notes: 'Elective. Fasting from midnight. Consent taken.',
    },
    {
      id: uuid(), tenant_id: tenantId, patient_id: patientId(s, 'Kavya'),
      surgeon_id: doctorId(s, 'Vignesh Kumar'), ot_room_id: rooms[1].id,
      procedure_name: 'Cataract Surgery (Phaco + IOL) — right eye',
      scheduled_start: at(1, 11, 30), scheduled_end: at(1, 12, 30),
      status: 'scheduled', billing_status: 'unbilled', price_snapshot: 24000,
    },
  ])).error)

  // ── Blood bank ─────────────────────────────────────────────────────────────
  const groups: Array<[string, string, number]> = [
    ['O+', 'whole', 14], ['O+', 'prbc', 21], ['A+', 'prbc', 18],
    ['B+', 'whole', 9], ['B+', 'prbc', 25], ['AB+', 'plasma', 60],
    ['O-', 'prbc', 12], ['A-', 'platelets', 3],
  ]
  ok(`${groups.length} blood units`, (await db.from('blood_units').insert(
    groups.map(([blood_group, component, daysLeft], i) => ({
      id: uuid(), tenant_id: tenantId, blood_group, component,
      bag_number: `BAG-2026-${String(1001 + i)}`, volume_ml: component === 'platelets' ? 200 : 350,
      collected_at: day(-7), expiry: day(daysLeft), status: 'available',
      screening_status: 'passed', hiv: 'non_reactive', hbsag: 'non_reactive', hcv: 'non_reactive',
      syphilis: 'non_reactive', malaria: 'non_reactive', screened_by: admin, screened_at: day(-6),
    })))).error)

  // ── Emergency ──────────────────────────────────────────────────────────────
  ok('2 emergency cases', (await db.from('emergency_cases').insert([
    {
      id: uuid(), tenant_id: tenantId, patient_id: patientId(s, 'Vishal'),
      triage_level: 2, arrival_mode: 'ambulance', status: 'in_treatment',
      complaint: 'Road traffic accident — laceration to left forearm, conscious and oriented',
      attended_by: doctorId(s, 'Arun Prakash'),
      arrived_at: new Date(Date.now() - 50 * 60000).toISOString(),
    },
    {
      id: uuid(), tenant_id: tenantId, patient_id: patientId(s, 'Karthik'),
      triage_level: 4, arrival_mode: 'walk_in', status: 'waiting',
      complaint: 'Fever and sore throat for two days',
      arrived_at: new Date(Date.now() - 12 * 60000).toISOString(),
    },
  ])).error)

  // ── An insurance claim approved for less than it was raised for ────────────
  const { data: tpa } = await db.from('insurance_tpas').select('id').eq('tenant_id', tenantId).limit(1).maybeSingle()
  const policyId = uuid()
  const { error: polErr } = await db.from('insurance_policies').insert({
    id: policyId, tenant_id: tenantId, patient_id: patientId(s, 'Saraswathi'),
    provider: 'Star Health and Allied Insurance', policy_no: 'SH-2026-4471902',
    member_id: 'SH4471902-01', policyholder_name: 'Saraswathi Devi',
    policyholder_relationship: 'self', tpa_id: tpa?.id ?? null,
    coverage_amount: 500000, room_rent_limit_per_day: 5000, copay_percent: 10,
    policy_start_date: day(-250), valid_till: day(115),
    sub_limit_notes: 'Room rent capped at ₹5,000/day. 10% co-pay on every claim.',
  })
  if (polErr) { console.log(`  · policy: ${polErr.message}`); return }
  ok('an insurance policy with sub-limits', null)

  const { data: admission } = await db.from('admissions')
    .select('id').eq('tenant_id', tenantId).eq('status', 'admitted').order('admitted_at').limit(1).maybeSingle()
  ok('a claim approved below what was raised', (await db.from('insurance_claims').insert({
    id: uuid(), tenant_id: tenantId, policy_id: policyId, admission_id: admission?.id ?? null,
    claim_type: 'cashless', status: 'approved',
    estimated_amount: 60000, claim_amount: 48000, approved_amount: 39000,
    eligibility_status: 'approved', eligibility_approved_amount: 40000,
    eligibility_decided_at: day(-2), preauth_number: 'PA-2026-889341',
    diagnosis: 'Community-acquired pneumonia', room_category_requested: 'General Ward',
    raised_at: day(-2), submitted_at: day(-1), approved_at: day(-1),
    remarks: 'Room rent allowed to policy limit. Two investigations disallowed as not related to the admitting diagnosis.',
  })).error)
}

/**
 * The specialty templates and the rota: an eye examination filled in, a dental
 * chart with real findings, a week of nursing shifts and today's attendance.
 */
async function createSpecialtiesAndRota(tenantId: string, s: Seeded): Promise<void> {
  // ── Ophthalmology: a refraction that explains the spectacles prescribed ────
  const { data: eyeVisit } = await db.from('visits')
    .select('id, clinical_data').eq('tenant_id', tenantId)
    .eq('patient_id', patientId(s, 'Kavya')).order('visit_date', { ascending: false }).limit(1).maybeSingle()
  if (eyeVisit) {
    await db.from('visits').update({
      clinical_data: {
        ...(eyeVisit.clinical_data as Record<string, unknown> ?? {}),
        visualAcuity: { od: '6/12', os: '6/18' },
        iop: { od: 14, os: 15 },
        refraction: {
          od: { sphere: -1.25, cylinder: -0.5, axis: 180 },
          os: { sphere: -1.75, cylinder: -0.75, axis: 170 },
        },
        notes: 'Anterior segment quiet both eyes. Fundus normal. Spectacles prescribed; review in six months.',
      },
    }).eq('id', eyeVisit.id)
    ok('an eye examination with refraction', null)
  }

  // ── Dental: a visit, a charted mouth and the treatment done ────────────────
  const { data: dentalDept } = await db.from('departments')
    .select('id').eq('tenant_id', tenantId).eq('name', 'Dental').maybeSingle()
  const dentist = s.staff.find((x) => x.name.includes('Meena'))!.id
  if (dentalDept) {
    await db.from('profiles').update({ department_id: dentalDept.id }).eq('id', dentist)

    const visitId = uuid()
    const patient = patientId(s, 'Karthik')
    await db.from('visits').insert({
      id: visitId, tenant_id: tenantId, patient_id: patient, doctor_id: dentist, type: 'opd',
      visit_date: new Date(Date.now() - 4 * 86400000).toISOString(),
      complaint: 'Pain in the lower right back tooth when chewing, for a week',
      diagnosis: 'Deep caries #30 with reversible pulpitis', icd_code: 'K02.1',
      notes: 'Restoration done under local anaesthetic. Advised review if pain persists.',
      vitals: { bp: '124/80', pulse: '76' },
      status: 'closed', consultation_fee: 400, billing_status: 'billed',
    })

    // The chart is the Universal Numbering System (1–32), not FDI — #30 is the
    // lower right first molar, #19 its counterpart on the left, #1 an upper
    // right wisdom tooth. The table rejects anything outside 1–32.
    const chart = await db.from('patient_dental_chart').insert([
      { id: uuid(), tenant_id: tenantId, patient_id: patient, tooth_number: 30, current_status: 'filled' },
      { id: uuid(), tenant_id: tenantId, patient_id: patient, tooth_number: 19, current_status: 'decayed' },
      { id: uuid(), tenant_id: tenantId, patient_id: patient, tooth_number: 14, current_status: 'crowned' },
      { id: uuid(), tenant_id: tenantId, patient_id: patient, tooth_number: 1, current_status: 'missing' },
    ])
    const treat = await db.from('dental_treatments').insert([
      { id: uuid(), tenant_id: tenantId, visit_id: visitId, patient_id: patient,
        tooth_number: 30, procedure: 'filling', price_snapshot: 1800,
        notes: 'Deep caries excavated, lined and restored.', billing_status: 'billed' },
      { id: uuid(), tenant_id: tenantId, visit_id: visitId, patient_id: patient,
        tooth_number: 19, procedure: 'cleaning', price_snapshot: 900, billing_status: 'billed' },
    ])
    ok('a dental visit with a charted mouth', chart.error ?? treat.error)
  }

  // ── The nursing rota for this week, and today's attendance ─────────────────
  const { data: shifts } = await db.from('shift_definitions')
    .select('id, code').eq('tenant_id', tenantId).eq('is_active', true)
  // Ordered the way the app lists them, so the rota lands in the unit the
  // roster screen opens on rather than whichever row Postgres returned first.
  const { data: units } = await db.from('nursing_units').select('id')
    .eq('tenant_id', tenantId).order('block').order('floor').order('wing')
  const nurses = s.staff.filter((x) => x.role === 'nurse')
  if (shifts?.length && nurses.length && units?.length) {
    // A nurse works one shift a day — duty_roster has a unique key on
    // (profile_id, date) — so the pair staff the first unit, which is the one
    // the roster screen opens on, alternating morning and night across the week.
    const rows: Record<string, unknown>[] = []
    for (let d = -2; d <= 4; d++) {
      nurses.forEach((n, i) => {
        const shift = shifts[(i + d + shifts.length * 2) % shifts.length]
        rows.push({
          id: uuid(), tenant_id: tenantId, profile_id: n.id, date: day(d),
          shift: shift.code, nursing_unit_id: units[0].id,
          status: 'published', source: 'manual', created_by: s.staff[0].id,
        })
      })
    }
    ok(`${rows.length} rostered shifts`, (await db.from('duty_roster').insert(rows)).error)

    // The ICU is staffed far more tightly than a general ward, which is the
    // whole reason the ratio is per unit and per shift rather than one number
    // for the hospital.
    const icu = units.at(-1)!.id
    await db.from('ward_coverage_rules').insert(
      ['morning', 'night'].map((code) => ({
        id: uuid(), tenant_id: tenantId, nursing_unit_id: icu,
        shift_code: code, patient_ratio: 2, min_nurses: 2,
      })))
    await db.from('ward_incharges').insert({
      id: uuid(), tenant_id: tenantId, nursing_unit_id: units[0].id, profile_id: nurses[0].id,
    })
    ok('an ICU coverage ratio and a unit in-charge', null)

    // One approved leave and one waiting on the in-charge — an approved one is
    // what the roster generator has to route around.
    ok('2 leave requests', (await db.from('leave_requests').insert([
      { id: uuid(), tenant_id: tenantId, profile_id: nurses[1].id, leave_type: 'annual',
        start_date: day(12), end_date: day(16), reason: 'Family wedding in Madurai',
        status: 'approved', reviewed_by: s.staff[0].id, reviewed_at: new Date().toISOString() },
      { id: uuid(), tenant_id: tenantId, profile_id: nurses[0].id, leave_type: 'casual',
        start_date: day(23), end_date: day(23), reason: 'Personal', status: 'pending' },
    ])).error)
  }

  const present = s.staff.filter((x) => ['nurse', 'pharmacist', 'receptionist', 'lab_tech'].includes(x.role))
  ok(`${present.length} attendance records today`, (await db.from('staff_attendance').insert(
    present.map((x, i) => ({
      id: uuid(), tenant_id: tenantId, profile_id: x.id, date: day(0),
      status: i === present.length - 1 ? 'leave' : 'present',
      shift: 'morning',
      check_in: i === present.length - 1 ? null : `08:${String(25 + i).padStart(2, '0')}:00`,
    })))).error)
}

/**
 * A family on the patient portal. Records are linked by id rather than by
 * Aadhaar — the demo hospital deliberately holds no Aadhaar numbers, and the
 * portal treats an explicit account link as ownership either way.
 */
async function createPortalFamily(tenantId: string, s: Seeded): Promise<void> {
  // patient_accounts is deliberately not tenant-scoped — one patient, many
  // hospitals — so purge_tenant_data never touches it and a re-seed would
  // collide with the account the last run left behind.
  const { data: old } = await db.from('patient_accounts').select('id').eq('email', PORTAL_EMAIL).maybeSingle()
  if (old) {
    await db.from('patients').update({ patient_account_id: null, patient_member_id: null })
      .eq('patient_account_id', old.id as string)
    await db.from('patient_members').delete().eq('account_id', old.id as string)
    await db.from('patient_accounts').delete().eq('id', old.id as string)
  }

  const accountId = uuid()
  const self = s.patients.find((p) => p.name.startsWith('Anand'))!
  const child = s.patients.find((p) => p.name.startsWith('Aarav'))!

  const acct = await db.from('patient_accounts').insert({
    id: accountId, full_name: self.name, email: PORTAL_EMAIL,
    // patient_accounts.phone is stored the way normalizePhone() writes it —
    // digits with the country code and no "+", which the portal adds on display.
    phone: '919999900001', password_hash: hashPassword(DEMO_PASSWORD),
    last_login_at: new Date().toISOString(),
  })
  if (acct.error) { ok('portal family', acct.error); return }

  const members = [
    { id: uuid(), account_id: accountId, full_name: self.name, relationship: 'self', is_self: true, patient: self.id },
    { id: uuid(), account_id: accountId, full_name: child.name, relationship: 'child', is_self: false, patient: child.id },
  ]
  const mem = await db.from('patient_members').insert(
    members.map(({ patient: _patient, ...m }) => m))
  if (mem.error) { ok('portal family', mem.error); return }

  for (const m of members) {
    await db.from('patients')
      .update({ patient_account_id: accountId, patient_member_id: m.id })
      .eq('id', m.patient).eq('tenant_id', tenantId)
  }
  ok('a portal family of two', null)
}

/**
 * The dashboard reads from materialized views, refreshed by pg_cron every five
 * minutes. A screenshot taken straight after seeding would otherwise show a
 * hospital with no beds and no footfall.
 */
async function refreshDashboard(): Promise<void> {
  const { error } = await db.rpc('refresh_dashboard_views')
  if (error) { console.log(`  · dashboard views: ${error.message} (pg_cron will catch up within 5 minutes)`); return }
  ok('dashboard views refreshed', null)
}

// ── run ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nSeeding "${DEMO_NAME}" (/${DEMO_SLUG})\n`)
  await wipe()
  const tenantId = await createTenant()
  const depts = await createDepartments(tenantId)
  const staff = await createStaff(tenantId, depts)
  await createWards(tenantId, depts)
  const patients = await createPatients(tenantId, staff)
  const tests = await createLabCatalogue(tenantId)
  await createStock(tenantId, staff)
  const seeded: Seeded = { patients, staff }
  await createVisits(tenantId, seeded, tests)
  await createAdmissions(tenantId, seeded)
  await completeSetup(tenantId, seeded)
  await createToday(tenantId, seeded)
  await createIpdBilling(tenantId, seeded)
  await createFinance(tenantId, seeded)
  await createRestOfHospital(tenantId, seeded)
  await createSpecialtiesAndRota(tenantId, seeded)
  await createPortalFamily(tenantId, seeded)
  await refreshDashboard()

  console.log(`
Done.

  tenant   ${tenantId}
  sign in  https://${DEMO_SLUG}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'uyirly.com'}/login
  admin    ${staff[0].email}
  portal   ${PORTAL_EMAIL}   (my.localhost:3000 in development)
  password ${DEMO_PASSWORD}

Every person in here is fictional. No Aadhaar, and the mobile numbers are a
99999 block that belongs to nobody.
`)
}

main()
