'use client'

import { useState } from 'react'
import { RefreshCw, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import DataTable from '@/components/ui/DataTable'
import Select from '@/components/ui/Select'
import { listAuditLogs } from '@/app/actions/audit'
import type { AuditLog } from '@/app/actions/audit'

const ENTITY_LINK: Partial<Record<string, (id: string) => string>> = {
  patient:       (id) => `/patients/${id}`,
  bill:          (id) => `/billing/${id}`,
  admission:     (id) => `/ipd/${id}`,
  appointment:   (id) => `/appointments`,
}

const ENTITIES = [
  'patient', 'visit', 'appointment', 'admission', 'bill', 'payment',
  'lab_order', 'radiology_order', 'prescription', 'emergency_case',
  'purchase_order', 'inventory_item', 'supplier', 'staff', 'notification',
  'blood_bag', 'surgery', 'insurance_claim',
]

interface Props {
  initialLogs: AuditLog[]
  actors: { id: string; full_name: string }[]
}

export default function AuditClient({ initialLogs, actors }: Props) {
  const [logs, setLogs]         = useState(initialLogs)
  const [loading, setLoading]   = useState(false)
  const [actorId, setActorId]   = useState('')
  const [entity, setEntity]     = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')

  async function applyFilters() {
    setLoading(true)
    const data = await listAuditLogs({
      actorId: actorId || undefined,
      entity: entity || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      limit: 200,
    })
    setLogs(data)
    setLoading(false)
  }

  function clearFilters() {
    setActorId(''); setEntity(''); setDateFrom(''); setDateTo('')
    listAuditLogs({ limit: 100 }).then(setLogs)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit Log"
        subtitle="System-wide action history"
        action={
          <button onClick={applyFilters}
            className="p-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      {/* Filters */}
      <GlassCard className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: '#475569' }}>Actor</label>
            <Select value={actorId} onChange={(e) => setActorId(e.target.value)}>
              <option value="">All users</option>
              {actors.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: '#475569' }}>Entity</label>
            <Select value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">All entities</option>
              {ENTITIES.map((e) => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: '#475569' }}>From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm"
              style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', minHeight: '44px' }} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: '#475569' }}>To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm"
              style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', minHeight: '44px' }} />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={applyFilters} disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
            Apply Filters
          </button>
          <button onClick={clearFilters}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>
            Clear
          </button>
        </div>
      </GlassCard>

      <DataTable
        data={logs as unknown as Record<string, unknown>[]}
        emptyTitle="No audit entries"
        emptyDescription="Audit entries appear here after mutations in any module"
        pageSize={25}
        columns={[
          {
            key: 'created_at', header: 'Time', sortable: true,
            render: (row) => {
              const log = row as unknown as AuditLog
              const d = new Date(log.created_at)
              return (
                <div className="text-xs" style={{ color: '#64748B' }}>
                  <div>{d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                  <div>{d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                </div>
              )
            },
          },
          {
            key: 'actor', header: 'Actor', sortable: false,
            render: (row) => {
              const log = row as unknown as AuditLog
              return (
                <span className="text-sm font-medium" style={{ color: '#0F172A' }}>
                  {log.actor?.full_name ?? log.actor_id ?? 'System'}
                </span>
              )
            },
          },
          {
            key: 'action', header: 'Action', sortable: true,
            render: (row) => {
              const log = row as unknown as AuditLog
              return (
                <span className="text-xs px-2 py-1 rounded-lg font-medium"
                  style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>
                  {log.action}
                </span>
              )
            },
          },
          {
            key: 'entity', header: 'Entity', sortable: true,
            render: (row) => {
              const log = row as unknown as AuditLog
              const linkFn = log.entity_id ? ENTITY_LINK[log.entity] : undefined
              const href = linkFn ? linkFn(log.entity_id!) : undefined
              return (
                <div>
                  <p className="text-sm" style={{ color: '#0F172A' }}>{log.entity}</p>
                  {log.entity_id && (
                    href ? (
                      <Link href={href} className="text-xs flex items-center gap-1"
                        style={{ color: '#0D9488' }}>
                        {log.entity_id.slice(0, 8)}…
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    ) : (
                      <p className="text-xs font-mono" style={{ color: '#94A3B8' }}>
                        {log.entity_id.slice(0, 8)}…
                      </p>
                    )
                  )}
                </div>
              )
            },
          },
          {
            key: 'meta', header: 'Details', mobileHidden: true,
            render: (row) => {
              const log = row as unknown as AuditLog
              if (!log.meta) return <span style={{ color: '#CBD5E1' }}>—</span>
              const preview = JSON.stringify(log.meta).slice(0, 60)
              return (
                <span className="text-xs font-mono" style={{ color: '#64748B' }} title={JSON.stringify(log.meta, null, 2)}>
                  {preview}{preview.length >= 60 ? '…' : ''}
                </span>
              )
            },
          },
        ]}
      />
    </div>
  )
}
