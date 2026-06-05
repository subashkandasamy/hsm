import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import { ClipboardList } from 'lucide-react'

export default function AuditLogPage() {
  return (
    <div>
      <PageHeader title="Audit Log" subtitle="System-wide action history" />
      <GlassCard className="p-8">
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.15)' }}
          >
            <ClipboardList className="w-6 h-6" style={{ color: '#0D9488' }} />
          </div>
          <p className="text-base font-semibold" style={{ color: '#475569' }}>Coming in a later phase</p>
          <p className="mt-1 text-sm max-w-xs" style={{ color: '#94A3B8' }}>
            Audit Log features will be added in Phase 0+.
          </p>
        </div>
      </GlassCard>
    </div>
  )
}
