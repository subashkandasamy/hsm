export const dynamic = 'force-dynamic'
import { headers } from 'next/headers'
import { listStaff, getAttendance } from '@/app/actions/hr'
import StaffClient from './_components/StaffClient'
import type { PlanKey, TenantStatus } from '@/lib/plans'

export default async function StaffPage() {
  const hdrs = await headers()
  const tenantPlan   = (hdrs.get('x-tenant-plan')   ?? 'starter') as PlanKey
  const tenantStatus = (hdrs.get('x-tenant-status') ?? 'trial')   as TenantStatus

  const today = new Date()
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const [staff, attendance] = await Promise.all([
    listStaff(),
    getAttendance({ month }),
  ])

  return (
    <StaffClient
      initialStaff={staff}
      initialAttendance={attendance}
      currentMonth={month}
      plan={tenantPlan}
      tenantStatus={tenantStatus}
    />
  )
}
