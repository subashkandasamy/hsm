'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { PlanKey, TenantStatus } from '@/lib/plans'

interface TenantContextValue {
  plan:   PlanKey
  status: TenantStatus
}

const TenantContext = createContext<TenantContextValue>({ plan: 'starter', status: 'trial' })

export function TenantProvider({
  children, plan, status,
}: { children: ReactNode; plan: PlanKey; status: TenantStatus }) {
  return <TenantContext.Provider value={{ plan, status }}>{children}</TenantContext.Provider>
}

export function useTenant() {
  return useContext(TenantContext)
}
