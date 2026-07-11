export const dynamic = 'force-dynamic'
import { headers } from 'next/headers'
import { listStaff, getAttendance, getRoster } from '@/app/actions/hr'
import StaffClient from './_components/StaffClient'
import type { PlanKey, TenantStatus } from '@/lib/plans'

export default async function StaffPage() {
  const hdrs = await headers()
  const tenantPlan   = (hdrs.get('x-tenant-plan')   ?? 'starter') as PlanKey
  const tenantStatus = (hdrs.get('x-tenant-status') ?? 'trial')   as TenantStatus

  const today = new Date()
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())

  const [staff, attendance, roster] = await Promise.all([
    listStaff(),
    getAttendance({ month }),
    getRoster({ weekStart: weekStart.toISOString().slice(0, 10) }),
  ])

  return (
    <StaffClient
      initialStaff={staff}
      initialAttendance={attendance}
      initialRoster={roster}
      currentMonth={month}
      weekStart={weekStart.toISOString().slice(0, 10)}
      plan={tenantPlan}
      tenantStatus={tenantStatus}
    />
  )
}
