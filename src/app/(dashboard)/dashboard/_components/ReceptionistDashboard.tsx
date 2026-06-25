import { CalendarDays, UserCheck, UserPlus } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import KpiTile from './KpiTile'
import type { ReceptionistKPIs } from '@/lib/types'

export default function ReceptionistDashboard({ kpis }: { kpis: ReceptionistKPIs | null }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Reception desk — today" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <KpiTile
          label="Today's Appointments"
          value={kpis?.todayAppointments ?? '—'}
          icon={<CalendarDays className="w-5 h-5" />}
          href="/appointments"
        />
        <KpiTile
          label="Checked In"
          value={kpis?.todayCheckedIn ?? '—'}
          icon={<UserCheck className="w-5 h-5" />}
          accent="#10B981"
        />
        <KpiTile
          label="New Registrations"
          value={kpis?.todayRegistrations ?? '—'}
          icon={<UserPlus className="w-5 h-5" />}
          href="/patients"
        />
      </div>
    </div>
  )
}
