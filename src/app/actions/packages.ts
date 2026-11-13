'use server'

/**
 * Test packages (0296) — several lab tests and/or scans sold together at one
 * price, like a health check-up.
 *
 * A package is only a recipe. Ordering one creates ordinary orders — one lab
 * order holding every lab test, one radiology order per scan — through
 * `create_package_order`, which writes every row or none. Everything after
 * that (tubes, result lines, analyzers, verification, reports, portal, the
 * pay-before-sample gate) is the existing lab and radiology path, untouched.
 *
 * The price is shared across the tests in proportion to their own prices
 * (src/lib/lab/packagePrice.ts), and each share is that order's price, so every
 * bill line keeps its own department.
 */

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { createServiceBill } from '@/lib/billing/serviceBill'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess, requireModule, actorCan } from '@/lib/server-utils'
import { assertTreatmentStarted } from '@/app/actions/ipdDeclaration'
import { cancelLabOrder } from '@/app/actions/lab'
import { cancelRadiologyOrder } from '@/app/actions/radiology'
import { cancelIpdLabOrder, cancelIpdRadiologyOrder } from '@/app/actions/ipdTreatment'
import { appliesToPatient, sharePackagePrice, type PackageAppliesTo } from '@/lib/lab/packagePrice'
import { istToday } from '@/lib/istDate'
import type { TestPackage, TestPackageItem } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

const MAX_PRICE = 10_00_000
const APPLIES: readonly PackageAppliesTo[] = ['all', 'female', 'male']

// ── Reading ──────────────────────────────────────────────────────────────────

type Supa = Awaited<ReturnType<typeof createClient>>

/** Packages with their tests, today's prices, and anything that blocks ordering. */
async function readPackages(supabase: Supa, ids?: string[]): Promise<TestPackage[]> {
  let q = supabase.from('test_packages').select('id, name, price, is_active').order('name').limit(500)
  if (ids) q = q.in('id', ids)
  const { data: pkgs, error } = await q
  if (error) { console.error('[readPackages]', error.message); return [] }
  if (!pkgs?.length) return []

  const { data: rows } = await supabase.from('test_package_items')
    .select('package_id, lab_test_id, radiology_test_id, applies_to, display_order')
    .in('package_id', pkgs.map((p) => p.id))
    .order('display_order')
    .limit(5000)

  const labIds = [...new Set((rows ?? []).map((r) => r.lab_test_id).filter(Boolean))] as string[]
  const radIds = [...new Set((rows ?? []).map((r) => r.radiology_test_id).filter(Boolean))] as string[]
  const [{ data: labs }, { data: rads }] = await Promise.all([
    labIds.length
      ? supabase.from('lab_tests_catalog').select('id, name, price, is_active, package_only').in('id', labIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; price: number; is_active: boolean; package_only: boolean }> }),
    radIds.length
      ? supabase.from('radiology_catalog').select('id, name, price, is_active').in('id', radIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; price: number; is_active: boolean }> }),
  ])
  const labById = new Map((labs ?? []).map((t) => [t.id as string, t]))
  const radById = new Map((rads ?? []).map((t) => [t.id as string, t]))

  return pkgs.map((p) => {
    const items: TestPackageItem[] = (rows ?? []).filter((r) => r.package_id === p.id).map((r) => {
      if (r.lab_test_id) {
        const t = labById.get(r.lab_test_id as string)
        return {
          kind: 'lab' as const, test_id: r.lab_test_id as string,
          name: (t?.name as string) ?? 'A test no longer in your list',
          price: Number(t?.price ?? 0), applies_to: r.applies_to as PackageAppliesTo,
          available: !!t && t.is_active === true && t.package_only !== true,
        }
      }
      const t = radById.get(r.radiology_test_id as string)
      return {
        kind: 'scan' as const, test_id: r.radiology_test_id as string,
        name: (t?.name as string) ?? 'A scan no longer in your list',
        price: Number(t?.price ?? 0), applies_to: r.applies_to as PackageAppliesTo,
        available: !!t && t.is_active === true,
      }
    })
    return {
      id: p.id as string, name: p.name as string, price: Number(p.price), is_active: p.is_active as boolean,
      items,
      separate_total: Math.round(items.reduce((s, i) => s + i.price, 0) * 100) / 100,
      problems: items.filter((i) => !i.available).map((i) => `${i.name} is switched off`),
    }
  })
}

/** Every package, for the catalogue screen. */
export async function listPackages(): Promise<TestPackage[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:read')
  return readPackages(await createClient())
}

/** Packages that can be ordered now: switched on, and every test still offered. */
export async function listOrderablePackages(): Promise<TestPackage[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:order')
  return (await readPackages(await createClient())).filter((p) => p.is_active && p.problems.length === 0)
}

// ── Making and changing one ──────────────────────────────────────────────────

export interface PackageInput {
  id?: string
  name: string
  price: number
  items: Array<{ kind: 'lab' | 'scan'; test_id: string; applies_to: PackageAppliesTo }>
}

export async function savePackage(
  input: PackageInput,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:manage')

  const name = (input.name ?? '').trim()
  const price = Math.round(Number(input.price) * 100) / 100
  if (!name) return { success: false, error: 'Give the package a name' }
  if (name.length > 120) return { success: false, error: 'Keep the name under 120 characters' }
  if (!(price > 0)) return { success: false, error: 'Enter the package price' }
  if (price > MAX_PRICE) return { success: false, error: 'That price looks wrong — check the number of zeros' }

  // One row per test; the last choice of "for whom" wins.
  const seen = new Map<string, PackageInput['items'][number]>()
  for (const it of input.items ?? []) {
    if (!it?.test_id || (it.kind !== 'lab' && it.kind !== 'scan')) continue
    seen.set(`${it.kind}:${it.test_id}`, { ...it, applies_to: APPLIES.includes(it.applies_to) ? it.applies_to : 'all' })
  }
  const items = [...seen.values()]
  if (items.length < 2) return { success: false, error: 'A package needs at least two tests — one test on its own is just a test' }

  const supabase = await createClient()

  // Only tests the hospital sells today: switched on, and not a hidden part of another test.
  const labIds = items.filter((i) => i.kind === 'lab').map((i) => i.test_id)
  const radIds = items.filter((i) => i.kind === 'scan').map((i) => i.test_id)
  if (labIds.length) {
    const { data } = await supabase.from('lab_tests_catalog').select('id, name, is_active, package_only').in('id', labIds)
    const ok = new Map((data ?? []).map((t) => [t.id as string, t]))
    for (const id of labIds) {
      const t = ok.get(id)
      if (!t) return { success: false, error: 'One of those tests is not in your list — refresh and try again' }
      if (!t.is_active) return { success: false, error: `${t.name} is switched off — switch it on or take it out` }
      if (t.package_only) return { success: false, error: `${t.name} is part of another test, not something sold on its own` }
    }
  }
  if (radIds.length) {
    const { data } = await supabase.from('radiology_catalog').select('id, name, is_active').in('id', radIds)
    const ok = new Map((data ?? []).map((t) => [t.id as string, t]))
    for (const id of radIds) {
      const t = ok.get(id)
      if (!t) return { success: false, error: 'One of those scans is not in your list — refresh and try again' }
      if (!t.is_active) return { success: false, error: `${t.name} is switched off — switch it on or take it out` }
    }
  }

  const id = input.id ?? crypto.randomUUID()
  const now = new Date().toISOString()
  if (input.id) {
    const { data: upd, error } = await supabase.from('test_packages')
      .update({ name, price, updated_at: now }).eq('id', id).select('id')
    if (error) return { success: false, error: nameClash(error) }
    if (!upd?.length) return { success: false, error: 'That package no longer exists' }
  } else {
    const { error } = await supabase.from('test_packages').insert({
      id, tenant_id: actor.tenant_id, name, price, is_active: true, created_by: actor.id,
    })
    if (error) return { success: false, error: nameClash(error) }
  }

  // Bring the contents in line with what was saved: add, re-order, take out.
  const { data: existing } = await supabase.from('test_package_items')
    .select('id, lab_test_id, radiology_test_id').eq('package_id', id).limit(1000)
  const keyOf = (r: { lab_test_id: string | null; radiology_test_id: string | null }) =>
    r.lab_test_id ? `lab:${r.lab_test_id}` : `scan:${r.radiology_test_id}`
  const have = new Map((existing ?? []).map((r) => [keyOf(r as { lab_test_id: string | null; radiology_test_id: string | null }), r.id as string]))

  const toAdd = items.map((it, i) => ({ it, i })).filter(({ it }) => !have.has(`${it.kind}:${it.test_id}`))
  if (toAdd.length) {
    const { error } = await supabase.from('test_package_items').insert(toAdd.map(({ it, i }) => ({
      id: crypto.randomUUID(), tenant_id: actor.tenant_id, package_id: id,
      lab_test_id: it.kind === 'lab' ? it.test_id : null,
      radiology_test_id: it.kind === 'scan' ? it.test_id : null,
      applies_to: it.applies_to, display_order: i,
    })))
    if (error) return { success: false, error: error.message }
  }
  for (const [i, it] of items.entries()) {
    const rowId = have.get(`${it.kind}:${it.test_id}`)
    if (!rowId) continue
    const { error } = await supabase.from('test_package_items')
      .update({ applies_to: it.applies_to, display_order: i }).eq('id', rowId)
    if (error) return { success: false, error: error.message }
  }
  const wanted = new Set(items.map((it) => `${it.kind}:${it.test_id}`))
  const toRemove = [...have.entries()].filter(([k]) => !wanted.has(k)).map(([, rowId]) => rowId)
  if (toRemove.length) {
    const { error } = await supabase.from('test_package_items').delete().in('id', toRemove)
    if (error) return { success: false, error: error.message }
  }

  await logAudit(actor.id, input.id ? 'update' : 'create', 'test_package', id, { name, price, tests: items.length })
  return { success: true, id }
}

function nameClash(error: { code?: string; message: string }): string {
  return error.code === '23505' ? 'A package with that name already exists' : error.message
}

export async function setPackageActive(id: string, active: boolean): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:manage')
  const supabase = await createClient()
  const { data, error } = await supabase.from('test_packages')
    .update({ is_active: active, updated_at: new Date().toISOString() }).eq('id', id).select('id')
  if (error) return { success: false, error: error.message }
  if (!data?.length) return { success: false, error: 'That package no longer exists' }
  await logAudit(actor.id, 'update', 'test_package', id, { is_active: active })
  return { success: true }
}

// ── Ordering one ─────────────────────────────────────────────────────────────

export interface OrderPackageResult {
  success: true
  packageOrderId: string
  labOrderId: string | null
  radiologyOrderIds: string[]
  /** Tests left out because they are for the other sex. */
  skipped: string[]
  /** The patient's sex is not recorded and the package has tests for one sex — both were kept. */
  keptBoth: string[]
}

export async function orderPackage(input: {
  package_id: string
  patient_id: string
  visit_id?: string | null
  admission_id?: string | null
  priority?: 'stat' | 'routine'
  scheduled_for?: string | null
}): Promise<OrderPackageResult | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:order')

  const admissionId = input.admission_id ?? null
  if (admissionId) {
    await requireModule('ipd')
    const gate = await assertTreatmentStarted(admissionId)
    if (!gate.success) return gate
  }

  const supabase = await createClient()
  const [pkg] = await readPackages(supabase, [input.package_id])
  if (!pkg) return { success: false, error: 'That package is not in your list' }
  if (!pkg.is_active) return { success: false, error: 'That package is switched off' }
  if (pkg.problems.length) return { success: false, error: `Fix the package first: ${pkg.problems.join(', ')}` }

  const { data: patient } = await supabase.from('patients').select('id, gender').eq('id', input.patient_id).maybeSingle()
  if (!patient) return { success: false, error: 'Patient not found' }
  const gender = (patient.gender as string | null) ?? null

  const mine = pkg.items.filter((i) => appliesToPatient(i.applies_to, gender))
  const skipped = pkg.items.filter((i) => !appliesToPatient(i.applies_to, gender)).map((i) => i.name)
  const keptBoth = gender !== 'male' && gender !== 'female'
    ? pkg.items.filter((i) => i.applies_to !== 'all').map((i) => i.name) : []
  if (!mine.length) return { success: false, error: 'Nothing in this package applies to this patient' }

  if (mine.some((i) => i.kind === 'scan') && !(await actorCan('radiology:order'))) {
    return { success: false, error: 'This package includes a scan, and your role cannot order scans' }
  }

  const shares = sharePackagePrice(pkg.price, mine.map((i) => ({ key: `${i.kind}:${i.test_id}`, price: i.price })))
  const share = (i: TestPackageItem) => shares.get(`${i.kind}:${i.test_id}`) ?? 0
  const labs = mine.filter((i) => i.kind === 'lab')
  const scans = mine.filter((i) => i.kind === 'scan')

  const { data: made, error } = await supabase.rpc('create_package_order', {
    p_package_id: pkg.id,
    p_patient_id: input.patient_id,
    p_visit_id: input.visit_id ?? null,
    p_admission_id: admissionId,
    p_priority: input.priority ?? 'routine',
    p_scheduled_for: admissionId ? (input.scheduled_for ?? istToday()) : null,
    p_lab: labs.map((i) => ({ test_id: i.test_id, price: share(i) })),
    p_radiology: scans.map((i) => ({ test_id: i.test_id, price: share(i) })),
    p_price: pkg.price,
  })
  if (error) return { success: false, error: error.message }
  const res = made as { ok: boolean; error?: string; package_order_id?: string; lab_order_id?: string | null; radiology_order_ids?: string[] }
  if (!res?.ok) return { success: false, error: res?.error ?? 'Could not order the package' }

  const packageOrderId = res.package_order_id as string
  const labOrderId = res.lab_order_id ?? null
  const radIds = res.radiology_order_ids ?? []

  // The bill: one line per test, each its share, each in its own department.
  const labLines = labOrderId ? labs.map((i) => ({
    source: 'lab' as const, ref_id: labOrderId,
    description: `${pkg.name} — ${i.name}`, qty: 1, unit_price: share(i),
  })) : []
  const scanLines = scans.map((i, n) => ({
    source: 'radiology' as const, ref_id: radIds[n],
    description: `${pkg.name} — ${i.name}`, qty: 1, unit_price: share(i),
  }))

  if (admissionId) {
    const { autoIpdBill } = await import('@/lib/ipdBilling')
    const billingDate = istToday()
    if (labLines.some((l) => l.unit_price > 0)) {
      await autoIpdBill(supabase, actor.id, {
        tenantId: actor.tenant_id, admissionId, patientId: input.patient_id, billingDate, billSource: 'lab', lineItems: labLines,
      })
      await supabase.from('lab_orders').update({ billing_status: 'billed' }).eq('id', labOrderId as string)
    }
    if (scanLines.some((l) => l.unit_price > 0)) {
      await autoIpdBill(supabase, actor.id, {
        tenantId: actor.tenant_id, admissionId, patientId: input.patient_id, billingDate, billSource: 'radiology', lineItems: scanLines,
      })
      await supabase.from('radiology_orders').update({ billing_status: 'billed' }).in('id', radIds)
    }
  } else {
    const lines = [...labLines, ...scanLines]
    if (lines.some((l) => l.unit_price > 0)) {
      const bill = await createServiceBill(supabase, {
        tenantId: actor.tenant_id, patientId: input.patient_id, actorId: actor.id, visitId: input.visit_id ?? null,
        billSource: labLines.length ? 'lab' : 'radiology',
        lines,
      })
      // As for a single order: a failed bill is logged and the orders stay
      // 'unbilled', which the sample and scan gates refuse to go past.
      if ('error' in bill) console.error('[orderPackage] bill failed:', bill.error)
      else {
        if (labOrderId) await supabase.from('lab_orders').update({ billing_status: 'billed' }).eq('id', labOrderId)
        if (radIds.length) await supabase.from('radiology_orders').update({ billing_status: 'billed' }).in('id', radIds)
      }
    }
  }

  // Tubes, so the label and the analyzer agree from the start.
  if (labOrderId) await supabase.rpc('ensure_lab_samples', { p_order_id: labOrderId })

  await logAudit(actor.id, 'create', 'package_order', packageOrderId, {
    package: pkg.name, price: pkg.price, patient_id: input.patient_id,
    tests: labs.length, scans: scans.length, skipped,
  })
  return { success: true, packageOrderId, labOrderId, radiologyOrderIds: radIds, skipped, keptBoth }
}

/**
 * Cancel a whole package: its lab order and its scans, each through the
 * ordinary cancel (which takes that order's lines off the bill). Anything
 * already reported stays, and is named.
 */
export async function cancelPackageOrder(packageOrderId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:order')
  const supabase = await createClient()

  const { data: po } = await supabase.from('package_orders')
    .select('id, name_snapshot, status, admission_id').eq('id', packageOrderId).maybeSingle()
  if (!po) return { success: false, error: 'That package order no longer exists' }
  if (po.status === 'cancelled') return { success: false, error: 'This package was already cancelled' }

  const [{ data: labOrders }, { data: radOrders }] = await Promise.all([
    supabase.from('lab_orders').select('id, status').eq('package_order_id', packageOrderId).limit(50),
    supabase.from('radiology_orders').select('id, status, test:radiology_catalog(name)').eq('package_order_id', packageOrderId).limit(50),
  ])
  const ipd = !!po.admission_id
  const kept: string[] = []

  for (const o of labOrders ?? []) {
    if (o.status === 'cancelled') continue
    const r = ipd ? await cancelIpdLabOrder(o.id as string) : await cancelLabOrder(o.id as string)
    if (!r.success) kept.push('the lab tests (results already released)')
  }
  for (const o of radOrders ?? []) {
    if (o.status === 'cancelled') continue
    if (['reported', 'verified'].includes(o.status as string)) {
      kept.push(`${(o.test as unknown as { name: string } | null)?.name ?? 'a scan'} (already reported)`)
      continue
    }
    const r = ipd ? await cancelIpdRadiologyOrder(o.id as string) : await cancelRadiologyOrder(o.id as string)
    if (!r.success) kept.push((o.test as unknown as { name: string } | null)?.name ?? 'a scan')
  }

  if (kept.length) {
    await logAudit(actor.id, 'cancel', 'package_order', packageOrderId, { partial: true, kept })
    return { success: false, error: `Cancelled what could be. Still standing: ${kept.join(', ')}.` }
  }
  await supabase.from('package_orders').update({ status: 'cancelled' }).eq('id', packageOrderId)
  await logAudit(actor.id, 'cancel', 'package_order', packageOrderId, { package: po.name_snapshot })
  return { success: true }
}
