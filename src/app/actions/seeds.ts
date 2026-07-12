'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

async function requirePlatformAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('UNAUTHENTICATED')

  const service = createServiceClient()
  const { data } = await service
    .from('platform_admins')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!data) throw new Error('FORBIDDEN')
  return user
}

type Ok  = { success: true }
type Err = { success: false; error: string }

// ── Drug Master ──────────────────────────────────────────────────────────────

export interface DrugMasterRow {
  id:                   string
  name:                 string
  generic_name:         string | null
  category:             string | null
  form:                 string | null
  strength:             string | null
  unit:                 string | null
  schedule:             string | null
  atc_code:             string | null
  pharmacological_class:string | null
  is_active:            boolean
  drug_brands?:         { brand_name: string; manufacturer: string }[]
}

export async function listDrugMaster(search?: string): Promise<DrugMasterRow[]> {
  await requirePlatformAdmin()
  const service = createServiceClient()

  const base = () => service
    .from('drug_master')
    .select('*, drug_brands(brand_name, manufacturer)')
    .eq('is_active', true)
    .order('name')

  if (!search?.trim()) {
    const { data } = await base().limit(100)
    return (data ?? []) as DrugMasterRow[]
  }

  const s = search.trim()

  // Run both searches in parallel
  const [nameRes, brandRes] = await Promise.all([
    // 1. Search by generic name / INN
    base().or(`name.ilike.%${s}%,generic_name.ilike.%${s}%`).limit(100),
    // 2. Find drug_master_ids where any brand name matches
    service
      .from('drug_brands')
      .select('drug_master_id')
      .ilike('brand_name', `%${s}%`)
      .limit(50),
  ])

  const byName = (nameRes.data ?? []) as DrugMasterRow[]

  const brandIds = [...new Set(
    (brandRes.data ?? []).map(b => b.drug_master_id).filter(Boolean) as string[]
  )]

  if (brandIds.length === 0) return byName

  // Fetch drugs matched by brand name (excludes those already in byName)
  const seenIds = new Set(byName.map(d => d.id))
  const missingIds = brandIds.filter(id => !seenIds.has(id))

  if (missingIds.length === 0) return byName

  const { data: byBrand } = await base().in('id', missingIds).limit(50)

  return [...byName, ...((byBrand ?? []) as DrugMasterRow[])]
}

export async function upsertDrugMaster(row: {
  id?:                   string
  name:                  string
  generic_name:          string
  category:              string
  form:                  string
  strength:              string
  unit:                  string
  schedule?:             string | null
  atc_code?:             string | null
  pharmacological_class?:string | null
}): Promise<Ok | Err> {
  await requirePlatformAdmin()
  const service = createServiceClient()

  const payload = {
    name:                  row.name.trim(),
    generic_name:          row.generic_name.trim() || null,
    category:              row.category.trim() || null,
    form:                  row.form.trim() || null,
    strength:              row.strength.trim() || null,
    unit:                  row.unit.trim() || null,
    schedule:              row.schedule?.trim() || null,
    atc_code:              row.atc_code?.trim() || null,
    pharmacological_class: row.pharmacological_class?.trim() || null,
    is_active:             true,
  }

  const { error } = row.id
    ? await service.from('drug_master').update(payload).eq('id', row.id)
    : await service.from('drug_master').insert({ ...payload, id: crypto.randomUUID() })

  if (error) return { success: false, error: error.message }
  revalidatePath('/platform-admin/seeds')
  return { success: true }
}

export async function toggleDrugMaster(id: string, isActive: boolean): Promise<Ok | Err> {
  await requirePlatformAdmin()
  const service = createServiceClient()
  const { error } = await service.from('drug_master').update({ is_active: isActive }).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/platform-admin/seeds')
  return { success: true }
}

// ── Drug Brands ───────────────────────────────────────────────────────────────

export interface DrugBrandRow {
  id:             string
  drug_master_id: string
  brand_name:     string
  manufacturer:   string
  hsn_code:       string
  gst_rate:       number
  pack_size:      number
  pack_unit:      string
  mrp_per_pack:   number | null
  is_active:      boolean
}

export async function listDrugBrands(drugMasterId: string): Promise<DrugBrandRow[]> {
  await requirePlatformAdmin()
  const service = createServiceClient()
  const { data } = await service
    .from('drug_brands')
    .select('*')
    .eq('drug_master_id', drugMasterId)
    .order('brand_name')
  return (data ?? []) as DrugBrandRow[]
}

export async function upsertDrugBrand(row: {
  id?:            string
  drug_master_id: string
  brand_name:     string
  manufacturer:   string
  hsn_code:       string
  gst_rate:       number
  pack_size:      number
  pack_unit:      string
  mrp_per_pack:   number | null
}): Promise<Ok | Err> {
  await requirePlatformAdmin()
  const service = createServiceClient()

  const payload = {
    drug_master_id: row.drug_master_id,
    brand_name:     row.brand_name.trim(),
    manufacturer:   row.manufacturer.trim(),
    hsn_code:       row.hsn_code.trim() || '30049099',
    gst_rate:       row.gst_rate,
    pack_size:      row.pack_size,
    pack_unit:      row.pack_unit.trim() || 'strip',
    mrp_per_pack:   row.mrp_per_pack ?? null,
    is_active:      true,
  }

  const { error } = row.id
    ? await service.from('drug_brands').update(payload).eq('id', row.id)
    : await service.from('drug_brands').insert({ ...payload, id: crypto.randomUUID() })

  if (error) return { success: false, error: error.message }
  revalidatePath('/platform-admin/seeds')
  return { success: true }
}

export async function deleteDrugBrand(id: string): Promise<Ok | Err> {
  await requirePlatformAdmin()
  const service = createServiceClient()
  const { error } = await service.from('drug_brands').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/platform-admin/seeds')
  return { success: true }
}

// ── Lab Tests Master ─────────────────────────────────────────────────────────

export interface LabMasterRow {
  id:              string
  name:            string
  code:            string | null
  category:        string
  sample_type:     string | null
  unit:            string | null
  ref_low:         number | null
  ref_high:        number | null
  reference_range: string | null
  is_active:       boolean
}

export async function listLabMaster(search?: string): Promise<LabMasterRow[]> {
  await requirePlatformAdmin()
  const service = createServiceClient()

  let q = service.from('lab_tests_master').select('*').order('category').order('name')
  if (search?.trim()) q = q.ilike('name', `%${search.trim()}%`)

  const { data } = await q.limit(200)
  return (data ?? []) as LabMasterRow[]
}

export async function upsertLabMaster(row: {
  id?:             string
  name:            string
  code:            string
  category:        string
  sample_type:     string
  unit:            string
  ref_low:         number | null
  ref_high:        number | null
  reference_range: string
}): Promise<Ok | Err> {
  await requirePlatformAdmin()
  const service = createServiceClient()

  const payload = {
    name:            row.name.trim(),
    code:            row.code.trim() || null,
    category:        row.category.trim() || 'General',
    sample_type:     row.sample_type.trim() || null,
    unit:            row.unit.trim() || null,
    ref_low:         row.ref_low ?? null,
    ref_high:        row.ref_high ?? null,
    reference_range: row.reference_range.trim() || null,
    is_active:       true,
  }

  const { error } = row.id
    ? await service.from('lab_tests_master').update(payload).eq('id', row.id)
    : await service.from('lab_tests_master').insert({ ...payload, id: crypto.randomUUID() })

  if (error) return { success: false, error: error.message }
  revalidatePath('/platform-admin/seeds')
  return { success: true }
}

export async function toggleLabMaster(id: string, isActive: boolean): Promise<Ok | Err> {
  await requirePlatformAdmin()
  const service = createServiceClient()
  const { error } = await service.from('lab_tests_master').update({ is_active: isActive }).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/platform-admin/seeds')
  return { success: true }
}

// ── Radiology Master ─────────────────────────────────────────────────────────

export interface RadiologMasterRow {
  id:        string
  name:      string
  modality:  string
  body_part: string
  is_active: boolean
}

export async function listRadiologyMaster(search?: string): Promise<RadiologMasterRow[]> {
  await requirePlatformAdmin()
  const service = createServiceClient()

  let q = service.from('radiology_master').select('*').order('modality').order('name')
  if (search?.trim()) q = q.ilike('name', `%${search.trim()}%`)

  const { data } = await q.limit(200)
  return (data ?? []) as RadiologMasterRow[]
}

export async function upsertRadiologyMaster(row: {
  id?:       string
  name:      string
  modality:  string
  body_part: string
}): Promise<Ok | Err> {
  await requirePlatformAdmin()
  const service = createServiceClient()

  const payload = {
    name:      row.name.trim(),
    modality:  row.modality.trim(),
    body_part: row.body_part.trim() || 'General',
    is_active: true,
  }

  const { error } = row.id
    ? await service.from('radiology_master').update(payload).eq('id', row.id)
    : await service.from('radiology_master').insert({ ...payload, id: crypto.randomUUID() })

  if (error) return { success: false, error: error.message }
  revalidatePath('/platform-admin/seeds')
  return { success: true }
}

export async function toggleRadiologyMaster(id: string, isActive: boolean): Promise<Ok | Err> {
  await requirePlatformAdmin()
  const service = createServiceClient()
  const { error } = await service.from('radiology_master').update({ is_active: isActive }).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/platform-admin/seeds')
  return { success: true }
}

// ── Procedure Tariffs (per-tenant) ───────────────────────────────────────────

export interface TariffRow {
  id:            string
  tenant_id:     string
  name:          string
  category:      string | null
  default_price: number
  is_active:     boolean
}

export async function listTariffs(tenantId: string, search?: string): Promise<TariffRow[]> {
  await requirePlatformAdmin()
  const service = createServiceClient()

  let q = service
    .from('procedure_tariffs')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('category')
    .order('name')

  if (search?.trim()) q = q.ilike('name', `%${search.trim()}%`)

  const { data } = await q.limit(200)
  return (data ?? []) as TariffRow[]
}

export async function upsertTariff(row: {
  id?:           string
  tenant_id:     string
  name:          string
  category:      string
  default_price: number
}): Promise<Ok | Err> {
  await requirePlatformAdmin()
  const service = createServiceClient()

  const payload = {
    tenant_id:     row.tenant_id,
    name:          row.name.trim(),
    category:      row.category || null,
    default_price: row.default_price,
    is_active:     true,
  }

  const { error } = row.id
    ? await service.from('procedure_tariffs').update(payload).eq('id', row.id)
    : await service.from('procedure_tariffs').insert({ ...payload, id: crypto.randomUUID() })

  if (error) return { success: false, error: error.message }
  revalidatePath('/platform-admin/seeds')
  return { success: true }
}

export async function toggleTariff(id: string, isActive: boolean): Promise<Ok | Err> {
  await requirePlatformAdmin()
  const service = createServiceClient()
  const { error } = await service.from('procedure_tariffs').update({ is_active: isActive }).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/platform-admin/seeds')
  return { success: true }
}
