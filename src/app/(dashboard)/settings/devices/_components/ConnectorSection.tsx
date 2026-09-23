'use client'

import { useState, useTransition } from 'react'
import { Plus, Server, Copy, Check, RefreshCw, Ban, Wifi, WifiOff } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EmptyState from '@/components/ui/EmptyState'
import {
  createConnector, regeneratePairingCode, revokeConnector, type ConnectorRow,
} from '@/app/actions/devices'

/**
 * The lab computer that talks to the analyzers.
 *
 * One per laboratory PC. Everything a hospital has to do to connect a machine
 * is here: name the computer, read out a code, and tell the service engineer
 * an address. No tokens, no configuration files, no ports to reason about.
 */
export default function ConnectorSection({
  connectors, onChange,
}: {
  connectors: ConnectorRow[]
  onChange: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [issued, setIssued] = useState<{ code: string; name: string } | null>(null)
  const [revoking, setRevoking] = useState<ConnectorRow | null>(null)

  function handleCreate() {
    setError('')
    startTransition(async () => {
      const res = await createConnector(name)
      if (!res.success) { setError(res.error); return }
      setIssued({ code: res.code, name: name.trim() })
      setShowCreate(false)
      setName('')
      onChange()
    })
  }

  function handleRegenerate(c: ConnectorRow) {
    startTransition(async () => {
      const res = await regeneratePairingCode(c.id)
      if (res.success) { setIssued({ code: res.code, name: c.name }); onChange() }
    })
  }

  function handleRevoke() {
    if (!revoking) return
    startTransition(async () => {
      await revokeConnector(revoking.id)
      setRevoking(null)
      onChange()
    })
  }

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-bold" style={{ color: '#0F172A' }}>Lab computers</h2>
          <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
            The small program that sits in your laboratory and passes results to Uyirly.
          </p>
        </div>
        <button onClick={() => { setShowCreate(true); setError('') }}
          className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 flex-shrink-0"
          style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
          <Plus className="w-3.5 h-3.5" /> Add computer
        </button>
      </div>

      {connectors.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<Server className="w-6 h-6" style={{ color: '#94A3B8' }} />}
            title="No lab computer connected yet"
            description="Add the computer that sits next to your analyzers. You will get a short code to type into the installer."
          />
        </GlassCard>
      ) : (
        <div className="grid gap-3">
          {connectors.map((c) => (
            <ConnectorCard key={c.id} connector={c}
              onRegenerate={() => handleRegenerate(c)}
              onRevoke={() => setRevoking(c)}
              busy={isPending} />
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add a lab computer">
        <div className="p-5">
          <p className="text-sm mb-4" style={{ color: '#64748B' }}>
            Name the computer in your laboratory that the analyzers are wired to.
            You will get a short code to type into the installer on that machine.
          </p>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: '#475569' }}>
            What is this computer called?
          </label>
          <Input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Lab front desk PC" autoFocus />
          {error && <p className="text-xs mt-2" style={{ color: '#DC2626' }}>{error}</p>}
          <div className="flex gap-2 justify-end mt-5">
            <button onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
              Cancel
            </button>
            <button onClick={handleCreate} disabled={isPending}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: isPending ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none' }}>
              {isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      <PairingCodeModal issued={issued} onClose={() => setIssued(null)} />

      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={handleRevoke}
        loading={isPending}
        title="Disconnect this computer?"
        description={`${revoking?.name ?? ''} will stop sending results immediately. Results it has already sent are kept — this is a laboratory record. To reconnect it later you will create a new pairing code.`}
        confirmLabel="Disconnect"
      />
    </section>
  )
}

function ConnectorCard({
  connector: c, onRegenerate, onRevoke, busy,
}: {
  connector: ConnectorRow
  onRegenerate: () => void
  onRevoke: () => void
  busy: boolean
}) {
  const revoked = c.status === 'revoked'
  const waiting = !c.paired_at && !revoked

  return (
    <GlassCard className="p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: revoked ? '#F1F5F9' : 'rgba(13,148,136,0.08)' }}>
          <Server className="w-4 h-4" style={{ color: revoked ? '#94A3B8' : '#0D9488' }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{c.name}</p>
            <StatusPill status={c.status} paired={!!c.paired_at} />
          </div>

          {c.machine_name && (
            <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{c.machine_name}</p>
          )}

          {waiting ? (
            <p className="text-xs mt-2" style={{ color: '#B45309' }}>
              Waiting for the installer to be run on that computer.
            </p>
          ) : c.lan_ip ? (
            // The one fact a service engineer needs. Everything else about the
            // network is ours to worry about, not theirs.
            <div className="mt-2 rounded-lg px-3 py-2" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#94A3B8' }}>
                Give this to your analyzer engineer
              </p>
              <p className="text-sm font-mono font-semibold" style={{ color: '#0F172A' }}>
                {c.lan_ip} : {c.listen_port}
              </p>
            </div>
          ) : null}

          <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>
            {c.last_seen_at
              ? `Last heard from ${timeAgo(c.last_seen_at)}`
              : 'Never heard from'}
            {c.version ? ` · v${c.version}` : ''}
          </p>
        </div>

        {!revoked && (
          <div className="flex gap-1.5 flex-shrink-0">
            <button onClick={onRegenerate} disabled={busy} title="New pairing code"
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"
              style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
              <RefreshCw className="w-3 h-3" /> New code
            </button>
            <button onClick={onRevoke} disabled={busy} title="Disconnect"
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"
              style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', cursor: 'pointer' }}>
              <Ban className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </GlassCard>
  )
}

function StatusPill({ status, paired }: { status: string; paired: boolean }) {
  const map: Record<string, { bg: string; fg: string; label: string; icon: boolean }> = {
    online:  { bg: '#ECFDF5', fg: '#047857', label: 'Connected',    icon: true },
    offline: { bg: '#FEF3C7', fg: '#B45309', label: 'Not responding', icon: false },
    pending: { bg: '#F1F5F9', fg: '#64748B', label: 'Not set up yet', icon: false },
    revoked: { bg: '#F1F5F9', fg: '#94A3B8', label: 'Disconnected', icon: false },
  }
  const s = map[status] ?? map.pending
  const label = status === 'pending' && paired ? 'Set up' : s.label
  return (
    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold flex items-center gap-1"
      style={{ background: s.bg, color: s.fg }}>
      {s.icon ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />} {label}
    </span>
  )
}

/**
 * The code, shown big.
 *
 * Somebody is going to read this down a telephone to a colleague standing at
 * the laboratory bench, so it is set large, monospaced and split in half. It
 * is shown once here and remains visible on the card until it is claimed.
 */
function PairingCodeModal({
  issued, onClose,
}: {
  issued: { code: string; name: string } | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!issued) return
    try {
      await navigator.clipboard.writeText(issued.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard is blocked in some browsers; the code is on screen anyway.
    }
  }

  return (
    <Modal open={!!issued} onClose={onClose} title="Pairing code">
      {issued && (
        <div className="p-5">
          <p className="text-sm mb-4" style={{ color: '#64748B' }}>
            On <strong style={{ color: '#0F172A' }}>{issued.name}</strong>, run the Uyirly
            Lab Connector installer and type this code when it asks.
          </p>

          <div className="rounded-xl px-4 py-5 text-center"
            style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <p className="font-mono font-bold tracking-[0.2em]"
              style={{ fontSize: '1.75rem', color: '#0F172A' }}>
              {issued.code}
            </p>
          </div>

          <button onClick={copy}
            className="w-full mt-3 px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
            {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy code</>}
          </button>

          <p className="text-xs mt-4" style={{ color: '#94A3B8' }}>
            The code works once and expires in an hour. If it expires, press
            &ldquo;New code&rdquo; for another — nothing is lost.
          </p>

          <div className="flex justify-end mt-5">
            <button onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: '#0D9488', color: '#fff', border: 'none' }}>
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}
