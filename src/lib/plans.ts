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

// Routes that require growth plan (prefix match)
export const GROWTH_ONLY_ROUTES = [
  '/ipd', '/wards', '/emergency', '/lab', '/radiology',
  '/ot', '/blood', '/insurance', '/inventory', '/staff',
]

export function planHasModule(plan: PlanKey, status: TenantStatus, moduleKey: string): boolean {
  if (status === 'trial') return true
  if (status === 'cancelled' || status === 'suspended') return false
  const modules = PLAN_MODULES[plan] ?? PLAN_MODULES.starter
  return modules.includes('*') || modules.includes(moduleKey)
}

export function isGrowthOnly(moduleKey: string): boolean {
  const starterModules = PLAN_MODULES.starter as readonly string[]
  return !starterModules.includes(moduleKey)
}
