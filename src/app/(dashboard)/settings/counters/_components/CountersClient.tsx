'use client'

import { useState, useTransition } from 'react'
import { Monitor } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { approveThisComputer, listSharedDevices, removeSharedDevice, type SharedDevice } from '@/app/actions/counter'
import { COUNTER_IDLE_MINUTES, PIN_MAX_ATTEMPTS } from '@/lib/pin'

const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'not yet'

/** Approve this browser as a shared counter, and see or remove the others. */
export default function CountersClient({ initial }: { initial: SharedDevice[] | null }) {
  const [devices, setDevices] = useState(initial ?? [])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [removing, setRemoving] = useState<SharedDevice | null>(null)
  const [isPending, startTransition] = useTransition()
  const thisOne = devices.find((d) => d.isThis)

  async function reload() { setDevices(await listSharedDevices()) }

  function approve() {
    setError(''); setNotice('')
    startTransition(async () => {
      const res = await approveThisComputer(name)
      if (!res.success) { setError(res.error); return }
      setName(''); await reload(); setNotice('This computer is now a shared counter. Staff can switch in from the "Switch user" button.')
    })
  }

  function remove(d: SharedDevice) {
    setError(''); setNotice('')
    startTransition(async () => {
      const res = await removeSharedDevice(d.id)
      setRemoving(null)
      if (!res.success) { setError(res.error); return }
      await reload(); setNotice(`${d.name} is no longer a shared counter.`)
    })
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {initial === null && (
        <div className="p-4 rounded-xl text-sm" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
          Shared counters cannot be loaded yet — a database update for this page still needs to be applied.
        </div>
      )}

      <GlassCard>
        <div className="p-6">
          <h2 className="font-semibold mb-1" style={{ color: '#0F172A' }}>This computer</h2>
          {thisOne ? (
            <p className="text-sm" style={{ color: '#047857' }}>This computer is the shared counter “{thisOne.name}”.</p>
          ) : (
            <>
              <p className="text-sm mb-4" style={{ color: '#64748B' }}>
                Use this on the front-desk or pharmacy computer itself. Staff then switch in with their own PIN — on this
                computer only. A PIN does not work anywhere else.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Front desk PC" maxLength={60}
                  className="flex-1 px-3 rounded-xl text-sm" style={{ background: '#fff', border: '1px solid #E2E8F0', minHeight: '44px', color: '#0F172A', outline: 'none' }} />
                <button type="button" onClick={approve} disabled={isPending || initial === null}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold" style={{ background: isPending ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none' }}>
                  Make this a shared counter
                </button>
              </div>
            </>
          )}
          {notice && <p className="mt-4 text-sm px-3 py-2 rounded-lg" style={{ background: '#F0FDF4', color: '#047857' }}>{notice}</p>}
          {error && <p className="mt-4 text-sm px-3 py-2 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626' }}>{error}</p>}
        </div>
      </GlassCard>

      <GlassCard>
        <div className="p-6">
          <h2 className="font-semibold mb-3" style={{ color: '#0F172A' }}>Approved counters</h2>
          {devices.length === 0 ? (
            <p className="text-sm" style={{ color: '#64748B' }}>None yet.</p>
          ) : (
            <ul>
              {devices.map((d, i) => (
                <li key={d.id} className="flex items-center gap-3 py-3" style={i ? { borderTop: '1px solid #F1F5F9' } : undefined}>
                  <Monitor className="w-4 h-4 flex-shrink-0" style={{ color: '#0D9488' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: '#0F172A' }}>{d.name}{d.isThis && <span style={{ color: '#0D9488' }}> · this computer</span>}</p>
                    <p className="text-xs" style={{ color: '#94A3B8' }}>Added by {d.created_by_name ?? '—'} on {when(d.created_at)} · last used {when(d.last_used_at)}</p>
                  </div>
                  <button type="button" onClick={() => setRemoving(d)} disabled={isPending}
                    className="text-xs font-medium px-2.5 py-1 rounded-lg" style={{ color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA' }}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 pt-4 text-xs space-y-1" style={{ borderTop: '1px solid #F1F5F9', color: '#94A3B8' }}>
            <p>Each person sets their own PIN; nobody else ever sees it. {PIN_MAX_ATTEMPTS} wrong tries lock it until it is reset on the Staff page.</p>
            <p>A shared counter locks itself after {COUNTER_IDLE_MINUTES} minutes without use. Admins always sign in with their password.</p>
          </div>
        </div>
      </GlassCard>

      <ConfirmDialog
        open={!!removing}
        title="Remove this shared counter?"
        description={removing ? `${removing.name} will stop accepting PINs at once. Staff there will need their password.` : ''}
        confirmLabel="Remove"
        confirmVariant="danger"
        loading={isPending}
        onConfirm={() => { if (removing) remove(removing) }}
        onClose={() => setRemoving(null)}
      />
    </div>
  )
}
