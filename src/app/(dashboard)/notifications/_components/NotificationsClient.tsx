'use client'

import { useState } from 'react'
import { Bell, RefreshCw, RotateCcw, MessageSquare, Phone } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import DataTable from '@/components/ui/DataTable'
import StatusBadge from '@/components/ui/StatusBadge'
import { listNotifications, retryNotification } from '@/app/actions/notifications'
import type { Notification, NotificationStatus } from '@/lib/types'

const STATUS_VARIANT: Record<NotificationStatus, string> = {
  queued:    'pending',
  sent:      'success',
  delivered: 'active',
  failed:    'error',
}

const CHANNEL_ICON: Record<string, React.ReactNode> = {
  whatsapp: <MessageSquare className="w-3.5 h-3.5" />,
  sms:      <Phone className="w-3.5 h-3.5" />,
}

interface Props { initialNotifications: Notification[] }

export default function NotificationsClient({ initialNotifications }: Props) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [loading, setLoading]   = useState(false)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<NotificationStatus | 'all'>('all')

  async function refresh() {
    setLoading(true)
    const data = await listNotifications({ limit: 200 })
    setNotifications(data)
    setLoading(false)
  }

  async function handleRetry(id: string) {
    setRetrying(id)
    await retryNotification(id)
    setRetrying(null)
    refresh()
  }

  const filtered = statusFilter === 'all'
    ? notifications
    : notifications.filter((n) => n.status === statusFilter)

  const counts = {
    all: notifications.length,
    queued:    notifications.filter((n) => n.status === 'queued').length,
    sent:      notifications.filter((n) => n.status === 'sent').length,
    delivered: notifications.filter((n) => n.status === 'delivered').length,
    failed:    notifications.filter((n) => n.status === 'failed').length,
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="WhatsApp & SMS delivery log"
        action={
          <button onClick={refresh}
            className="p-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      {/* Status filter */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {(['all', 'queued', 'sent', 'delivered', 'failed'] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium capitalize"
            style={statusFilter === s
              ? { background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }
              : { background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            {counts[s] > 0 && (
              <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  background: statusFilter === s ? 'rgba(255,255,255,0.25)' : s === 'failed' ? 'rgba(220,38,38,0.1)' : 'rgba(13,148,136,0.1)',
                  color: statusFilter === s ? '#fff' : s === 'failed' ? '#DC2626' : '#0D9488',
                }}>
                {counts[s]}
              </span>
            )}
          </button>
        ))}
      </div>

      <DataTable
        data={filtered as unknown as Record<string, unknown>[]}
        searchKeys={['recipient_phone', 'template_key', 'ref_type']}
        searchPlaceholder="Search by phone, template, or type…"
        emptyTitle="No notifications"
        emptyDescription="Notifications will appear here after sending bills or prescriptions"
        pageSize={20}
        columns={[
          {
            key: 'patient', header: 'Patient', sortable: false,
            render: (row) => {
              const n = row as unknown as Notification
              return (
                <div>
                  <p className="font-medium text-sm" style={{ color: '#0F172A' }}>
                    {n.patient?.full_name ?? n.recipient_phone}
                  </p>
                  <p className="text-xs" style={{ color: '#94A3B8' }}>
                    {n.patient?.uhid ? `#${n.patient.uhid}` : ''} {n.recipient_phone}
                  </p>
                </div>
              )
            },
          },
          {
            key: 'channel', header: 'Channel',
            render: (row) => {
              const n = row as unknown as Notification
              return (
                <div className="flex items-center gap-1.5 text-sm" style={{ color: '#475569' }}>
                  {CHANNEL_ICON[n.channel]}
                  <span className="capitalize">{n.channel}</span>
                </div>
              )
            },
          },
          {
            key: 'template_key', header: 'Type', mobileHidden: true,
            render: (row) => {
              const n = row as unknown as Notification
              return (
                <span className="text-sm" style={{ color: '#64748B' }}>
                  {n.template_key?.replace(/_/g, ' ') ?? n.ref_type}
                </span>
              )
            },
          },
          {
            key: 'status', header: 'Status',
            render: (row) => {
              const n = row as unknown as Notification
              return <StatusBadge status={STATUS_VARIANT[n.status]} label={n.status} />
            },
          },
          {
            key: 'created_at', header: 'Sent At', sortable: true, mobileHidden: true,
            render: (row) => {
              const n = row as unknown as Notification
              const d = new Date(n.created_at)
              return (
                <span className="text-xs" style={{ color: '#64748B' }}>
                  {d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  {' '}
                  {d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )
            },
          },
          {
            key: 'actions', header: '',
            render: (row) => {
              const n = row as unknown as Notification
              if (n.status !== 'failed') return null
              return (
                <button onClick={() => handleRetry(n.id)} disabled={retrying === n.id}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                  style={{
                    background: 'rgba(13,148,136,0.08)', color: '#0D9488',
                    border: '1px solid rgba(13,148,136,0.15)',
                    cursor: retrying === n.id ? 'not-allowed' : 'pointer',
                  }}>
                  <RotateCcw className={`w-3 h-3 ${retrying === n.id ? 'animate-spin' : ''}`} />
                  {retrying === n.id ? 'Retrying…' : 'Retry'}
                </button>
              )
            },
          },
        ]}
      />
    </div>
  )
}
