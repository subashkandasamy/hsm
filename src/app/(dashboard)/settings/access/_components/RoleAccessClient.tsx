'use client'

import { useState, useTransition } from 'react'
import { Check, Lock } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import { setRoleAccess, type RoleAccessGrid } from '@/app/actions/roleAccess'
import { ACCESS_GROUPS, GRANTABLE_ROLES, ROLE_LABEL, type AccessGroupKey, type GrantableRole } from '@/lib/access'

/**
 * Per role: which access groups it has. Built-in access shows as included and
 * cannot be switched off here — grants only add. Changes apply the next time
 * that person opens a page.
 */
export default function RoleAccessClient({ initial }: { initial: RoleAccessGrid }) {
  const [role, setRole] = useState<GrantableRole>('hr')
  const [granted, setGranted] = useState(initial.granted)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const builtIn = initial.builtIn[role]
  const mine = granted[role]

  function toggle(group: AccessGroupKey) {
    const on = !mine.includes(group)
    const previous = granted
    setGranted({ ...granted, [role]: on ? [...mine, group] : mine.filter((g) => g !== group) })
    setError(''); setSaved(false)
    startTransition(async () => {
      const res = await setRoleAccess(role, group, on)
      if (!res.success) { setGranted(previous); setError(res.error); return }   // never show what was not saved
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    })
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {!initial.readable && (
        <div className="p-4 rounded-xl text-sm" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
          Access cannot be loaded yet — a database update for this page still needs to be applied. Until then every
          role keeps exactly the access it has always had.
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Role">
        {GRANTABLE_ROLES.map((r) => {
          const count = granted[r].length
          const on = r === role
          return (
            <button key={r} type="button" role="tab" aria-selected={on} onClick={() => { setRole(r); setError('') }}
              className="px-3 py-1.5 rounded-xl text-sm font-medium"
              style={{ background: on ? '#0D9488' : '#fff', color: on ? '#fff' : '#334155', border: `1px solid ${on ? '#0D9488' : '#E2E8F0'}` }}>
              {ROLE_LABEL[r]}{count > 0 && <span style={{ opacity: 0.85 }}> · +{count}</span>}
            </button>
          )
        })}
      </div>

      <GlassCard>
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-1">
            <h2 className="font-semibold" style={{ color: '#0F172A' }}>{ROLE_LABEL[role]}</h2>
            {saved && (
              <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#059669' }}>
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            )}
          </div>
          <p className="text-sm mb-5" style={{ color: '#64748B' }}>
            Switch on what every {ROLE_LABEL[role].toLowerCase()} should be able to do, on top of what the role already allows.
          </p>

          <div>
            {ACCESS_GROUPS.map((g, i) => {
              const included = builtIn.includes(g.key)
              const on = included || mine.includes(g.key)
              return (
                <div key={g.key} className="flex items-start gap-4 py-3" style={i ? { borderTop: '1px solid #F1F5F9' } : undefined}>
                  {included ? (
                    <span className="mt-0.5 flex-shrink-0 w-10 h-6 rounded-full flex items-center justify-center"
                      style={{ background: '#E2E8F0' }} title="Already part of this role">
                      <Lock className="w-3.5 h-3.5" style={{ color: '#64748B' }} />
                    </span>
                  ) : (
                    <button type="button" onClick={() => toggle(g.key)} disabled={isPending || !initial.readable}
                      role="switch" aria-checked={on} aria-label={`${g.label} for ${ROLE_LABEL[role]}`}
                      className="mt-0.5 flex-shrink-0 w-10 h-6 rounded-full transition-colors relative"
                      style={{ background: on ? '#0D9488' : '#CBD5E1', opacity: initial.readable ? 1 : 0.5 }}>
                      <span className="block w-4 h-4 rounded-full bg-white shadow transition-transform absolute top-1"
                        style={{ transform: on ? 'translateX(20px)' : 'translateX(4px)' }} />
                    </button>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: '#0F172A' }}>
                      {g.label}
                      {included && <span className="font-normal" style={{ color: '#94A3B8' }}> — already part of this role</span>}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{g.description}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {error && <p className="mt-4 text-sm px-3 py-2 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626' }}>{error}</p>}
        </div>
      </GlassCard>

      <GlassCard>
        <div className="p-6">
          <h2 className="font-semibold mb-1" style={{ color: '#0F172A' }}>Never added to a role</h2>
          <p className="text-sm mb-3" style={{ color: '#64748B' }}>
            These stay with the roles that carry the responsibility, because the hospital is answerable for them.
          </p>
          <ul className="text-sm space-y-1.5" style={{ color: '#334155' }}>
            <li>Writing prescriptions</li>
            <li>Signing lab and radiology reports</li>
            <li>PC&amp;PNDT and MTP forms</li>
            <li>Cancelling bills and approving discounts</li>
            <li>Hospital settings, GST, staff accounts and roles</li>
          </ul>
          <p className="text-xs mt-4" style={{ color: '#94A3B8' }}>
            A change applies the next time that person opens a page. Every change is recorded with who made it.
          </p>
        </div>
      </GlassCard>
    </div>
  )
}
