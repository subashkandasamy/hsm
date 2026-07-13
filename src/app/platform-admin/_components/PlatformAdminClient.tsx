'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import {
  Building2, Users, UserCheck, ShieldAlert, ExternalLink, RefreshCw,
  Loader2, AlertTriangle, CalendarClock, Plus, Trash2, CreditCard,
  ChevronDown, Activity, Clock, CheckCircle2, XCircle, ArrowLeftRight,
  RotateCcw,
} from 'lucide-react'
import {
  listTenants, suspendTenant, reactivateTenant, impersonateTenant,
  setTenantAccessOverride, changeTenantPlan, extendTrial, createTenant,
  purgeTenantData, adminCancelSubscription, adminRetryPayment,
  listSubscriptions, listPlatformAudit,
} from '@/app/actions/platform'
import type { TenantWithStats } from '@/lib/types'
import type { AdminSubscriptionRow, AuditRow } from '@/app/actions/platform'

// Slice ISO string — identical on server and client, no locale variance
const fmtDate = (iso: string) => iso.slice(0, 10)           // 2026-07-01
const fmtDateTime = (iso: string) => iso.slice(0, 16).replace('T', ' ')  // 2026-07-01 09:13

// Renders a date ONLY after mount. The SSR HTML contains no date text, so
// date-reformatting browser extensions (which mutate the DOM before React
// hydrates) can't trigger a hydration mismatch. Fills in immediately post-mount.
function ClientDate({ iso, withTime = false }: { iso: string; withTime?: boolean }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null
  return <span suppressHydrationWarning>{withTime ? fmtDateTime(iso) : fmtDate(iso)}</span>
}

type TenantStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled' | 'purged'

const STATUS_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  trial:     { label: 'Trial',     bg: 'rgba(139,92,246,0.15)', color: '#A78BFA' },
  active:    { label: 'Active',    bg: 'rgba(16,185,129,0.15)', color: '#34D399' },
  past_due:  { label: 'Past due',  bg: 'rgba(245,158,11,0.15)', color: '#FCD34D' },
  suspended: { label: 'Suspended', bg: 'rgba(239,68,68,0.15)',  color: '#F87171' },
  cancelled: { label: 'Cancelled', bg: 'rgba(100,116,139,0.15)',color: '#94A3B8' },
  purged:    { label: 'Purged',    bg: 'rgba(71,85,105,0.2)',   color: '#64748B' },
}

const TABS = ['tenants', 'subscriptions', 'audit'] as const
type Tab = typeof TABS[number]

interface Props {
  initialTenants:       TenantWithStats[]
  initialSubscriptions: AdminSubscriptionRow[]
  initialAuditLog:      AuditRow[]
}

export default function PlatformAdminClient({ initialTenants, initialSubscriptions, initialAuditLog }: Props) {
  const [tab, setTab]         = useState<Tab>('tenants')
  const [tenants, setTenants] = useState(initialTenants)
  const [subs, setSubs]       = useState(initialSubscriptions)
  const [audit, setAudit]     = useState(initialAuditLog)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [error, setError]     = useState('')
  const [isPending, startTransition] = useTransition()

  // Modals
  const [suspendId, setSuspendId]       = useState<string | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [overrideId, setOverrideId]     = useState<string | null>(null)
  const [overrideDate, setOverrideDate] = useState('')
  const [impersonateResult, setImpersonateResult] = useState<{ magicLink: string; adminEmail: string } | null>(null)
  const [planChangeId, setPlanChangeId] = useState<string | null>(null)
  const [planChangeVal, setPlanChangeVal] = useState<'starter' | 'growth'>('starter')
  const [trialExtId, setTrialExtId]     = useState<string | null>(null)
  const [trialDays, setTrialDays]       = useState(30)
  const [purgeId, setPurgeId]           = useState<string | null>(null)
  const [purgeSlug, setPurgeSlug]       = useState('')
  const [createOpen, setCreateOpen]     = useState(false)
  const [createForm, setCreateForm]     = useState({
    name: '', slug: '', adminEmail: '', plan: 'starter' as 'starter' | 'growth', trialDays: 30,
  })

  const todayISO = useMemo(() => new Date().toISOString().split('T')[0], [])

  const toast = (msg: string) => { setError(msg); setTimeout(() => setError(''), 4000) }

  const reloadTenants = (status?: string) =>
    startTransition(async () => {
      const data = await listTenants(status && status !== 'all' ? { status } : undefined)
      setTenants(data)
    })

  const reloadSubs = () =>
    startTransition(async () => { const d = await listSubscriptions(); setSubs(d) })

  const reloadAudit = () =>
    startTransition(async () => { const d = await listPlatformAudit(50); setAudit(d) })

  const handleFilterChange = (v: string) => { setStatusFilter(v); reloadTenants(v) }

  // ── Tenant actions ──────────────────────────────────────────────────────────

  const handleSuspend = () => {
    if (!suspendId || !suspendReason.trim()) return
    startTransition(async () => {
      const res = await suspendTenant(suspendId, suspendReason)
      if (res.success) { setSuspendId(null); setSuspendReason(''); reloadTenants(statusFilter) }
      else toast(res.error)
    })
  }

  const handleReactivate = (id: string) =>
    startTransition(async () => {
      const res = await reactivateTenant(id)
      if (res.success) reloadTenants(statusFilter)
      else toast(res.error)
    })

  const handleSetOverride = () => {
    if (!overrideId) return
    startTransition(async () => {
      const until = overrideDate ? new Date(overrideDate).toISOString() : null
      const res = await setTenantAccessOverride(overrideId, until)
      if (res.success) { setOverrideId(null); setOverrideDate(''); reloadTenants(statusFilter) }
      else toast(res.error)
    })
  }

  const handleImpersonate = (id: string) =>
    startTransition(async () => {
      const res = await impersonateTenant(id)
      if (res.success) setImpersonateResult({ magicLink: res.magicLink, adminEmail: res.adminEmail })
      else toast(res.error)
    })

  const handlePlanChange = () => {
    if (!planChangeId) return
    startTransition(async () => {
      const res = await changeTenantPlan(planChangeId, planChangeVal)
      if (res.success) { setPlanChangeId(null); reloadTenants(statusFilter) }
      else toast(res.error)
    })
  }

  const handleTrialExtend = () => {
    if (!trialExtId) return
    startTransition(async () => {
      const res = await extendTrial(trialExtId, trialDays)
      if (res.success) { setTrialExtId(null); reloadTenants(statusFilter) }
      else toast(res.error)
    })
  }

  const handleCreate = () =>
    startTransition(async () => {
      const res = await createTenant({
        name:       createForm.name,
        slug:       createForm.slug,
        adminEmail: createForm.adminEmail,
        plan:       createForm.plan,
        trialDays:  createForm.trialDays,
      })
      if (res.success) {
        setCreateOpen(false)
        setCreateForm({ name: '', slug: '', adminEmail: '', plan: 'starter', trialDays: 30 })
        reloadTenants(statusFilter)
      } else toast(res.error)
    })

  const handlePurge = () => {
    if (!purgeId) return
    startTransition(async () => {
      const res = await purgeTenantData(purgeId, purgeSlug)
      if (res.success) { setPurgeId(null); setPurgeSlug(''); reloadTenants(statusFilter) }
      else toast(res.error)
    })
  }

  // ── Subscription actions ─────────────────────────────────────────────────────

  const handleCancelSub = (tenantId: string) =>
    startTransition(async () => {
      const res = await adminCancelSubscription(tenantId)
      if (res.success) reloadSubs()
      else toast(res.error)
    })

  const handleRetryPayment = (tenantId: string) =>
    startTransition(async () => {
      const res = await adminRetryPayment(tenantId)
      if (res.success) reloadSubs()
      else toast(res.error)
    })

  // ── Filtered tenant list ──────────────────────────────────────────────────────
  const visible = statusFilter === 'all'
    ? tenants
    : tenants.filter(t => t.status === statusFilter)

  const purgeTarget = tenants.find(t => t.id === purgeId)
  const planTarget  = tenants.find(t => t.id === planChangeId)
  const trialTarget = tenants.find(t => t.id === trialExtId)

  return (
    <div>
      {/* Tab nav */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl w-full sm:w-fit overflow-x-auto"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {[
          { id: 'tenants',       label: 'Tenants'       },
          { id: 'subscriptions', label: 'Subscriptions' },
          { id: 'audit',         label: 'Audit Log'     },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as Tab)}
            className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap shrink-0"
            style={{
              background: tab === t.id ? 'rgba(13,148,136,0.2)' : 'transparent',
              color:      tab === t.id ? '#0D9488' : '#64748B',
              border:     tab === t.id ? '1px solid rgba(13,148,136,0.3)' : '1px solid transparent',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl mb-4 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          <button className="ml-auto text-xs underline" onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      {/* ── TENANTS TAB ──────────────────────────────────────────────────────── */}
      {tab === 'tenants' && (
        <div>
          {/* Filter bar + New Tenant */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {(['all', 'trial', 'active', 'past_due', 'suspended', 'cancelled'] as const).map(s => (
              <button key={s} onClick={() => handleFilterChange(s)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: statusFilter === s ? 'rgba(13,148,136,0.2)' : 'rgba(255,255,255,0.05)',
                  color:      statusFilter === s ? '#0D9488' : '#94A3B8',
                  border:     statusFilter === s ? '1px solid rgba(13,148,136,0.4)' : '1px solid rgba(255,255,255,0.08)',
                }}>
                {s === 'all' ? 'All' : STATUS_STYLES[s]?.label ?? s}
              </button>
            ))}
            <button onClick={() => reloadTenants(statusFilter)} disabled={isPending}
              className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8' }}>
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
            <button onClick={() => setCreateOpen(true)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: 'rgba(13,148,136,0.2)', color: '#34D399', border: '1px solid rgba(13,148,136,0.3)' }}>
              <Plus className="w-3.5 h-3.5" /> New Tenant
            </button>
          </div>

          {/* Tenant cards */}
          <div className="space-y-3">
            {visible.length === 0 && (
              <p className="text-sm py-8 text-center" style={{ color: '#64748B' }}>No tenants found.</p>
            )}
            {visible.map(t => {
              const style = STATUS_STYLES[t.status] ?? STATUS_STYLES.suspended
              return (
                <div key={t.id} className="rounded-xl p-4"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-sm truncate" style={{ color: '#F8FAFC' }}>{t.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: style.bg, color: style.color }}>{style.label}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8' }}>{t.plan}</span>
                      </div>
                      <p className="text-xs mb-2" style={{ color: '#64748B' }}>{t.slug}.uyirly.com</p>
                      <div className="flex flex-wrap gap-4 text-xs" style={{ color: '#64748B' }}>
                        <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {t.user_count} users</span>
                        <span className="flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" /> {t.patient_count} patients</span>
                        <span className="flex items-center gap-1">Created <ClientDate iso={t.created_at} /></span>
                        {(t as any).trial_ends_at && t.status === 'trial' && (
                          <span className="flex items-center gap-1" style={{ color: '#A78BFA' }}>
                            <Clock className="w-3 h-3" />
                            Trial ends <ClientDate iso={(t as any).trial_ends_at} />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    {t.status !== 'purged' && (
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <button onClick={() => handleImpersonate(t.id)} disabled={isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                          style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.1)' }}>
                          <ExternalLink className="w-3.5 h-3.5" /> View
                        </button>
                        <button onClick={() => { setPlanChangeId(t.id); setPlanChangeVal(t.plan as any) }} disabled={isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                          style={{ background: 'rgba(99,102,241,0.12)', color: '#A5B4FC', border: '1px solid rgba(99,102,241,0.2)' }}>
                          <ArrowLeftRight className="w-3.5 h-3.5" /> Plan
                        </button>
                        <button onClick={() => { setTrialExtId(t.id); setTrialDays(30) }} disabled={isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                          style={{ background: 'rgba(217,119,6,0.12)', color: '#FCD34D', border: '1px solid rgba(217,119,6,0.2)' }}>
                          <CalendarClock className="w-3.5 h-3.5" /> Trial
                        </button>
                        <button onClick={() => { setOverrideId(t.id); setOverrideDate('') }} disabled={isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                          style={{ background: 'rgba(14,165,233,0.1)', color: '#38BDF8', border: '1px solid rgba(14,165,233,0.2)' }}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Access
                        </button>
                        {t.status === 'suspended' ? (
                          <button onClick={() => handleReactivate(t.id)} disabled={isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                            style={{ background: 'rgba(16,185,129,0.12)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)' }}>
                            <RefreshCw className="w-3.5 h-3.5" /> Reactivate
                          </button>
                        ) : t.status !== 'cancelled' && (
                          <button onClick={() => { setSuspendId(t.id); setSuspendReason('') }} disabled={isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                            style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                            <ShieldAlert className="w-3.5 h-3.5" /> Suspend
                          </button>
                        )}
                        <button onClick={() => { setPurgeId(t.id); setPurgeSlug('') }} disabled={isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                          style={{ background: 'rgba(127,29,29,0.3)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.3)' }}>
                          <Trash2 className="w-3.5 h-3.5" /> Delete data
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── SUBSCRIPTIONS TAB ─────────────────────────────────────────────────── */}
      {tab === 'subscriptions' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold" style={{ color: '#94A3B8' }}>{subs.length} subscriptions</p>
            <button onClick={reloadSubs} disabled={isPending}
              className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8' }}>
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
          </div>
          <div className="space-y-2">
            {subs.length === 0 && (
              <p className="text-sm py-8 text-center" style={{ color: '#64748B' }}>No subscriptions yet.</p>
            )}
            {subs.map(s => {
              const ss = STATUS_STYLES[s.status] ?? STATUS_STYLES.cancelled
              return (
                <div key={s.tenant_id} className="rounded-xl p-4"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <span className="font-semibold text-sm" style={{ color: '#F8FAFC' }}>{s.tenant_name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: ss.bg, color: ss.color }}>{ss.label}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full capitalize"
                          style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8' }}>{s.plan}</span>
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs" style={{ color: '#64748B' }}>
                        <span>{s.tenant_slug}.uyirly.com</span>
                        {s.current_period_end && (
                          <span className="flex items-center gap-1">
                            <CreditCard className="w-3 h-3" />
                            Renews <ClientDate iso={s.current_period_end!} />
                          </span>
                        )}
                        {s.razorpay_sub_id && (
                          <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#475569' }}>
                            {s.razorpay_sub_id}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {s.status === 'past_due' && (
                        <button onClick={() => handleRetryPayment(s.tenant_id)} disabled={isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                          style={{ background: 'rgba(16,185,129,0.12)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)' }}>
                          <RotateCcw className="w-3.5 h-3.5" /> Retry payment
                        </button>
                      )}
                      {s.status === 'active' && (
                        <button onClick={() => handleCancelSub(s.tenant_id)} disabled={isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                          style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                          <XCircle className="w-3.5 h-3.5" /> Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── AUDIT LOG TAB ─────────────────────────────────────────────────────── */}
      {tab === 'audit' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold" style={{ color: '#94A3B8' }}>Recent admin actions</p>
            <button onClick={reloadAudit} disabled={isPending}
              className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8' }}>
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
          </div>
          <div className="space-y-2">
            {audit.length === 0 && (
              <p className="text-sm py-8 text-center" style={{ color: '#64748B' }}>No admin actions yet.</p>
            )}
            {audit.map(a => (
              <div key={a.id} className="rounded-xl px-4 py-3 flex flex-wrap items-start gap-3"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <Activity className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: '#0D9488' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="text-xs font-mono font-semibold" style={{ color: '#A78BFA' }}>{a.action}</span>
                    {a.tenant_name && (
                      <span className="text-xs" style={{ color: '#94A3B8' }}>→ {a.tenant_name}</span>
                    )}
                  </div>
                  {a.meta && Object.keys(a.meta).length > 0 && (
                    <p className="text-xs truncate" style={{ color: '#475569' }}>
                      {JSON.stringify(a.meta)}
                    </p>
                  )}
                </div>
                <span className="text-xs whitespace-nowrap" style={{ color: '#475569' }}>
                  <ClientDate iso={a.created_at} withTime />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODALS ─────────────────────────────────────────────────────────────── */}

      {/* Suspend */}
      {suspendId && (
        <Modal onClose={() => setSuspendId(null)}>
          <h3 className="font-semibold mb-3" style={{ color: '#F8FAFC' }}>Suspend tenant</h3>
          <p className="text-sm mb-4" style={{ color: '#94A3B8' }}>This immediately blocks all users. Provide a reason:</p>
          <textarea value={suspendReason} onChange={e => setSuspendReason(e.target.value)}
            rows={3} placeholder="e.g. Non-payment..." className="w-full px-3 py-2 rounded-xl text-sm resize-none focus:outline-none mb-4"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F8FAFC' }} />
          <ModalActions onCancel={() => setSuspendId(null)}
            onConfirm={handleSuspend} confirmLabel="Suspend" confirmStyle="danger"
            disabled={!suspendReason.trim() || isPending} pending={isPending} />
        </Modal>
      )}

      {/* Override access */}
      {overrideId && (
        <Modal onClose={() => setOverrideId(null)}>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-5 h-5" style={{ color: '#38BDF8' }} />
            <h3 className="font-semibold" style={{ color: '#F8FAFC' }}>Override access</h3>
          </div>
          <p className="text-sm mb-4" style={{ color: '#94A3B8' }}>
            Grant full access until a date, regardless of subscription status. Leave blank to clear.
          </p>
          <label className="block text-xs mb-1.5 font-medium" style={{ color: '#94A3B8' }}>Access until</label>
          <input type="date" value={overrideDate} onChange={e => setOverrideDate(e.target.value)}
            min={todayISO}
            className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none mb-4"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F8FAFC', colorScheme: 'dark' }} />
          <ModalActions onCancel={() => setOverrideId(null)}
            onConfirm={handleSetOverride} confirmLabel={overrideDate ? 'Set override' : 'Clear override'}
            confirmStyle="primary" disabled={isPending} pending={isPending} />
        </Modal>
      )}

      {/* Plan change */}
      {planChangeId && planTarget && (
        <Modal onClose={() => setPlanChangeId(null)}>
          <div className="flex items-center gap-2 mb-3">
            <ArrowLeftRight className="w-5 h-5" style={{ color: '#A5B4FC' }} />
            <h3 className="font-semibold" style={{ color: '#F8FAFC' }}>Change plan — {planTarget.name}</h3>
          </div>
          <p className="text-sm mb-4" style={{ color: '#94A3B8' }}>
            Current plan: <strong style={{ color: '#F8FAFC' }}>{planTarget.plan}</strong>.
            If they have an active Razorpay subscription, it will be updated at cycle end.
          </p>
          <label className="block text-xs mb-1.5 font-medium" style={{ color: '#94A3B8' }}>New plan</label>
          <select value={planChangeVal} onChange={e => setPlanChangeVal(e.target.value as any)}
            className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none mb-4"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F8FAFC' }}>
            <option value="starter">Starter — ₹2,999/mo</option>
            <option value="growth">Growth — ₹7,999/mo</option>
          </select>
          <ModalActions onCancel={() => setPlanChangeId(null)}
            onConfirm={handlePlanChange} confirmLabel="Change plan" confirmStyle="primary"
            disabled={isPending} pending={isPending} />
        </Modal>
      )}

      {/* Trial extend */}
      {trialExtId && trialTarget && (
        <Modal onClose={() => setTrialExtId(null)}>
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="w-5 h-5" style={{ color: '#FCD34D' }} />
            <h3 className="font-semibold" style={{ color: '#F8FAFC' }}>Extend trial — {trialTarget.name}</h3>
          </div>
          <p className="text-sm mb-4" style={{ color: '#94A3B8' }}>
            Adds days to the trial. Resets status to trial if expired.
          </p>
          <label className="block text-xs mb-1.5 font-medium" style={{ color: '#94A3B8' }}>Days to add</label>
          <input type="number" min={1} max={365} value={trialDays} onChange={e => setTrialDays(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none mb-4"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F8FAFC' }} />
          <ModalActions onCancel={() => setTrialExtId(null)}
            onConfirm={handleTrialExtend} confirmLabel={`Add ${trialDays} days`} confirmStyle="primary"
            disabled={!trialDays || isPending} pending={isPending} />
        </Modal>
      )}

      {/* Impersonate result */}
      {impersonateResult && (
        <Modal onClose={() => setImpersonateResult(null)}>
          <Building2 className="w-8 h-8 mb-3" style={{ color: '#0D9488' }} />
          <h3 className="font-semibold mb-2" style={{ color: '#F8FAFC' }}>Magic login link</h3>
          <p className="text-xs mb-4" style={{ color: '#94A3B8' }}>
            Opens a one-time login as <span style={{ color: '#F8FAFC' }}>{impersonateResult.adminEmail}</span>.
            Valid for 60 minutes.
          </p>
          <a href={impersonateResult.magicLink} target="_blank" rel="noopener noreferrer"
            className="block text-center py-2.5 rounded-xl text-sm font-semibold mb-3"
            style={{ background: 'linear-gradient(135deg, #0D9488, #0891B2)', color: '#fff' }}
            onClick={() => setImpersonateResult(null)}>
            Open tenant dashboard
          </a>
          <button onClick={() => {
            navigator.clipboard.writeText(impersonateResult.magicLink)
          }} className="w-full py-2 rounded-xl text-xs" style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8' }}>
            Copy link
          </button>
        </Modal>
      )}

      {/* Create tenant */}
      {createOpen && (
        <Modal onClose={() => setCreateOpen(false)} wide>
          <div className="flex items-center gap-2 mb-4">
            <Plus className="w-5 h-5" style={{ color: '#34D399' }} />
            <h3 className="font-semibold" style={{ color: '#F8FAFC' }}>Create new tenant</h3>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Hospital name', key: 'name',       type: 'text',  placeholder: 'City General Hospital' },
              { label: 'Subdomain slug', key: 'slug',      type: 'text',  placeholder: 'citygeneral' },
              { label: 'Admin email',   key: 'adminEmail', type: 'email', placeholder: 'admin@cityhospital.com' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs mb-1 font-medium" style={{ color: '#94A3B8' }}>{f.label}</label>
                <input type={f.type} placeholder={f.placeholder}
                  value={(createForm as any)[f.key]}
                  onChange={e => setCreateForm(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F8FAFC' }} />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: '#94A3B8' }}>Plan</label>
                <select value={createForm.plan} onChange={e => setCreateForm(p => ({ ...p, plan: e.target.value as any }))}
                  className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F8FAFC' }}>
                  <option value="starter">Starter</option>
                  <option value="growth">Growth</option>
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: '#94A3B8' }}>Trial days</label>
                <input type="number" min={1} max={90} value={createForm.trialDays}
                  onChange={e => setCreateForm(p => ({ ...p, trialDays: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F8FAFC' }} />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <ModalActions onCancel={() => setCreateOpen(false)}
              onConfirm={handleCreate} confirmLabel="Create + invite" confirmStyle="success"
              disabled={!createForm.name || !createForm.slug || !createForm.adminEmail || isPending}
              pending={isPending} />
          </div>
        </Modal>
      )}

      {/* Purge / delete all data */}
      {purgeId && purgeTarget && (
        <Modal onClose={() => { setPurgeId(null); setPurgeSlug('') }}>
          <div className="flex items-center gap-2 mb-3">
            <Trash2 className="w-5 h-5" style={{ color: '#F87171' }} />
            <h3 className="font-semibold" style={{ color: '#F87171' }}>Delete all tenant data</h3>
          </div>
          <div className="rounded-xl p-3 mb-4"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p className="text-xs" style={{ color: '#FCA5A5' }}>
              This will permanently delete ALL clinical data for <strong>{purgeTarget.name}</strong> — patients,
              admissions, bills, lab records, prescriptions and everything else. This cannot be undone.
              The tenant account row is preserved for reference.
            </p>
          </div>
          <label className="block text-xs mb-1.5 font-medium" style={{ color: '#94A3B8' }}>
            Type the subdomain slug <strong style={{ color: '#F8FAFC' }}>{purgeTarget.slug}</strong> to confirm
          </label>
          <input type="text" value={purgeSlug} onChange={e => setPurgeSlug(e.target.value)}
            placeholder={purgeTarget.slug}
            className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none mb-4"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(239,68,68,0.3)', color: '#F8FAFC' }} />
          <ModalActions onCancel={() => { setPurgeId(null); setPurgeSlug('') }}
            onConfirm={handlePurge} confirmLabel="Delete all data"
            confirmStyle="danger"
            disabled={purgeSlug !== purgeTarget.slug || isPending} pending={isPending} />
        </Modal>
      )}
    </div>
  )
}

// ── Shared Modal shell ────────────────────────────────────────────────────────

function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className={`w-full ${wide ? 'max-w-lg' : 'max-w-sm'} rounded-2xl p-6`}
        style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.12)' }}>
        {children}
      </div>
    </div>
  )
}

type ConfirmStyle = 'danger' | 'primary' | 'success'

function ModalActions({
  onCancel, onConfirm, confirmLabel, confirmStyle, disabled, pending,
}: {
  onCancel: () => void
  onConfirm: () => void
  confirmLabel: string
  confirmStyle: ConfirmStyle
  disabled: boolean
  pending: boolean
}) {
  const bg: Record<ConfirmStyle, string> = {
    danger:  'rgba(239,68,68,0.8)',
    primary: 'rgba(13,148,136,0.8)',
    success: 'rgba(16,185,129,0.8)',
  }
  return (
    <div className="flex gap-3">
      <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm"
        style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8' }}>
        Cancel
      </button>
      <button onClick={onConfirm} disabled={disabled}
        className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
        style={{ background: bg[confirmStyle], color: '#fff', opacity: disabled ? 0.5 : 1 }}>
        {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {confirmLabel}
      </button>
    </div>
  )
}
