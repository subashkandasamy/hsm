export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { listWards } from '@/app/actions/wards'
import {
  listShiftDefinitions, listCoverageRules, listWardIncharges,
  listPatterns, listLeaveRequests,
} from '@/app/actions/scheduling'
import SchedulingClient from './_components/SchedulingClient'

export const metadata = { title: 'Scheduling — Uyirly' }

export default async function SchedulingPage() {
  const actor = await getActorProfile().catch(() => null)
  if (!actor) redirect('/login')
  if (!hasPermission(actor.role, 'scheduling:read')) redirect('/dashboard')

  const supabase = await createClient()
  const [wards, shifts, coverageRules, incharges, patterns, leave, nursesRes, doctorsRes] = await Promise.all([
    listWards(),
    listShiftDefinitions(),
    listCoverageRules(),
    listWardIncharges(),
    listPatterns(),
    listLeaveRequests(),
    supabase.from('profiles').select('id, full_name').eq('role', 'nurse').eq('is_active', true).order('full_name'),
    supabase.from('profiles').select('id, full_name').eq('role', 'doctor').eq('is_active', true).order('full_name'),
  ])

  const canManage = hasPermission(actor.role, 'scheduling:manage')
  const canApprove = hasPermission(actor.role, 'leave:approve')

  return (
    <SchedulingClient
      wards={(wards ?? []).map((w) => ({ id: w.id, name: w.name }))}
      nurses={(nursesRes.data ?? []) as { id: string; full_name: string }[]}
      doctors={(doctorsRes.data ?? []) as { id: string; full_name: string }[]}
      initialShifts={shifts}
      initialCoverage={coverageRules}
      initialIncharges={incharges}
      initialPatterns={patterns}
      initialLeave={leave}
      canManage={canManage}
      canApprove={canApprove}
      actorId={actor.id}
    />
  )
}
