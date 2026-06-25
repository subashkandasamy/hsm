import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import { Activity } from 'lucide-react'

const ROLE_WELCOME: Record<string, string> = {
  nurse:     'Patient care and ward updates',
  lab_tech:  'Lab orders and results',
  pharmacist: 'Dispensing queue and stock',
}

export default function GenericDashboard({ role }: { role: string }) {
  return (
    <div>
      <PageHeader title="Dashboard" subtitle={ROLE_WELCOME[role] ?? 'Welcome to Uyirly'} />
      <GlassCard className="p-8">
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.15)' }}>
            <Activity className="w-6 h-6" style={{ color: '#0D9488' }} />
          </div>
          <p className="text-base font-semibold" style={{ color: '#475569' }}>Uyirly — Hospital Management</p>
          <p className="mt-1 text-sm max-w-xs" style={{ color: '#94A3B8' }}>
            Use the navigation to access your modules.
          </p>
        </div>
      </GlassCard>
    </div>
  )
}
