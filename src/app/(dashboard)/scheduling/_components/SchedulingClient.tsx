'use client'

import { useState } from 'react'
import { CalendarDays, Plane, Settings2, Repeat, Stethoscope } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import type { ShiftDefinition, WardCoverageRule, WardIncharge, RosterPattern, LeaveRequest } from '@/lib/types'
import RosterGrid from './RosterGrid'
import LeavePanel from './LeavePanel'
import ConfigPanel from './ConfigPanel'
import PatternsPanel from './PatternsPanel'
import DoctorHoursPanel from './DoctorHoursPanel'

interface Props {
  units: { id: string; label: string }[]
  nurses: { id: string; full_name: string }[]
  doctors: { id: string; full_name: string }[]
  initialShifts: ShiftDefinition[]
  initialCoverage: WardCoverageRule[]
  initialIncharges: WardIncharge[]
  initialPatterns: RosterPattern[]
  initialLeave: LeaveRequest[]
  canManage: boolean
  canApprove: boolean
  actorId: string
}

type Tab = 'roster' | 'leave' | 'config' | 'patterns' | 'doctors'

export default function SchedulingClient(props: Props) {
  const [tab, setTab] = useState<Tab>('roster')

  const tabs: { key: Tab; label: string; Icon: typeof CalendarDays; show: boolean }[] = [
    { key: 'roster',   label: 'Roster',           Icon: CalendarDays, show: true },
    { key: 'leave',    label: 'Leave',            Icon: Plane,        show: true },
    { key: 'doctors',  label: 'Doctor Hours',     Icon: Stethoscope, show: props.canManage },
    { key: 'config',   label: 'Shifts & Coverage', Icon: Settings2,   show: props.canManage },
    { key: 'patterns', label: 'Patterns',         Icon: Repeat,       show: props.canManage },
  ]

  return (
    <div>
      <PageHeader title="Scheduling" subtitle="Nurse rostering, leave and shift coverage" />

      <div className="flex gap-1 mb-5 overflow-x-auto pb-1">
        {tabs.filter((t) => t.show).map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap shrink-0"
            style={tab === key
              ? { background: '#0D9488', color: '#fff' }
              : { background: 'rgba(255,255,255,0.7)', color: '#475569', border: '1px solid #E2E8F0' }}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'roster' && (
        <RosterGrid units={props.units} canManage={props.canManage} patterns={props.initialPatterns} />
      )}
      {tab === 'leave' && (
        <LeavePanel
          initialLeave={props.initialLeave} nurses={props.nurses}
          canApprove={props.canApprove} actorId={props.actorId} />
      )}
      {tab === 'config' && props.canManage && (
        <ConfigPanel
          units={props.units} nurses={props.nurses}
          initialShifts={props.initialShifts}
          initialCoverage={props.initialCoverage}
          initialIncharges={props.initialIncharges} />
      )}
      {tab === 'patterns' && props.canManage && (
        <PatternsPanel
          initialPatterns={props.initialPatterns}
          initialShifts={props.initialShifts}
          units={props.units} nurses={props.nurses} />
      )}
      {tab === 'doctors' && props.canManage && (
        <DoctorHoursPanel doctors={props.doctors} />
      )}
    </div>
  )
}
