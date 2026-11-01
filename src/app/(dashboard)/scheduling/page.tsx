export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { listNursingUnits } from '@/app/actions/wards'
import { nursingUnitLabel } from '@/lib/types'
import {
  listShiftDefinitions, listCoverageRules, listWardIncharges,
  listPatterns, listLeaveRequests,
} from '@/app/actions/scheduling'
import SchedulingClient from './_components/SchedulingClient'
import { DOCTOR_FILTER } from '@/lib/doctors'

export const metadata = { title: 'Scheduling — Uyirly' }

export default async function SchedulingPage() {
  const actor = await getActorProfile().catch(() => null)
  if (!actor) redirect('/login')
  if (!hasPermission(actor.role, 'scheduling:read')) redirect('/dashboard')

  const supabase = await createClient()
  const [units, shifts, coverageRules, incharges, patterns, leave, nursesRes, doctorsRes, staffRes] = await Promise.all([
    listNursingUnits(),
    listShiftDefinitions(),
    listCoverageRules(),
    listWardIncharges(),
    listPatterns(),
    listLeaveRequests(),
    supabase.from('profiles').select('id, full_name').eq('role', 'nurse').eq('is_active', true).order('full_name'),
    supabase.from('profiles').select('id, full_name').or(DOCTOR_FILTER).eq('is_active', true).order('full_name'),
    // Everyone, for the leave picker (F-53). The `nurses` list above is right
    // for rostering and ward incharges, and was wrong for leave: of karur's ten
    // staff only the three nurses could have leave filed for them, while the two
    // lab techs, two pharmacists, receptionist, HR and admin could file only
    // their own. The server already allowed it — `requestLeave` accepts any
    // profile_id and restricts filing-on-behalf to a holder of `leave:approve`
    // — so the restriction existed solely in this query.
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
  ])

  const canManage = hasPermission(actor.role, 'scheduling:manage')
  const canApprove = hasPermission(actor.role, 'leave:approve')

  return (
    <SchedulingClient
      units={(units ?? []).filter((u) => u.is_active).map((u) => ({ id: u.id, label: nursingUnitLabel(u) }))}
      nurses={(nursesRes.data ?? []) as { id: string; full_name: string }[]}
      staff={(staffRes.data ?? []) as { id: string; full_name: string }[]}
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
