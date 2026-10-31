export type PlanKey      = 'starter' | 'growth' | 'enterprise'
export type TenantStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled'

// Modules each paid plan includes (trial always gets everything)
export const PLAN_MODULES: Record<PlanKey, readonly string[]> = {
  starter:    ['opd', 'patients', 'appointments', 'billing', 'dashboard', 'pharmacy', 'hr'],
  growth:     ['opd', 'patients', 'appointments', 'billing', 'dashboard',
               'ipd', 'wards', 'emergency', 'lab', 'radiology', 'pharmacy',
               'ot', 'bloodbank', 'insurance', 'inventory', 'hr'],
  enterprise: ['*'],
}

// Routes that require the Growth plan (prefix match).
//
// THIS IS THE ONLY LIST. proxy.ts imports it. There were previously two
// constants of this name with different contents — this one, which nothing
// imported, and a local one inside proxy.ts, which did the enforcing. The
// enforcing copy was missing /settings/devices, so the protection the comment
// below describes did not exist.
//
// /settings/devices is here because it configures the analyzer and scanner
// connectors, which only exist to feed lab and radiology — both Growth-only.
// Without it a Starter tenant could pair a connector it has no module to use.
//
// /settings/ipd-billing configures the IPD daily auto-bill only; nothing on it
// applies without IPD.
//
// /staff is deliberately NOT here: it is available on Starter with per-role
// limits, and 'hr' is a Starter module. The unused copy of this list had it,
// which is why the two had to be reconciled by hand rather than merged.
export const GROWTH_ONLY_ROUTES = [
  '/ipd', '/wards', '/emergency', '/lab', '/radiology',
  '/ot', '/blood', '/insurance', '/inventory',
  '/settings/devices', '/settings/ipd-billing',
]

export function planHasModule(plan: PlanKey, status: TenantStatus, moduleKey: string): boolean {
  if (status === 'trial') return true
  // suspended = hard block. cancelled = still on grace period (proxy blocks after expiry)
  if (status === 'suspended') return false
  const modules = PLAN_MODULES[plan] ?? PLAN_MODULES.starter
  return modules.includes('*') || modules.includes(moduleKey)
}

export function isGrowthOnly(moduleKey: string): boolean {
  const starterModules = PLAN_MODULES.starter as readonly string[]
  return !starterModules.includes(moduleKey)
}
