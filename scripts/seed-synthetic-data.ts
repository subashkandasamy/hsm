/**
 * Phase 10.2 — Synthetic dataset seeder
 * Usage: npx tsx scripts/seed-synthetic-data.ts
 *
 * Inserts ~50k rows across the 5 partitioned tables to validate indexes and
 * query plans with EXPLAIN ANALYZE. Requires SUPABASE_SERVICE_ROLE_KEY.
 * Safe to run multiple times (uses random UUIDs for all IDs).
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SEED_TENANT   = '00000000-0000-0000-0000-000000000001'

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function uuid(): string {
  return crypto.randomUUID()
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function randDateInRange(daysBack: number): string {
  return daysAgo(randInt(0, daysBack))
}

async function chunk<T>(items: T[], size: number, fn: (batch: T[]) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await fn(items.slice(i, i + size))
  }
}

// ── Resolve seed data refs ────────────────────────────────────────────────────
async function resolveRefs() {
  const [patientsRes, doctorsRes, deptsRes, labTestsRes, billsRes, labOrdersRes] = await Promise.all([
    db.from('patients').select('id').eq('tenant_id', SEED_TENANT).limit(200),
    db.from('profiles').select('id').eq('tenant_id', SEED_TENANT).in('role', ['doctor']).limit(20),
    db.from('departments').select('id').eq('tenant_id', SEED_TENANT).limit(10),
    db.from('lab_tests_catalog').select('id').eq('tenant_id', SEED_TENANT).limit(20),
    db.from('bills').select('id').eq('tenant_id', SEED_TENANT).limit(100),
    db.from('lab_orders').select('id').eq('tenant_id', SEED_TENANT).limit(100),
  ])

  return {
    patients:  (patientsRes.data ?? []).map((r) => r.id as string),
    doctors:   (doctorsRes.data  ?? []).map((r) => r.id as string),
    depts:     (deptsRes.data    ?? []).map((r) => r.id as string),
    labTests:  (labTestsRes.data ?? []).map((r) => r.id as string),
    bills:     (billsRes.data    ?? []).map((r) => r.id as string),
    labOrders: (labOrdersRes.data ?? []).map((r) => r.id as string),
  }
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)]
}

// ── Seed appointments ─────────────────────────────────────────────────────────
async function seedAppointments(refs: Awaited<ReturnType<typeof resolveRefs>>, count: number) {
  if (!refs.patients.length || !refs.doctors.length) {
    console.warn('No patients or doctors found — skipping appointments')
    return
  }

  const statuses = ['booked','checked_in','done','cancelled','no_show']
  const rows = Array.from({ length: count }, () => {
    const scheduledAt = randDateInRange(90)
    return {
      id:            uuid(),
      tenant_id:     SEED_TENANT,
      patient_id:    pick(refs.patients),
      doctor_id:     pick(refs.doctors),
      department_id: refs.depts.length ? pick(refs.depts) : null,
      scheduled_at:  scheduledAt,
      token_no:      randInt(1, 50),
      status:        pick(statuses),
      created_at:    scheduledAt,
    }
  })

  await chunk(rows, 500, async (batch) => {
    const { error } = await db.from('appointments').insert(batch)
    if (error) console.error('appointments insert error:', error.message)
  })
  console.log(`  ✓ ${count} appointments`)
}

// ── Seed visits ───────────────────────────────────────────────────────────────
async function seedVisits(refs: Awaited<ReturnType<typeof resolveRefs>>, count: number) {
  if (!refs.patients.length || !refs.doctors.length) {
    console.warn('No patients or doctors found — skipping visits')
    return
  }

  const statuses = ['open', 'closed']
  const types    = ['opd', 'ipd', 'emergency']
  const rows = Array.from({ length: count }, () => {
    const visitDate = randDateInRange(90)
    return {
      id:         uuid(),
      tenant_id:  SEED_TENANT,
      patient_id: pick(refs.patients),
      doctor_id:  pick(refs.doctors),
      type:       pick(types),
      visit_date: visitDate,
      status:     pick(statuses),
      created_at: visitDate,
    }
  })

  await chunk(rows, 500, async (batch) => {
    const { error } = await db.from('visits').insert(batch)
    if (error) console.error('visits insert error:', error.message)
  })
  console.log(`  ✓ ${count} visits`)
}

// ── Seed bill_items ───────────────────────────────────────────────────────────
async function seedBillItems(refs: Awaited<ReturnType<typeof resolveRefs>>, count: number) {
  if (!refs.bills.length) {
    console.warn('No bills found — skipping bill_items')
    return
  }

  const sources = ['consultation','bed','lab','radiology','pharmacy','manual']
  const rows = Array.from({ length: count }, () => {
    const createdAt = randDateInRange(90)
    const qty       = randInt(1, 5)
    const unitPrice = randInt(50, 2000)
    return {
      id:          uuid(),
      tenant_id:   SEED_TENANT,
      bill_id:     pick(refs.bills),
      source:      pick(sources),
      description: `Synthetic ${pick(sources)} charge`,
      qty,
      unit_price:  unitPrice,
      amount:      qty * unitPrice,
      created_at:  createdAt,
    }
  })

  await chunk(rows, 500, async (batch) => {
    const { error } = await db.from('bill_items').insert(batch)
    if (error) console.error('bill_items insert error:', error.message)
  })
  console.log(`  ✓ ${count} bill_items`)
}

// ── Seed lab_order_items ──────────────────────────────────────────────────────
async function seedLabOrderItems(refs: Awaited<ReturnType<typeof resolveRefs>>, count: number) {
  if (!refs.labOrders.length || !refs.labTests.length) {
    console.warn('No lab_orders or lab tests found — skipping lab_order_items')
    return
  }

  const flags = ['pending','normal','high','low']
  const rows = Array.from({ length: count }, () => ({
    id:             uuid(),
    tenant_id:      SEED_TENANT,
    lab_order_id:   pick(refs.labOrders),
    test_id:        pick(refs.labTests),
    price_snapshot: randInt(100, 1500),
    result_value:   Math.random() > 0.3 ? randInt(10, 200) : null,
    flag:           pick(flags),
    created_at:     randDateInRange(90),
  }))

  await chunk(rows, 500, async (batch) => {
    const { error } = await db.from('lab_order_items').insert(batch)
    if (error) console.error('lab_order_items insert error:', error.message)
  })
  console.log(`  ✓ ${count} lab_order_items`)
}

// ── Seed audit_logs ───────────────────────────────────────────────────────────
async function seedAuditLogs(refs: Awaited<ReturnType<typeof resolveRefs>>, count: number) {
  const entities = ['patient','appointment','visit','bill','lab_order','admission']
  const actions  = ['create','update','delete','view']
  const rows = Array.from({ length: count }, () => {
    const createdAt = randDateInRange(90)
    return {
      id:         uuid(),
      tenant_id:  SEED_TENANT,
      actor_id:   refs.doctors.length ? pick(refs.doctors) : null,
      action:     pick(actions),
      entity:     pick(entities),
      entity_id:  uuid(),
      created_at: createdAt,
    }
  })

  await chunk(rows, 500, async (batch) => {
    const { error } = await db.from('audit_logs').insert(batch)
    if (error) console.error('audit_logs insert error:', error.message)
  })
  console.log(`  ✓ ${count} audit_logs`)
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Resolving seed tenant refs …')
  const refs = await resolveRefs()
  console.log(`  patients: ${refs.patients.length}, doctors: ${refs.doctors.length}, bills: ${refs.bills.length}`)

  console.log('\nSeeding partitioned tables …')
  await seedAppointments(refs, 10_000)
  await seedVisits(refs,        8_000)
  await seedBillItems(refs,     15_000)
  await seedLabOrderItems(refs, 10_000)
  await seedAuditLogs(refs,     7_000)

  console.log('\nDone. Run EXPLAIN ANALYZE on your slow queries to validate index usage.')
}

main().catch((e) => { console.error(e); process.exit(1) })
