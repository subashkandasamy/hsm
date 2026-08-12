'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getActorProfile } from '@/lib/server-utils'

export interface SetupStep {
  key: string
  title: string
  description: string
  href: string
  done: boolean
}

export interface SetupProgress {
  steps: SetupStep[]
  doneCount: number
  totalCount: number
  allDone: boolean
  dismissed: boolean
}

// Live "getting started" progress for the current tenant. Each step is marked
// done from real data (a count/row exists), and steps are filtered to the
// tenant's enabled modules so a hospital only sees what applies to it.
export async function getSetupProgress(): Promise<SetupProgress> {
  const actor = await getActorProfile()
  const supabase = await createClient()
  const svc = createServiceClient()

  // Tenant-level flags via service role (tenants row isn't tenant-user-readable via RLS).
  const { data: tenant } = await svc
    .from('tenants')
    .select('enabled_modules, onboarding_dismissed_at, code')
    .eq('id', actor.tenant_id)
    .maybeSingle()

  const modules: string[] = Array.isArray(tenant?.enabled_modules)
    ? (tenant!.enabled_modules as string[])
    : []
  const dismissed = !!tenant?.onboarding_dismissed_at
  const hasModule = (m: string) => modules.length === 0 || modules.includes(m)

  // Head-only exact count under the tenant's RLS context. 0 when the module
  // is off, so gated steps don't run a query and always read as "not done".
  const countIf = async (enabled: boolean, table: string): Promise<number> => {
    if (!enabled) return 0
    const { count } = await supabase.from(table).select('id', { count: 'exact', head: true })
    return count ?? 0
  }

  // Lab & radiology catalogs are pre-seeded (inactive placeholders) at signup, so
  // a plain row count is always > 0. The step is only "done" once the admin has
  // enabled at least one test/scan (is_active = true).
  const countActiveIf = async (enabled: boolean, table: string): Promise<number> => {
    if (!enabled) return 0
    const { count } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('is_active', true)
    return count ?? 0
  }

  // Profile completeness (name + address).
  const { data: profile } = await supabase
    .from('tenant_profiles')
    .select('name, address_line1')
    .eq('tenant_id', actor.tenant_id)
    .maybeSingle()

  const doctorsQ = supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'doctor')

  const [doctorsRes, hours, labTests, radTests, pharmacyStock, wards, tariffs, patients] = await Promise.all([
    doctorsQ,
    countIf(true, 'doctor_availability'),
    countActiveIf(hasModule('lab'), 'lab_tests_catalog'),
    countActiveIf(hasModule('radiology'), 'radiology_catalog'),
    // Pharmacy is "set up" once stock exists — a batch can reference the global
    // drug_master catalog, so a hospital may have stock with no tenant `drugs` row.
    countIf(hasModule('pharmacy'), 'drug_batches'),
    countIf(hasModule('ipd'), 'wards'),
    countIf(true, 'procedure_tariffs'),
    countIf(true, 'patients'),
  ])
  const doctors = doctorsRes.count ?? 0

  const all: (SetupStep & { show: boolean })[] = [
    {
      key: 'profile', show: true,
      title: 'Complete your hospital profile',
      description: 'Add your logo, address and contact details — they appear on bills and reports.',
      href: '/settings/profile',
      done: !!(profile?.name && profile?.address_line1),
    },
    {
      key: 'code', show: true,
      title: 'Set your hospital code',
      description: 'A short code that prefixes your patient IDs and bills (e.g. CITY-UH-2026-00005).',
      href: '/settings/profile',
      done: !!tenant?.code,
    },
    {
      key: 'team', show: true,
      title: 'Add your team',
      description: 'Invite your doctors, nurses and front-desk staff so they can log in.',
      href: '/staff',
      done: doctors > 0,
    },
    {
      key: 'hours', show: true,
      title: 'Set doctor OPD hours',
      description: 'Add each doctor’s weekly clinic hours so patients can be booked.',
      href: '/scheduling',
      done: hours > 0,
    },
    {
      key: 'lab', show: hasModule('lab'),
      title: 'Set up your lab test catalog',
      description: 'Add the lab tests you offer, with sample types and prices.',
      href: '/lab',
      done: labTests > 0,
    },
    {
      key: 'radiology', show: hasModule('radiology'),
      title: 'Set up your radiology catalog',
      description: 'Add the scans you offer (X-ray, CT, MRI…) with prices.',
      href: '/radiology',
      done: radTests > 0,
    },
    {
      key: 'pharmacy', show: hasModule('pharmacy'),
      title: 'Add pharmacy medicines',
      description: 'Add your medicines and opening stock so you can dispense and bill.',
      href: '/pharmacy',
      done: pharmacyStock > 0,
    },
    {
      key: 'wards', show: hasModule('ipd'),
      title: 'Set up wards & beds',
      description: 'Create your wards and beds so you can admit inpatients.',
      href: '/wards',
      done: wards > 0,
    },
    {
      key: 'tariffs', show: true,
      title: 'Set your billing rates',
      description: 'Add consultation and procedure charges so billing is accurate.',
      href: '/settings/tariffs',
      done: tariffs > 0,
    },
    {
      key: 'patient', show: true,
      title: 'Register your first patient',
      description: 'Add a patient to see how registration, visits and billing flow together.',
      href: '/patients',
      done: patients > 0,
    },
  ]

  const steps = all.filter((s) => s.show).map(({ show: _show, ...s }) => s)
  const doneCount = steps.filter((s) => s.done).length

  return {
    steps,
    doneCount,
    totalCount: steps.length,
    allDone: doneCount === steps.length,
    dismissed,
  }
}

// "I'll do this later" — stops the dashboard card + guide from nagging.
export async function dismissSetupGuide(): Promise<{ success: true }> {
  const actor = await getActorProfile()
  const svc = createServiceClient()
  await svc.from('tenants').update({ onboarding_dismissed_at: new Date().toISOString() }).eq('id', actor.tenant_id)
  return { success: true }
}
