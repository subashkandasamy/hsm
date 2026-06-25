import { ClipboardList, AlertTriangle, Clock } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import KpiTile from './KpiTile'
import type { PharmacistKPIs } from '@/lib/types'

export default function PharmacistDashboard({ kpis }: { kpis: PharmacistKPIs | null }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Pharmacy overview" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <KpiTile
          label="Pending Prescriptions"
          value={kpis?.pendingPrescriptions ?? '—'}
          icon={<ClipboardList className="w-5 h-5" />}
          href="/pharmacy"
          urgent={(kpis?.pendingPrescriptions ?? 0) > 10}
        />
        <KpiTile
          label="Low Stock Items"
          value={kpis?.lowStockCount ?? '—'}
          icon={<AlertTriangle className="w-5 h-5" />}
          urgent={(kpis?.lowStockCount ?? 0) > 0}
        />
        <KpiTile
          label="Near Expiry (90 days)"
          value={kpis?.nearExpiryCount ?? '—'}
          icon={<Clock className="w-5 h-5" />}
          urgent={(kpis?.nearExpiryCount ?? 0) > 0}
          accent="#F59E0B"
        />
      </div>
    </div>
  )
}
