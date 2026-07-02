'use client'

import { useState } from 'react'
import {
  IndianRupee, BedDouble, Users, FileText,
  AlertTriangle, Download, CalendarDays,
} from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import Money from '@/components/ui/Money'
import KpiTile from './KpiTile'
import { exportReport } from '@/app/actions/dashboard'
import type { AdminKPIs } from '@/lib/types'

const REPORT_TYPES = [
  { value: 'daily_collection',  label: 'Daily Collection' },
  { value: 'patient_footfall',  label: 'Patient Footfall' },
  { value: 'bed_occupancy',     label: 'Bed Occupancy' },
  { value: 'test_volumes',      label: 'Test Volumes' },
] as const

type ReportType = typeof REPORT_TYPES[number]['value']

function fmtAmt(n: number): string {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`
  if (n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`
  if (n >= 1000)     return `₹${Math.round(n / 1000)}K`
  return `₹${Math.round(n)}`
}

export default function AdminDashboard({ kpis }: { kpis: AdminKPIs | null }) {
  const [reportType, setReportType]   = useState<ReportType>('daily_collection')
  const [dateFrom, setDateFrom]       = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo]           = useState(() => new Date().toISOString().slice(0, 10))
  const [exporting, setExporting]     = useState(false)

  async function handleExport() {
    setExporting(true)
    const csv = await exportReport({ type: reportType, dateFrom, dateTo })
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${reportType}_${dateFrom}_${dateTo}.csv`
    a.click(); URL.revokeObjectURL(url)
    setExporting(false)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Hospital overview — today" />

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiTile
          label="Today's Revenue"
          value={kpis ? fmtAmt(kpis.todayRevenue) : '—'}
          icon={<IndianRupee className="w-4 h-4" />}
          href="/billing"
        />
        <KpiTile
          label="Bed Occupancy"
          value={kpis ? `${kpis.bedOccupancy}%` : '—'}
          sub={kpis ? `${kpis.occupiedBeds} / ${kpis.totalBeds} beds` : undefined}
          icon={<BedDouble className="w-4 h-4" />}
          href="/wards"
        />
        <KpiTile
          label="Today's Footfall"
          value={kpis?.todayFootfall ?? '—'}
          sub="Appts + ER"
          icon={<Users className="w-4 h-4" />}
          href="/appointments"
        />
        <KpiTile
          label="Pending Bills"
          value={kpis?.pendingBillsCount ?? '—'}
          sub={kpis ? `${fmtAmt(kpis.pendingBillsTotal)} outstanding` : undefined}
          icon={<FileText className="w-4 h-4" />}
          href="/billing?status=unpaid"
          urgent={(kpis?.pendingBillsCount ?? 0) > 10}
        />
      </div>

      {/* Low stock alert */}
      {(kpis?.lowStockCount ?? 0) > 0 && (
        <GlassCard className="p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: '#DC2626' }} />
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>
              {kpis!.lowStockCount} item{kpis!.lowStockCount !== 1 ? 's' : ''} below reorder level
            </p>
            <p className="text-xs" style={{ color: '#64748B' }}>Check inventory for low-stock alerts</p>
          </div>
          <a href="/inventory?tab=alerts" className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: 'rgba(220,38,38,0.08)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.15)' }}>
            View
          </a>
        </GlassCard>
      )}

      {/* Reports section */}
      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: '#0F172A' }}>Export Reports</h2>
        <GlassCard className="p-4 md:p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {REPORT_TYPES.map((r) => (
              <button key={r.value} onClick={() => setReportType(r.value)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium"
                style={reportType === r.value
                  ? { background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }
                  : { background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>
                {r.label}
              </button>
            ))}
          </div>
          {/* Date inputs: side-by-side on all screens; button full-width on mobile */}
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: '#475569' }}>From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm"
                style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', minHeight: '40px' }} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: '#475569' }}>To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm"
                style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', minHeight: '40px' }} />
            </div>
            <button onClick={handleExport} disabled={exporting}
              className="col-span-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold sm:w-auto"
              style={{ background: exporting ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: exporting ? 'not-allowed' : 'pointer' }}>
              <Download className="w-4 h-4" />
              {exporting ? 'Generating…' : 'Download CSV'}
            </button>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
