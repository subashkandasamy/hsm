'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { istAddDays as istAddDaysLocal, istToday } from '@/lib/istDate'
import { createServiceBill } from '@/lib/billing/serviceBill'
import { dosesDueByNow, vaccinationStatus, type Deferral, type DoseStatus, type GivenDose, type ScheduleRow } from '@/lib/immunization/schedule'

type SimpleResult = { success: true } | { success: false; error: string }
type SupabaseClient = Awaited<ReturnType<typeof createClient>>

/** One pharmacy product (brand) stocked for a vaccine. */
export interface VaccineProduct {
  linkId: string
  productId: string
  isGlobal: boolean
  name: string
  inStock: number
  earliestExpiry: string | null
  price: number | null
}

/** What the pharmacy holds for a vaccine, and how it is supplied. */
export interface VaccineSupply {
  vaccine: string
  /** Government (UIP) stock — recorded with no charge and no pharmacy step. */
  free_supply: boolean
  products: VaccineProduct[]
  /** Doses in stock across all linked brands. */
  inStock: number
  /** The brand that would be used next (first to expire). */
  next: VaccineProduct | null
}

export interface Vaccination {
  supply: Record<string, VaccineSupply>
  dob: string | null
  ageDays: number | null
  today: string
  doses: DoseStatus[]
  /** Vaccines recorded as given today (date known). */
  givenToday: number
  /** Clinic preference: warn above this many vaccines in a day (null = no warning). */
  dailyWarnLimit: number | null
  /** The first-visit history check is still to be done. */
  needsHistoryCheck: boolean
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400000)

async function load(supabase: SupabaseClient, patientId: string): Promise<Vaccination & { tenantId: string | null }> {
  const today = istToday()
  const [{ data: patient }, { data: schedule }, { data: given }, { data: deferrals }, { data: profile }] = await Promise.all([
    supabase.from('patients').select('dob, tenant_id').eq('id', patientId).single(),
    supabase.from('immunization_schedule').select('vaccine, dose_label, due_age_days, min_age_days, max_age_days, prev_vaccine, prev_dose_label, min_interval_days, note, sort_order').order('sort_order'),
    supabase.from('patient_immunizations')
      .select('id, vaccine, dose_label, given_date, date_known, visit_id, fulfilment, charge_amount, batch_no, expiry_date, bill:bills(bill_no, status, paid, total)')
      .eq('patient_id', patientId),
    supabase.from('patient_immunization_deferrals').select('vaccine, dose_label, reason, deferred_on').eq('patient_id', patientId).order('created_at', { ascending: false }).limit(100),
    supabase.from('pediatric_profiles').select('vaccine_history_reviewed_at').eq('patient_id', patientId).maybeSingle(),
  ])
  const dob = (patient?.dob as string | null)?.slice(0, 10) ?? null
  const tenantId = (patient?.tenant_id as string | null) ?? null
  const supply = await loadSupply(supabase, [...new Set((schedule ?? []).map((r) => r.vaccine as string))], today)
  const { data: tenant } = tenantId ? await supabase.from('tenants').select('vaccine_daily_warn_limit').eq('id', tenantId).maybeSingle() : { data: null }
  const givenRows = (given ?? []) as unknown as GivenDose[]
  const doses = dob
    ? vaccinationStatus({ dob, today, schedule: (schedule ?? []) as unknown as ScheduleRow[], given: givenRows, deferrals: (deferrals ?? []) as unknown as Deferral[] })
    : []
  return {
    tenantId, dob, today, doses, supply,
    ageDays: dob ? dayDiff(dob, today) : null,
    givenToday: givenRows.filter((g) => g.date_known && g.given_date === today).length,
    dailyWarnLimit: (tenant?.vaccine_daily_warn_limit as number | null) ?? null,
    needsHistoryCheck: !!dob && dayDiff(dob, today) > 0 && givenRows.length === 0 && !profile?.vaccine_history_reviewed_at,
  }
}


/** Vaccine → its linked pharmacy products, stock per brand and the free-supply flag. */
async function loadSupply(supabase: SupabaseClient, vaccines: string[], today: string): Promise<Record<string, VaccineSupply>> {
  const out: Record<string, VaccineSupply> = {}
  for (const v of vaccines) out[v] = { vaccine: v, free_supply: false, products: [], inStock: 0, next: null }

  const [{ data: settings }, { data: links }] = await Promise.all([
    supabase.from('vaccine_settings').select('vaccine, free_supply'),
    supabase.from('vaccine_products').select('id, vaccine, drug_master_id, drug_id'),
  ])
  for (const st of settings ?? []) {
    const row = out[st.vaccine as string]
    if (row) row.free_supply = !!st.free_supply
  }
  const mine = (links ?? []).filter((l) => out[l.vaccine as string])
  if (!mine.length) return out

  const masterIds = mine.filter((l) => l.drug_master_id).map((l) => l.drug_master_id as string)
  const tenantIds = mine.filter((l) => l.drug_id).map((l) => l.drug_id as string)
  const [{ data: masters }, { data: drugs }, { data: batches }] = await Promise.all([
    masterIds.length ? supabase.from('drug_master').select('id, name, strength').in('id', masterIds) : Promise.resolve({ data: [] }),
    tenantIds.length ? supabase.from('drugs').select('id, name, strength').in('id', tenantIds) : Promise.resolve({ data: [] }),
    supabase.from('drug_batches').select('drug_master_id, drug_id, expiry, qty_available, mrp')
      .gt('expiry', today).gt('qty_available', 0).order('expiry'),
  ])
  const nameOf = new Map<string, string>()
  for (const m of [...(masters ?? []), ...(drugs ?? [])]) nameOf.set(m.id as string, `${m.name}${m.strength ? ` ${m.strength}` : ''}`)

  for (const l of mine) {
    const row = out[l.vaccine as string]
    const isGlobal = !!l.drug_master_id
    const productId = (l.drug_master_id as string | null) ?? (l.drug_id as string)
    const mineBatches = (batches ?? []).filter((b) => (isGlobal ? b.drug_master_id : b.drug_id) === productId)
    const p: VaccineProduct = {
      linkId: l.id as string, productId, isGlobal,
      name: nameOf.get(productId) ?? 'Unknown product',
      inStock: mineBatches.reduce((n, b) => n + (b.qty_available as number), 0),
      earliestExpiry: (mineBatches[0]?.expiry as string | undefined) ?? null,
      price: (mineBatches[0]?.mrp as number | undefined) ?? null,
    }
    row.products.push(p)
  }
  for (const row of Object.values(out)) {
    row.products.sort((a, b) => a.name.localeCompare(b.name))
    row.inStock = row.products.reduce((n, p) => n + p.inStock, 0)
    // First to expire across the brands in stock is what goes out next.
    row.next = row.products.filter((p) => p.inStock > 0)
      .sort((a, b) => (a.earliestExpiry ?? '9999').localeCompare(b.earliestExpiry ?? '9999'))[0] ?? null
  }
  return out
}

/** First-expiry batch of a vaccine's product with stock left. */
async function fefoBatch(supabase: SupabaseClient, productId: string, isGlobal: boolean, today: string) {
  const { data } = await supabase.from('drug_batches')
    .select('id, batch_no, expiry, qty_available, mrp, gst_rate, hsn_code')
    .eq(isGlobal ? 'drug_master_id' : 'drug_id', productId)
    .gt('expiry', today).gt('qty_available', 0).order('expiry').limit(1)
  return data?.[0] ?? null
}

export async function getVaccination(patientId: string): Promise<Vaccination> {
  const supabase = await createClient()
  const { tenantId: _t, ...v } = await load(supabase, patientId)
  void _t
  return v
}

async function guard(permission: 'opd:vitals' = 'opd:vitals') {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, permission)
  return actor
}

function findDose(v: Vaccination, vaccine: string, dose: string) {
  return v.doses.find((d) => d.vaccine === vaccine && d.dose_label === dose) ?? null
}

/** Records one vaccine as given today. */
export async function giveVaccineToday(patientId: string, vaccine: string, doseLabel: string, visitId?: string | null, productId?: string | null):
  Promise<{ success: true; warning?: string; billNo?: string; amount?: number; product?: string } | { success: false; error: string }> {
  const actor = await guard()
  const supabase = await createClient()
  const v = await load(supabase, patientId)
  if (!v.dob) return { success: false, error: "Add the child's date of birth first" }
  const d = findDose(v, vaccine, doseLabel)
  if (!d) return { success: false, error: `${vaccine} ${doseLabel} is not on the schedule` }
  if (d.state === 'given') return { success: false, error: `${d.label} is already recorded` }
  if (!d.canGiveToday) {
    const from = d.earliestDate ? ` (from ${new Date(`${d.earliestDate}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })})` : ''
    return { success: false, error: `${d.label} cannot be given today — ${d.reason}${from}` }
  }
  const supply = v.supply[vaccine]
  const id = crypto.randomUUID()
  // Which brand: the one the clinic chose for this child, else the first to expire.
  const product = productId ? supply?.products.find((p) => p.productId === productId) ?? null : supply?.next ?? null
  const { error } = await supabase.from('patient_immunizations').insert({
    id, tenant_id: actor.tenant_id, patient_id: patientId, given_by: actor.id, vaccine, dose_label: doseLabel,
    given_date: v.today, date_known: true, visit_id: visitId ?? null,
    product_drug_master_id: product?.isGlobal ? product.productId : null,
    product_drug_id: product && !product.isGlobal ? product.productId : null,
    product_name: product?.name ?? null,
  })
  if (error) return { success: false, error: error.code === '23505' ? `${d.label} is already recorded` : error.message }
  await logAudit(actor.id, 'immunization', 'patient', patientId, { vaccine, dose: doseLabel, visit_id: visitId ?? null, product: product?.name ?? null })

  // Government supply: nothing to charge and nothing to take out of pharmacy stock.
  if (!supply || supply.free_supply) return { success: true }
  if (!supply.products.length) {
    return { success: true, warning: `${d.label} is recorded. Link a pharmacy product to this vaccine to charge it and take it out of stock.` }
  }
  if (!product) {
    return { success: true, warning: `${d.label} is recorded, but no linked brand has stock — nothing was charged.` }
  }
  const batch = await fefoBatch(supabase, product.productId, product.isGlobal, v.today)
  if (!batch) {
    return { success: true, warning: `${d.label} is recorded, but there is no stock of ${product.name} — nothing was charged.` }
  }
  const bill = await createServiceBill(supabase, {
    tenantId: actor.tenant_id, patientId, actorId: actor.id, billSource: 'vaccine', visitId: visitId ?? null,
    lines: [{
      source: 'vaccine', ref_id: id, description: `${d.label} — ${product.name}`,
      qty: 1, unit_price: batch.mrp as number,
      gst_rate: (batch.gst_rate as number | null) ?? null, hsn_sac: (batch.hsn_code as string | null) ?? null,
    }],
  })
  if ('error' in bill) {
    return { success: true, warning: `${d.label} is recorded, but the charge could not be raised: ${bill.error}` }
  }
  await supabase.from('patient_immunizations')
    .update({ fulfilment: 'pending', bill_id: bill.billId, charge_amount: batch.mrp as number })
    .eq('id', id)
  return { success: true, billNo: bill.billNo, amount: batch.mrp as number, product: product.name }
}

async function insertEarlier(supabase: SupabaseClient, actor: { id: string; tenant_id: string }, v: Vaccination, patientId: string, d: DoseStatus, date: string | null) {
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${d.label}: invalid date`
    if (date > v.today) return `${d.label}: date cannot be in the future`
    if (v.dob && date < v.dob) return `${d.label}: date is before the date of birth`
  } else if (d.dueDate > v.today) {
    return `${d.label} is not due yet — it cannot have been given earlier`
  }
  const { error } = await supabase.from('patient_immunizations').insert({
    tenant_id: actor.tenant_id, patient_id: patientId, given_by: actor.id, vaccine: d.vaccine, dose_label: d.dose_label,
    given_date: date ?? d.dueDate, date_known: !!date,
    notes: date ? 'Given elsewhere' : 'Given elsewhere — exact date not known',
  })
  if (error && error.code !== '23505') return error.message
  return null
}

/** Records one vaccine as given before (another hospital / camp), with the date from the card if known. */
export async function recordVaccineGivenEarlier(patientId: string, vaccine: string, doseLabel: string, date: string | null): Promise<SimpleResult> {
  const actor = await guard()
  const supabase = await createClient()
  const v = await load(supabase, patientId)
  if (!v.dob) return { success: false, error: "Add the child's date of birth first" }
  const d = findDose(v, vaccine, doseLabel)
  if (!d) return { success: false, error: `${vaccine} ${doseLabel} is not on the schedule` }
  if (d.state === 'given') return { success: false, error: `${d.label} is already recorded` }
  const err = await insertEarlier(supabase, actor, v, patientId, d, date)
  if (err) return { success: false, error: err }
  await logAudit(actor.id, 'immunization_history', 'patient', patientId, { vaccine, dose: doseLabel, date })
  return { success: true }
}

/** A due vaccine not given at this visit, with the reason. It stays pending. */
export async function declineVaccine(patientId: string, vaccine: string, doseLabel: string, reason: string, visitId?: string | null): Promise<SimpleResult> {
  const actor = await guard()
  const text = reason.trim()
  if (!text) return { success: false, error: 'Choose or type a reason' }
  const supabase = await createClient()
  const { error } = await supabase.from('patient_immunization_deferrals').insert({
    tenant_id: actor.tenant_id, patient_id: patientId, vaccine, dose_label: doseLabel, reason: text.slice(0, 200),
    deferred_on: istToday(), visit_id: visitId ?? null, recorded_by: actor.id,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'immunization_deferred', 'patient', patientId, { vaccine, dose: doseLabel, reason: text })
  return { success: true }
}

/** Removes a wrongly recorded dose. */
export async function undoVaccine(immunizationId: string): Promise<SimpleResult> {
  const actor = await guard()
  const supabase = await createClient()
  // A dose already paid for / taken out of stock can't just disappear — the bill
  // has to be cancelled or credit-noted in Billing first.
  const { data: row } = await supabase.from('patient_immunizations')
    .select('fulfilment, bill_id, bill:bills(bill_no, status, paid)').eq('id', immunizationId).maybeSingle()
  if (row?.fulfilment === 'dispensed') {
    return { success: false, error: 'This vaccine was dispensed from pharmacy stock — cancel or credit-note the bill in Billing first.' }
  }
  const bill = row?.bill as unknown as { bill_no: string; status: string; paid: number } | null
  if (bill && (bill.paid > 0 || bill.status === 'paid')) {
    return { success: false, error: `Bill ${bill.bill_no} is already paid — refund or credit-note it in Billing first.` }
  }
  if (row?.bill_id && bill && bill.status !== 'cancelled') {
    await supabase.from('bills').update({ status: 'cancelled' }).eq('id', row.bill_id)
  }
  const { data, error } = await supabase.from('patient_immunizations').delete().eq('id', immunizationId)
    .select('patient_id, vaccine, dose_label, given_date')
  if (error) return { success: false, error: error.message }
  if (!data?.length) return { success: false, error: 'Record not found' }
  await logAudit(actor.id, 'immunization_undo', 'patient', data[0].patient_id as string, { vaccine: data[0].vaccine, dose: data[0].dose_label, given_date: data[0].given_date })
  return { success: true }
}

export interface HistoryEntry { vaccine: string; dose_label: string; answer: 'yes' | 'no' | 'unsure'; date?: string | null }

/** First-visit check against the child's vaccination card: records every "yes" and marks the history reviewed. */
export async function saveVaccinationHistory(patientId: string, entries: HistoryEntry[]): Promise<{ success: true; recorded: number } | { success: false; error: string }> {
  const actor = await guard()
  const supabase = await createClient()
  const v = await load(supabase, patientId)
  if (!v.dob || v.ageDays == null) return { success: false, error: "Add the child's date of birth first" }
  const expected = new Set(dosesDueByNow(v.doses, v.ageDays).map((d) => d.key))
  let recorded = 0
  for (const e of entries.filter((x) => x.answer === 'yes')) {
    const d = findDose(v, e.vaccine, e.dose_label)
    if (!d || !expected.has(d.key)) return { success: false, error: `${e.vaccine} ${e.dose_label} is not due by this age` }
    if (d.state === 'given') continue
    const err = await insertEarlier(supabase, actor, v, patientId, d, e.date || null)
    if (err) return { success: false, error: err }
    recorded++
  }
  const { error } = await supabase.from('pediatric_profiles').upsert({
    patient_id: patientId, tenant_id: actor.tenant_id, vaccine_history_reviewed_at: new Date().toISOString(),
    updated_by: actor.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'patient_id' })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'immunization_history_review', 'patient', patientId, {
    yes: recorded, no: entries.filter((x) => x.answer === 'no').length, unsure: entries.filter((x) => x.answer === 'unsure').length,
  })
  return { success: true, recorded }
}

/** Clinic setting: warn when more than N vaccines are given to a child on one day (null = never warn). */
export async function setVaccineDailyWarnLimit(limit: number | null): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'departments:manage')
  if (limit != null && (!Number.isInteger(limit) || limit < 1 || limit > 20)) return { success: false, error: 'Enter a number from 1 to 20, or leave it blank' }
  // tenants has no tenant-side UPDATE policy — write the caller's own row with the service client.
  const { error } = await createServiceClient().from('tenants').update({ vaccine_daily_warn_limit: limit }).eq('id', actor.tenant_id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'vaccine_daily_warn_limit', actor.tenant_id, { limit })
  return { success: true }
}

export async function getVaccineDailyWarnLimit(): Promise<number | null> {
  const actor = await getActorProfile()
  const supabase = await createClient()
  const { data } = await supabase.from('tenants').select('vaccine_daily_warn_limit').eq('id', actor.tenant_id).maybeSingle()
  return (data?.vaccine_daily_warn_limit as number | null) ?? null
}

// ── Pharmacy: vaccine stock, orders and dispensing ───────────────────────────

export interface VaccineOrder {
  id: string
  patient: { id: string; full_name: string; uhid: string; dob: string | null }
  vaccine: string
  dose_label: string
  given_date: string
  fulfilment: 'pending' | 'dispensed'
  charge_amount: number | null
  bill: { id: string; bill_no: string; status: string; paid: number; total: number } | null
  batch_no: string | null
  expiry_date: string | null
  productName: string | null
  inStock: number
}

/** Vaccines given today (and any still waiting) for the pharmacy's Vaccines tab. */
export async function listVaccineOrders(): Promise<VaccineOrder[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:read')
  const supabase = await createClient()
  const since = istAddDaysLocal(istToday(), -7)
  const { data } = await supabase.from('patient_immunizations')
    .select('id, vaccine, dose_label, given_date, fulfilment, charge_amount, batch_no, expiry_date, product_name, patient:patients(id, full_name, uhid, dob), bill:bills(id, bill_no, status, paid, total)')
    .in('fulfilment', ['pending', 'dispensed'])
    .gte('given_date', since)
    .order('given_date', { ascending: false })
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
  const supply = await loadSupply(supabase, [...new Set(rows.map((r) => r.vaccine as string))], istToday())
  return rows.map((r) => ({
    id: r.id as string,
    patient: r.patient as VaccineOrder['patient'],
    vaccine: r.vaccine as string,
    dose_label: r.dose_label as string,
    given_date: r.given_date as string,
    fulfilment: r.fulfilment as 'pending' | 'dispensed',
    charge_amount: (r.charge_amount as number | null) ?? null,
    bill: (r.bill as VaccineOrder['bill']) ?? null,
    batch_no: (r.batch_no as string | null) ?? null,
    expiry_date: (r.expiry_date as string | null) ?? null,
    productName: (r.product_name as string | null) ?? supply[r.vaccine as string]?.next?.name ?? null,
    inStock: supply[r.vaccine as string]?.inStock ?? 0,
  }))
}

/** Hands the vial over: only once the bill is paid. Takes it out of stock (first expiry first). */
export async function dispenseVaccine(immunizationId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:dispense')
  const supabase = await createClient()
  const { data: row } = await supabase.from('patient_immunizations')
    .select('id, patient_id, vaccine, dose_label, fulfilment, product_drug_master_id, product_drug_id, product_name, bill:bills(bill_no, status, paid, total)')
    .eq('id', immunizationId).maybeSingle()
  if (!row) return { success: false, error: 'Vaccine record not found' }
  if (row.fulfilment === 'dispensed') return { success: false, error: 'Already dispensed' }
  if (row.fulfilment !== 'pending') return { success: false, error: 'Nothing to dispense for this vaccine' }
  const bill = row.bill as unknown as { bill_no: string; status: string; paid: number; total: number } | null
  if (!bill) return { success: false, error: 'No bill for this vaccine' }
  if (bill.status === 'cancelled') return { success: false, error: `Bill ${bill.bill_no} is cancelled` }
  if (bill.paid < bill.total) {
    return { success: false, error: `Bill ${bill.bill_no} is not paid yet — collect ₹${(bill.total - bill.paid).toFixed(2)} first.` }
  }

  const today = istToday()
  // The brand the parents were charged for; fall back to the first to expire.
  let productId = (row.product_drug_master_id as string | null) ?? (row.product_drug_id as string | null)
  let isGlobal = !!row.product_drug_master_id
  let productName = (row.product_name as string | null) ?? null
  if (!productId) {
    const supply = await loadSupply(supabase, [row.vaccine as string], today)
    const next = supply[row.vaccine as string]?.next
    if (!next) return { success: false, error: 'No pharmacy product with stock is linked to this vaccine' }
    productId = next.productId; isGlobal = next.isGlobal; productName = next.name
  }
  const batch = await fefoBatch(supabase, productId, isGlobal, today)
  if (!batch) return { success: false, error: `No stock of ${productName ?? row.vaccine} — add stock first.` }

  const dispenseId = crypto.randomUUID()
  const { data: result, error: rpcErr } = await supabase.rpc('dispense_drug', {
    p_dispense_id: dispenseId,
    p_patient_id: row.patient_id,
    p_prescription_id: null,
    p_drug_id: isGlobal ? null : productId,
    p_drug_master_id: isGlobal ? productId : null,
    p_batch_id: batch.id,
    p_qty: 1,
    p_price_snapshot: batch.mrp,
    p_dispensed_by: actor.id,
  })
  if (rpcErr) return { success: false, error: rpcErr.message }
  const r = result as { ok: boolean; error?: string }
  if (!r.ok) return { success: false, error: r.error ?? 'Could not take the vaccine out of stock' }

  // Already billed with the vaccination — keep the pharmacy bill builder off it.
  await supabase.from('dispenses').update({ billing_status: 'billed' }).eq('id', dispenseId)
  const { error } = await supabase.from('patient_immunizations').update({
    fulfilment: 'dispensed', dispense_id: dispenseId, drug_batch_id: batch.id,
    batch_no: batch.batch_no, expiry_date: batch.expiry,
  }).eq('id', immunizationId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'vaccine_dispense', 'patient', row.patient_id as string, { vaccine: row.vaccine, dose: row.dose_label, batch: batch.batch_no })
  return { success: true }
}

/** Cancels the pharmacy order for a recorded vaccine (unpaid only); the dose stays recorded. */
export async function cancelVaccineOrder(immunizationId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:read')
  const supabase = await createClient()
  const { data: row } = await supabase.from('patient_immunizations')
    .select('id, patient_id, vaccine, fulfilment, bill_id, bill:bills(bill_no, status, paid)').eq('id', immunizationId).maybeSingle()
  if (!row) return { success: false, error: 'Vaccine record not found' }
  if (row.fulfilment !== 'pending') return { success: false, error: 'Only a waiting order can be cancelled' }
  const bill = row.bill as unknown as { bill_no: string; status: string; paid: number } | null
  if (bill && bill.paid > 0) return { success: false, error: `Bill ${bill.bill_no} is already paid — refund or credit-note it in Billing.` }
  if (row.bill_id) await supabase.from('bills').update({ status: 'cancelled' }).eq('id', row.bill_id)
  const { error } = await supabase.from('patient_immunizations')
    .update({ fulfilment: 'cancelled', bill_id: null, charge_amount: null }).eq('id', immunizationId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'vaccine_order_cancel', 'patient', row.patient_id as string, { vaccine: row.vaccine })
  return { success: true }
}

/** The Vaccines tab's stock list: one row per vaccine of the schedule. */
export async function listVaccineStock(): Promise<VaccineSupply[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:read')
  const supabase = await createClient()
  const { data: schedule } = await supabase.from('immunization_schedule').select('vaccine, sort_order').order('sort_order')
  const vaccines: string[] = []
  for (const r of schedule ?? []) if (!vaccines.includes(r.vaccine as string)) vaccines.push(r.vaccine as string)
  const supply = await loadSupply(supabase, vaccines, istToday())
  return vaccines.map((v) => supply[v])
}

/** Adds a pharmacy product (brand) to a vaccine — a vaccine can have several. */
export async function addVaccineProduct(vaccine: string, productId: string, isGlobal: boolean): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:manage')
  const supabase = await createClient()
  const { count } = await supabase.from('immunization_schedule').select('vaccine', { count: 'exact', head: true }).eq('vaccine', vaccine)
  if (!count) return { success: false, error: 'Unknown vaccine' }
  const { error } = await supabase.from('vaccine_products').insert({
    tenant_id: actor.tenant_id, vaccine,
    drug_master_id: isGlobal ? productId : null,
    drug_id: isGlobal ? null : productId,
    updated_by: actor.id,
  })
  if (error) return { success: false, error: error.code === '23505' ? 'That product is already linked to this vaccine' : error.message }
  await logAudit(actor.id, 'vaccine_product_add', 'tenant', actor.tenant_id, { vaccine, productId })
  return { success: true }
}

export async function removeVaccineProduct(linkId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:manage')
  const supabase = await createClient()
  const { data, error } = await supabase.from('vaccine_products').delete().eq('id', linkId).select('vaccine')
  if (error) return { success: false, error: error.message }
  if (!data?.length) return { success: false, error: 'Link not found' }
  await logAudit(actor.id, 'vaccine_product_remove', 'tenant', actor.tenant_id, { vaccine: data[0].vaccine })
  return { success: true }
}

/** Government (free) supply: recorded in the consultation with no charge and no pharmacy step. */
export async function setVaccineFreeSupply(vaccine: string, freeSupply: boolean): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:manage')
  const supabase = await createClient()
  const { count } = await supabase.from('immunization_schedule').select('vaccine', { count: 'exact', head: true }).eq('vaccine', vaccine)
  if (!count) return { success: false, error: 'Unknown vaccine' }
  const { error } = await supabase.from('vaccine_settings').upsert({
    tenant_id: actor.tenant_id, vaccine, free_supply: freeSupply, updated_by: actor.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id,vaccine' })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'vaccine_free_supply', 'tenant', actor.tenant_id, { vaccine, freeSupply })
  return { success: true }
}
