import { CalendarDays, CheckCircle2, Clock } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import KpiTile from './KpiTile'
import type { DoctorKPIs } from '@/lib/types'

export default function DoctorDashboard({ kpis }: { kpis: DoctorKPIs | null }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Your schedule for today" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <KpiTile
          label="Today's Appointments"
          value={kpis?.todayTotal ?? '—'}
          icon={<CalendarDays className="w-5 h-5" />}
          href="/appointments"
        />
        <KpiTile
          label="Completed"
          value={kpis?.todayCompleted ?? '—'}
          icon={<CheckCircle2 className="w-5 h-5" />}
          accent="#10B981"
        />
        <KpiTile
          label="Pending"
          value={kpis?.todayPending ?? '—'}
          icon={<Clock className="w-5 h-5" />}
          href="/opd"
          urgent={(kpis?.todayPending ?? 0) > 5}
        />
      </div>
    </div>
  )
}
