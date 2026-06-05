/**
 * HMS seed script (Phase 0 + Phase 3).
 * Usage: npx tsx scripts/seed.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 * The service-role key bypasses RLS — only use server-side.
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function uuid() {
  return crypto.randomUUID()
}

const DEPARTMENTS = [
  { id: uuid(), name: 'General Medicine',  description: 'Primary care and general health management' },
  { id: uuid(), name: 'Surgery',           description: 'Surgical procedures and post-operative care' },
  { id: uuid(), name: 'Pediatrics',        description: 'Medical care for infants, children, and adolescents' },
  { id: uuid(), name: 'Orthopedics',       description: 'Musculoskeletal conditions and joint care' },
]

interface SeedUser {
  email: string
  password: string
  full_name: string
  role: string
  department_id?: string
}

async function createUserWithProfile(user: SeedUser) {
  // Create auth user
  const { data, error } = await supabase.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
  })

  if (error) {
    if (error.message.toLowerCase().includes('already')) {
      console.log(`  ⚠  ${user.email} already exists — skipping`)
      return null
    }
    throw new Error(`Auth error for ${user.email}: ${error.message}`)
  }

  // Insert profile
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: data.user.id,
    full_name: user.full_name,
    role: user.role,
    department_id: user.department_id ?? null,
    is_active: true,
  })

  if (profileError) throw new Error(`Profile error for ${user.email}: ${profileError.message}`)

  return data.user.id
}

async function main() {
  console.log('\n🏥  HMS Phase 0 Seed\n')

  // 1. Departments
  console.log('Creating departments…')
  const { error: deptError } = await supabase.from('departments').upsert(DEPARTMENTS)
  if (deptError) {
    console.error('Department upsert failed:', deptError.message)
    process.exit(1)
  }
  DEPARTMENTS.forEach((d) => console.log(`  ✓  ${d.name}`))

  // 2. Admin user
  const adminPassword = `Admin@${Math.random().toString(36).slice(2, 10)}`
  console.log('\nCreating admin user…')
  await createUserWithProfile({
    email: 'admin@hms.local',
    password: adminPassword,
    full_name: 'System Administrator',
    role: 'admin',
  })

  // 3. Doctors
  const doctors: SeedUser[] = [
    { email: 'dr.sharma@hms.local',   password: 'Doctor@2024!', full_name: 'Dr. Priya Sharma',   role: 'doctor', department_id: DEPARTMENTS[0].id },
    { email: 'dr.verma@hms.local',    password: 'Doctor@2024!', full_name: 'Dr. Arjun Verma',    role: 'doctor', department_id: DEPARTMENTS[1].id },
    { email: 'dr.nair@hms.local',     password: 'Doctor@2024!', full_name: 'Dr. Lakshmi Nair',   role: 'doctor', department_id: DEPARTMENTS[2].id },
    { email: 'dr.iyer@hms.local',     password: 'Doctor@2024!', full_name: 'Dr. Rajesh Iyer',    role: 'doctor', department_id: DEPARTMENTS[3].id },
  ]

  console.log('\nCreating doctors…')
  for (const doc of doctors) {
    await createUserWithProfile(doc)
    console.log(`  ✓  ${doc.full_name} (${doc.email})`)
  }

  // 4. Phase 3 staff: lab tech + pharmacist + nurse
  const phase3Staff: SeedUser[] = [
    { email: 'labtech@hms.local',       password: 'Staff@2024!', full_name: 'Renu Pillai',       role: 'lab_tech' },
    { email: 'pharmacist@hms.local',    password: 'Staff@2024!', full_name: 'Sunil Mathur',      role: 'pharmacist' },
    { email: 'nurse.maya@hms.local',    password: 'Staff@2024!', full_name: 'Maya Krishnan',     role: 'nurse' },
  ]
  console.log('\nCreating Phase 3 staff…')
  for (const staff of phase3Staff) {
    await createUserWithProfile(staff)
    console.log(`  ✓  ${staff.full_name} (${staff.email}) — ${staff.role}`)
  }

  // 5. Lab tests catalog
  const labTests = [
    { id: uuid(), name: 'Complete Blood Count (CBC)',   code: 'CBC',  sample_type: 'blood', unit: 'cells/µL', ref_low: null,  ref_high: null,  reference_range: 'See report',  price: 350, is_active: true },
    { id: uuid(), name: 'Blood Glucose (Fasting)',      code: 'FBS',  sample_type: 'blood', unit: 'mg/dL',   ref_low: 70,    ref_high: 100,   reference_range: '70–100 mg/dL', price: 120, is_active: true },
    { id: uuid(), name: 'Blood Glucose (PP)',           code: 'PPBS', sample_type: 'blood', unit: 'mg/dL',   ref_low: null,  ref_high: 140,   reference_range: '<140 mg/dL',  price: 120, is_active: true },
    { id: uuid(), name: 'HbA1c',                        code: 'HBA1C',sample_type: 'blood', unit: '%',       ref_low: null,  ref_high: 5.7,   reference_range: '<5.7%',        price: 500, is_active: true },
    { id: uuid(), name: 'Liver Function Test (LFT)',    code: 'LFT',  sample_type: 'blood', unit: null,      ref_low: null,  ref_high: null,  reference_range: 'See report',  price: 650, is_active: true },
    { id: uuid(), name: 'Renal Function Test (RFT)',    code: 'RFT',  sample_type: 'blood', unit: null,      ref_low: null,  ref_high: null,  reference_range: 'See report',  price: 600, is_active: true },
    { id: uuid(), name: 'Serum Creatinine',             code: 'SCR',  sample_type: 'blood', unit: 'mg/dL',   ref_low: 0.6,   ref_high: 1.2,   reference_range: '0.6–1.2 mg/dL',price: 180, is_active: true },
    { id: uuid(), name: 'Blood Urea Nitrogen (BUN)',    code: 'BUN',  sample_type: 'blood', unit: 'mg/dL',   ref_low: 7,     ref_high: 25,    reference_range: '7–25 mg/dL',   price: 160, is_active: true },
    { id: uuid(), name: 'Lipid Profile',                code: 'LIPID',sample_type: 'blood', unit: null,      ref_low: null,  ref_high: null,  reference_range: 'See report',  price: 750, is_active: true },
    { id: uuid(), name: 'Thyroid Function (T3/T4/TSH)', code: 'TFT',  sample_type: 'blood', unit: null,      ref_low: null,  ref_high: null,  reference_range: 'See report',  price: 900, is_active: true },
    { id: uuid(), name: 'Urine Routine & Microscopy',  code: 'URE',  sample_type: 'urine', unit: null,      ref_low: null,  ref_high: null,  reference_range: 'See report',  price: 150, is_active: true },
    { id: uuid(), name: 'Dengue NS1 Antigen',           code: 'DNS1', sample_type: 'blood', unit: null,      ref_low: null,  ref_high: null,  reference_range: 'Negative',    price: 800, is_active: true },
    { id: uuid(), name: 'Malaria Antigen Test',         code: 'MAL',  sample_type: 'blood', unit: null,      ref_low: null,  ref_high: null,  reference_range: 'Negative',    price: 400, is_active: true },
    { id: uuid(), name: 'COVID-19 Antigen (RAT)',        code: 'COV',  sample_type: 'swab',  unit: null,      ref_low: null,  ref_high: null,  reference_range: 'Negative',    price: 350, is_active: true },
    { id: uuid(), name: 'CRP (C-Reactive Protein)',     code: 'CRP',  sample_type: 'blood', unit: 'mg/L',    ref_low: null,  ref_high: 10,    reference_range: '<10 mg/L',     price: 450, is_active: true },
  ]

  console.log('\nSeeding lab tests catalog…')
  const { error: labCatErr } = await supabase.from('lab_tests_catalog').upsert(labTests, { onConflict: 'code' })
  if (labCatErr) console.error('  Lab catalog error:', labCatErr.message)
  else console.log(`  ✓  ${labTests.length} lab tests added`)

  // 6. Radiology catalog
  const radiologyTests = [
    { id: uuid(), name: 'Chest X-Ray (PA View)',        modality: 'xray', price: 300,  is_active: true },
    { id: uuid(), name: 'Abdomen X-Ray (Erect)',        modality: 'xray', price: 300,  is_active: true },
    { id: uuid(), name: 'Skull X-Ray (AP + Lateral)',   modality: 'xray', price: 350,  is_active: true },
    { id: uuid(), name: 'Lumbar Spine X-Ray',           modality: 'xray', price: 400,  is_active: true },
    { id: uuid(), name: 'USG Abdomen & Pelvis',         modality: 'usg',  price: 700,  is_active: true },
    { id: uuid(), name: 'USG Obstetric',                modality: 'usg',  price: 800,  is_active: true },
    { id: uuid(), name: 'USG Thyroid',                  modality: 'usg',  price: 600,  is_active: true },
    { id: uuid(), name: 'CT Brain Plain',               modality: 'ct',   price: 3500, is_active: true },
    { id: uuid(), name: 'CT Chest (HRCT)',              modality: 'ct',   price: 4500, is_active: true },
    { id: uuid(), name: 'CT Abdomen with Contrast',     modality: 'ct',   price: 5500, is_active: true },
    { id: uuid(), name: 'MRI Brain with Contrast',      modality: 'mri',  price: 8000, is_active: true },
    { id: uuid(), name: 'MRI Lumbar Spine',             modality: 'mri',  price: 7500, is_active: true },
    { id: uuid(), name: 'MRI Knee',                     modality: 'mri',  price: 7000, is_active: true },
  ]

  console.log('\nSeeding radiology catalog…')
  const { error: radCatErr } = await supabase.from('radiology_catalog').upsert(radiologyTests, { onConflict: 'id' })
  if (radCatErr) console.error('  Radiology catalog error:', radCatErr.message)
  else console.log(`  ✓  ${radiologyTests.length} imaging procedures added`)

  // 7. Drug catalog + batches
  const expiry1 = '2026-12-31'
  const expiry2 = '2027-06-30'
  const drugs = [
    { id: uuid(), name: 'Paracetamol',      generic_name: 'Acetaminophen',  form: 'tablet',    strength: '500 mg',    unit: 'tablet', reorder_level: 100, is_active: true },
    { id: uuid(), name: 'Amoxicillin',      generic_name: 'Amoxicillin',    form: 'capsule',   strength: '500 mg',    unit: 'capsule', reorder_level: 50,  is_active: true },
    { id: uuid(), name: 'Metformin',        generic_name: 'Metformin HCl',  form: 'tablet',    strength: '500 mg',    unit: 'tablet', reorder_level: 80,  is_active: true },
    { id: uuid(), name: 'Omeprazole',       generic_name: 'Omeprazole',     form: 'capsule',   strength: '20 mg',     unit: 'capsule', reorder_level: 60,  is_active: true },
    { id: uuid(), name: 'Amlodipine',       generic_name: 'Amlodipine',     form: 'tablet',    strength: '5 mg',      unit: 'tablet', reorder_level: 60,  is_active: true },
    { id: uuid(), name: 'Atorvastatin',     generic_name: 'Atorvastatin',   form: 'tablet',    strength: '10 mg',     unit: 'tablet', reorder_level: 50,  is_active: true },
    { id: uuid(), name: 'Azithromycin',     generic_name: 'Azithromycin',   form: 'tablet',    strength: '500 mg',    unit: 'tablet', reorder_level: 30,  is_active: true },
    { id: uuid(), name: 'Ondansetron',      generic_name: 'Ondansetron HCl',form: 'tablet',    strength: '4 mg',      unit: 'tablet', reorder_level: 40,  is_active: true },
    { id: uuid(), name: 'Pantoprazole',     generic_name: 'Pantoprazole',   form: 'tablet',    strength: '40 mg',     unit: 'tablet', reorder_level: 60,  is_active: true },
    { id: uuid(), name: 'Cetirizine',       generic_name: 'Cetirizine HCl', form: 'tablet',    strength: '10 mg',     unit: 'tablet', reorder_level: 50,  is_active: true },
  ]

  console.log('\nSeeding drug catalog…')
  const { error: drugErr } = await supabase.from('drugs').upsert(drugs, { onConflict: 'id' })
  if (drugErr) console.error('  Drugs error:', drugErr.message)
  else console.log(`  ✓  ${drugs.length} drugs added`)

  // Batches for each drug
  const batches = drugs.flatMap((d) => [
    { id: uuid(), drug_id: d.id, batch_no: `B2024-001`, expiry: expiry1, qty_available: 500, purchase_price: 3.5,  mrp: 5.0 },
    { id: uuid(), drug_id: d.id, batch_no: `B2024-002`, expiry: expiry2, qty_available: 300, purchase_price: 3.8,  mrp: 5.5 },
  ])

  const { error: batchErr } = await supabase.from('drug_batches').upsert(batches, { onConflict: 'id' })
  if (batchErr) console.error('  Drug batches error:', batchErr.message)
  else console.log(`  ✓  ${batches.length} drug batches added`)

  // 8. Bootstrap audit log
  await supabase.from('audit_logs').insert({
    id: uuid(),
    actor_id: null,
    action: 'seed',
    entity: 'system',
    entity_id: null,
    meta: { departments: DEPARTMENTS.map((d) => d.name), seeded_at: new Date().toISOString() },
  })

  console.log('\n✅  Seed complete!\n')
  console.log('┌──────────────────────────────────────────────────┐')
  console.log('│  Admin credentials                               │')
  console.log('│  Email:    admin@hms.local                       │')
  console.log(`│  Password: ${adminPassword.padEnd(38)}│`)
  console.log('│                                                  │')
  console.log('│  Doctor password (all): Doctor@2024!             │')
  console.log('│  Staff password (lab/pharm/nurse): Staff@2024!   │')
  console.log('└──────────────────────────────────────────────────┘\n')
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
