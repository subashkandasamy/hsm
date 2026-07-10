'use client'

import { useState, useTransition } from 'react'
import { Building2, Users, UserCheck, ShieldAlert, ExternalLink, RefreshCw, Loader2, AlertTriangle, CalendarClock } from 'lucide-react'
import { listTenants, suspendTenant, reactivateTenant, impersonateTenant, setTenantAccessOverride } from '@/app/actions/platform'
import type { TenantWithStats } from '@/lib/types'
import type { TenantStatus } from '@/lib/types'

const STATUS_STYLES: Record<TenantStatus, { label: string; bg: string; color: string }> = {
  trial:     { label: 'Trial',     bg: 'rgba(139,92,246,0.15)', color: '#A78BFA' },
  active:    { label: 'Active',    bg: 'rgba(16,185,129,0.15)', color: '#34D399' },
  past_due:  { label: 'Past due',  bg: 'rgba(245,158,11,0.15)', color: '#FCD34D' },
  suspended: { label: 'Suspended', bg: 'rgba(239,68,68,0.15)',  color: '#F87171' },
  cancelled: { label: 'Cancelled', bg: 'rgba(100,116,139,0.15)',color: '#94A3B8' },
}

interface Props { initialTenants: TenantWithStats[] }

export default function PlatformAdminClient({ initialTenants }: Props) {
  const [tenants, setTenants] = useState<TenantWithStats[]>(initialTenants)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [suspendId, setSuspendId] = useState<string | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [overrideId, setOverrideId] = useState<string | null>(null)
  const [overrideDate, setOverrideDate] = useState('')
  const [impersonateResult, setImpersonateResult] = useState<{ targetUrl: string; adminEmail: string } | null>(null)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const reload = (status?: string) => {
    startTransition(async () => {
      const data = await listTenants(status && status !== 'all' ? { status } : undefined)
      setTenants(data)
    })
  }

  const handleFilterChange = (v: string) => {
    setStatusFilter(v)
    reload(v)
  }

  const handleSuspend = () => {
    if (!suspendId || !suspendReason.trim()) return
    startTransition(async () => {
      const res = await suspendTenant(suspendId, suspendReason)
      if (res.success) {
        setSuspendId(null)
        setSuspendReason('')
        reload(statusFilter)
      } else {
        setError(res.error)
      }
    })
  }

  const handleReactivate = (id: string) => {
    startTransition(async () => {
      const res = await reactivateTenant(id)
      if (res.success) reload(statusFilter)
      else setError(res.error)
    })
  }

  const handleSetOverride = () => {
    if (!overrideId) return
    startTransition(async () => {
      const until = overrideDate ? new Date(overrideDate).toISOString() : null
      const res = await setTenantAccessOverride(overrideId, until)
      if (res.success) { setOverrideId(null); setOverrideDate(''); reload(statusFilter) }
      else setError(res.error)
    })
  }

  const handleImpersonate = (id: string) => {
    startTransition(async () => {
      const res = await impersonateTenant(id)
      if (res.success) {
        setImpersonateResult({ targetUrl: res.targetUrl, adminEmail: res.adminEmail })
      } else {
        setError(res.error)
      }
    })
  }

  const visible = statusFilter === 'all'
    ? tenants
    : tenants.filter(t => t.status === statusFilter)

  return (
    <div>
      {/* Filters + refresh */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {(['all', 'trial', 'active', 'past_due', 'suspended', 'cancelled'] as const).map(s => (
          <button
            key={s}
            onClick={() => handleFilterChange(s)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: statusFilter === s ? 'rgba(13,148,136,0.2)' : 'rgba(255,255,255,0.05)',
              color: statusFilter === s ? '#0D9488' : '#94A3B8',
              border: statusFilter === s ? '1px solid rgba(13,148,136,0.4)' : '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {s === 'all' ? 'All' : STATUS_STYLES[s as TenantStatus]?.label ?? s}
          </button>
        ))}
        <button
          onClick={() => reload(statusFilter)}
          disabled={isPending}
          className="ml-auto p-2 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8' }}
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl mb-4 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          <button className="ml-auto text-xs underline" onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      {/* Tenant cards — mobile stack, desktop table-like grid */}
      <div className="space-y-3">
        {visible.length === 0 && (
          <p className="text-sm py-8 text-center" style={{ color: '#64748B' }}>No tenants found.</p>
        )}
        {visible.map(t => {
          const style = STATUS_STYLES[t.status]
          return (
            <div key={t.id} className="rounded-xl p-4"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex flex-wrap items-start gap-3">
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-semibold text-sm truncate" style={{ color: '#F8FAFC' }}>{t.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: style.bg, color: style.color }}>
                      {style.label}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8' }}>
                      {t.plan}
                    </span>
                  </div>
                  <p className="text-xs mb-2" style={{ color: '#64748B' }}>{t.slug}.uyirly.com</p>
                  <div className="flex flex-wrap gap-4 text-xs" style={{ color: '#64748B' }}>
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> {t.user_count} users
                    </span>
                    <span className="flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5" /> {t.patient_count} patients
                    </span>
                    <span>Created {new Date(t.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    onClick={() => handleImpersonate(t.id)}
                    disabled={isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> View
                  </button>
                  <button
                    onClick={() => { setOverrideId(t.id); setOverrideDate('') }}
                    disabled={isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                    title="Extend trial or grant free access"
                    style={{ background: 'rgba(217,119,6,0.12)', color: '#FCD34D', border: '1px solid rgba(217,119,6,0.2)' }}
                  >
                    <CalendarClock className="w-3.5 h-3.5" /> Extend
                  </button>
                  {t.status === 'suspended' ? (
                    <button
                      onClick={() => handleReactivate(t.id)}
                      disabled={isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                      style={{ background: 'rgba(16,185,129,0.12)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)' }}
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Reactivate
                    </button>
                  ) : t.status !== 'cancelled' && (
                    <button
                      onClick={() => { setSuspendId(t.id); setSuspendReason('') }}
                      disabled={isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171', border: '1px solid rgba(239,68,68,0.2)' }}
                    >
                      <ShieldAlert className="w-3.5 h-3.5" /> Suspend
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Suspend modal */}
      {suspendId && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.12)' }}>
            <h3 className="font-semibold mb-3" style={{ color: '#F8FAFC' }}>Suspend tenant</h3>
            <p className="text-sm mb-4" style={{ color: '#94A3B8' }}>
              This will immediately block all users of this hospital. Provide a reason:
            </p>
            <textarea
              value={suspendReason}
              onChange={e => setSuspendReason(e.target.value)}
              rows={3}
              placeholder="e.g. Non-payment of subscription..."
              className="w-full px-3 py-2 rounded-xl text-sm resize-none focus:outline-none mb-4"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F8FAFC' }}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setSuspendId(null)}
                className="flex-1 py-2.5 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSuspend}
                disabled={!suspendReason.trim() || isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: 'rgba(239,68,68,0.8)', color: '#fff', opacity: isPending ? 0.7 : 1 }}
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm suspend
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend access / override modal */}
      {overrideId && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.12)' }}>
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock className="w-5 h-5" style={{ color: '#FCD34D' }} />
              <h3 className="font-semibold" style={{ color: '#F8FAFC' }}>Extend access</h3>
            </div>
            <p className="text-sm mb-4" style={{ color: '#94A3B8' }}>
              Grant this tenant full write access until a specific date, regardless of their subscription status. Leave blank to clear any existing override.
            </p>
            <label className="block text-xs mb-1.5 font-medium" style={{ color: '#94A3B8' }}>
              Access until (leave blank to clear)
            </label>
            <input
              type="date"
              value={overrideDate}
              onChange={e => setOverrideDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none mb-4"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F8FAFC', colorScheme: 'dark' }}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setOverrideId(null)}
                className="flex-1 py-2.5 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSetOverride}
                disabled={isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: 'rgba(217,119,6,0.8)', color: '#fff', opacity: isPending ? 0.7 : 1 }}
              >
                {isPending && <span className="animate-spin text-xs">⟳</span>}
                {overrideDate ? 'Set override' : 'Clear override'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Impersonate result modal */}
      {impersonateResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.12)' }}>
            <Building2 className="w-8 h-8 mb-3" style={{ color: '#0D9488' }} />
            <h3 className="font-semibold mb-2" style={{ color: '#F8FAFC' }}>Tenant login link</h3>
            <p className="text-xs mb-4" style={{ color: '#94A3B8' }}>
              Log in as <span style={{ color: '#F8FAFC' }}>{impersonateResult.adminEmail}</span> to access this tenant.
            </p>
            <a
              href={impersonateResult.targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center py-2.5 rounded-xl text-sm font-semibold mb-3"
              style={{ background: 'linear-gradient(135deg, #0D9488, #0891B2)', color: '#fff' }}
              onClick={() => setImpersonateResult(null)}
            >
              Open tenant login <ExternalLink className="inline w-3.5 h-3.5 ml-1" />
            </a>
            <button
              onClick={() => setImpersonateResult(null)}
              className="w-full py-2 rounded-xl text-sm"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
