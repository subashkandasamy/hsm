'use client'

import { useState, useTransition } from 'react'
import { Plus, Server, Copy, Check, RefreshCw, Ban, Wifi, WifiOff, Trash2, Globe, HardDrive } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EmptyState from '@/components/ui/EmptyState'
import {
  createConnector, regeneratePairingCode, revokeConnector, deleteConnector, setInternetAccess, setKeepUploads,
  type ConnectorRow,
} from '@/app/actions/devices'
import { TUNNEL_FRESH_MS } from '@/lib/radiology/viewerRoute'

/**
 * What the connector listens on for imaging, and the name it answers to.
 *
 * Both are the connector's own defaults (connector/src/config.ts and
 * dicom/server.ts). They are shown rather than stored because nothing in the
 * product can change them yet — when that becomes configurable per connector,
 * these move onto the row.
 */
const DICOM_PORT = 11112
const DICOM_AE_TITLE = 'UYIRLY'

/**
 * Is `running` an older build than `latest`?
 *
 * Compared part by part as numbers, because as strings "1.0.10" sorts before
 * "1.0.9" and a hospital would be told to upgrade to something older than
 * what it has. Anything that does not look like a version at all is treated
 * as up to date: a badge that nags without cause teaches people to ignore it.
 */
function isOlder(running: string, latest: string): boolean {
  const parse = (v: string) => v.trim().replace(/^v/, '').split('.').map(Number)
  const a = parse(running)
  const b = parse(latest)
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return false
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x < y
  }
  return false
}

/**
 * The lab computer that talks to the analyzers.
 *
 * One per laboratory PC. Everything a hospital has to do to connect a machine
 * is here: name the computer, read out a code, and tell the service engineer
 * an address. No tokens, no configuration files, no ports to reason about.
 */
export default function ConnectorSection({
  connectors, onChange, latestVersion, internetAvailable = false, isAdmin = false,
}: {
  connectors: ConnectorRow[]
  onChange: () => void
  /** The newest published build, so a card can say when it is behind. */
  latestVersion?: string | null
  /** This Uyirly server can make Cloudflare Tunnels. */
  internetAvailable?: boolean
  /** Only an admin may put a computer on the internet. */
  isAdmin?: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [issued, setIssued] = useState<{ code: string; name: string } | null>(null)
  const [revoking, setRevoking] = useState<ConnectorRow | null>(null)
  const [deleting, setDeleting] = useState<ConnectorRow | null>(null)
  const [internet, setInternet] = useState<{ c: ConnectorRow; on: boolean } | null>(null)
  const [keep, setKeep] = useState<{ c: ConnectorRow; on: boolean } | null>(null)

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

  function handleInternet() {
    if (!internet) return
    startTransition(async () => {
      const res = await setInternetAccess(internet.c.id, internet.on)
      setInternet(null)
      if (!res.success) { setError(res.error); return }
      setError('')
      onChange()
    })
  }

  function handleKeep() {
    if (!keep) return
    startTransition(async () => {
      const res = await setKeepUploads(keep.c.id, keep.on)
      setKeep(null)
      if (!res.success) { setError(res.error); return }
      setError('')
      onChange()
    })
  }

  function handleDelete() {
    if (!deleting) return
    startTransition(async () => {
      const res = await deleteConnector(deleting.id)
      setDeleting(null)
      if (!res.success) { setError(res.error); return }
      onChange()
    })
  }

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-bold" style={{ color: '#0F172A' }}>Connected computers</h2>
          <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
            The small program that sits in your hospital and passes results and images to Uyirly.
          </p>
        </div>
        <button onClick={() => { setShowCreate(true); setError('') }}
          className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 flex-shrink-0"
          style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
          <Plus className="w-3.5 h-3.5" /> Add computer
        </button>
      </div>

      {error && !showCreate && (
        <p className="text-xs mb-2 rounded-lg px-3 py-2"
          style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
          {error}
        </p>
      )}

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
            <ConnectorCard key={c.id} connector={c} latestVersion={latestVersion}
              onRegenerate={() => handleRegenerate(c)}
              onRevoke={() => setRevoking(c)}
              onDelete={() => setDeleting(c)}
              onInternet={(on) => setInternet({ c, on })}
              onKeep={(on) => setKeep({ c, on })}
              internetAvailable={internetAvailable} isAdmin={isAdmin}
              busy={isPending} />
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add a lab computer">
        <div className="p-5">
          <p className="text-sm mb-4" style={{ color: '#64748B' }}>
            Name the computer your analyzers or scanners are wired to.
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

      <ConfirmDialog
        open={!!internet}
        onClose={() => setInternet(null)}
        onConfirm={handleInternet}
        loading={isPending}
        title={internet?.on ? 'Allow opening scans from outside the hospital?' : 'Switch internet access off?'}
        description={internet?.on
          ? `Doctors will be able to open scans stored on ${internet.c.name} from home or on their phone. Every link is made by Uyirly for one signed-in person, works for one hour and only for that scan. The computer must stay switched on and online for this to work.`
          : `Scans on ${internet?.c.name ?? 'this computer'} will open only on the hospital network again. Links already sent out stop working at once.`}
        confirmLabel={internet?.on ? 'Switch on' : 'Switch off'}
      />

      <ConfirmDialog
        open={!!keep}
        onClose={() => setKeep(null)}
        onConfirm={handleKeep}
        loading={isPending}
        title={keep?.on ? 'Keep uploaded files on this computer?' : 'Stop moving uploaded files here?'}
        description={keep?.on
          ? `Patient documents, IPD declaration uploads and radiology report images will move to ${keep.c.name} a minute after they are uploaded, and the cloud copy is then deleted. They open from this computer — on the hospital network, or from anywhere if internet access is on. Patients see report images in the portal only while this computer is on and internet access is on.${connectors.some((x) => x.keep_uploads && x.id !== keep.c.id) ? ' The computer that keeps them now will stop receiving new ones.' : ''}`
          : `New uploads will stay in the cloud. The ${keep?.c.files_kept ?? 0} file(s) already on ${keep?.c.name ?? 'this computer'} stay there and still open from it.`}
        confirmLabel={keep?.on ? 'Keep files here' : 'Stop'}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        loading={isPending}
        title="Remove this computer?"
        description={
          deleting && deleting.message_count > 0
            // Say exactly what survives. Both tables that point at a connector
            // clear the link rather than delete the row, and a result's
            // provenance names the analyzer, not the PC that relayed it.
            ? `${deleting.name} passed on ${deleting.message_count} message${deleting.message_count > 1 ? 's' : ''}. Those results and the machines that produced them are kept — only the note of which computer relayed them is cleared.`
            : `${deleting?.name ?? 'This computer'} never connected, so there is nothing to lose.`
        }
        confirmLabel="Remove"
      />
    </section>
  )
}

function ConnectorCard({
  connector: c, latestVersion, onRegenerate, onRevoke, onDelete, onInternet, onKeep,
  internetAvailable, isAdmin, busy,
}: {
  connector: ConnectorRow
  latestVersion?: string | null
  onRegenerate: () => void
  onRevoke: () => void
  onDelete: () => void
  onInternet: (on: boolean) => void
  onKeep: (on: boolean) => void
  internetAvailable: boolean
  isAdmin: boolean
  busy: boolean
}) {
  const revoked = c.status === 'revoked'
  // One fact decides this, not two. The card previously took its badge from
  // `status` and its message from `paired_at`, so a row could say "Connected"
  // and "Waiting for the installer to be run" at the same time.
  const setUp = !!c.paired_at || !!c.last_seen_at
  const waiting = !setUp && !revoked
  // One that never connected is a typo, not a record — it goes without ceremony.
  // One that is working has to be disconnected first, so results never stop
  // arriving as a side effect of tidying up.
  const removable = revoked || !setUp

  // Behind the published build. Worth saying, because the version a hospital
  // is running is invisible from here otherwise and a fix nobody installs is
  // a fix nobody has — we spent an afternoon in Karur before realising the
  // laboratory PC was two builds old.
  const behind = !revoked && setUp && !!c.version && !!latestVersion
    && isOlder(c.version, latestVersion)

  return (
    <GlassCard className="p-4">
      {/* flex-wrap was not enough: the buttons are unshrinkable but this
          column is not, so on a phone it collapsed to sixty pixels and the
          upgrade notice came out eighteen lines tall. Stacked below instead. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
        <div className="flex items-start gap-3 min-w-0 sm:contents">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: revoked ? '#F1F5F9' : 'rgba(13,148,136,0.08)' }}>
          <Server className="w-4 h-4" style={{ color: revoked ? '#94A3B8' : '#0D9488' }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{c.name}</p>
            <StatusPill status={c.status} setUp={setUp} />
          </div>

          {c.machine_name && (
            <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{c.machine_name}</p>
          )}

          {waiting ? (
            <p className="text-xs mt-2" style={{ color: '#B45309' }}>
              Waiting for the installer to be run on that computer.
            </p>
          ) : c.lan_ip ? (
            // The facts a service engineer needs. Everything else about the
            // network is ours to worry about, not theirs.
            //
            // Two addresses, because the same program answers both: analyzers
            // speak ASTM on the port below, scanners speak DICOM on 11112 and
            // also need the AE title to call. Showing only the first is what
            // left radiology engineers with nothing to type.
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg px-3 py-2" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#94A3B8' }}>
                  For your analyzer engineer
                </p>
                <p className="text-sm font-mono font-semibold" style={{ color: '#0F172A' }}>
                  {c.lan_ip} : {c.listen_port}
                </p>
              </div>
              <div className="rounded-lg px-3 py-2" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#94A3B8' }}>
                  For your scanner engineer
                </p>
                <p className="text-sm font-mono font-semibold" style={{ color: '#0F172A' }}>
                  {c.lan_ip} : {DICOM_PORT}
                </p>
                <p className="text-xs font-mono mt-0.5" style={{ color: '#64748B' }}>
                  AE title {DICOM_AE_TITLE}
                </p>
              </div>
            </div>
          ) : null}

          {!revoked && setUp && (
            <InternetAccess c={c} available={internetAvailable} isAdmin={isAdmin}
              busy={busy} onChange={onInternet} />
          )}
          {!revoked && setUp && (
            <KeepUploads c={c} isAdmin={isAdmin} busy={busy} onChange={onKeep} />
          )}

          <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>
            {c.last_seen_at
              ? `Last heard from ${timeAgo(c.last_seen_at)}`
              : 'Never heard from'}
            {c.version ? ` · v${c.version}` : ''}
          </p>

          {behind && (
            <p className="text-xs mt-1.5 rounded-md px-2 py-1 inline-block"
               style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
              Version {latestVersion} is available. Download it below and run
              install.cmd on that computer — it upgrades in place and keeps
              everything, including results not yet sent.
            </p>
          )}
        </div>
        </div>

        <div className="flex gap-1.5 flex-wrap sm:flex-shrink-0">
          {!revoked && (
            <button onClick={onRegenerate} disabled={busy} title="New pairing code"
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"
              style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
              <RefreshCw className="w-3 h-3" /> New code
            </button>
          )}
          {!revoked && c.paired_at && (
            <button onClick={onRevoke} disabled={busy} title="Disconnect"
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"
              style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', cursor: 'pointer' }}>
              <Ban className="w-3 h-3" /> Disconnect
            </button>
          )}
          {removable && (
            <button onClick={onDelete} disabled={busy} title="Remove"
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"
              style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', cursor: 'pointer' }}>
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          )}
        </div>
      </div>
    </GlassCard>
  )
}

/**
 * Whether doctors can open this computer's scans from outside the hospital.
 *
 * Says what is true now, in the words a hospital owner would use, not the
 * switch's position: "on" with a computer that has not checked in, or one
 * still running an old connector, is not working, and the card says which.
 */
function InternetAccess({
  c, available, isAdmin, busy, onChange,
}: {
  c: ConnectorRow
  available: boolean
  isAdmin: boolean
  busy: boolean
  onChange: (on: boolean) => void
}) {
  // The moment this card was drawn; the page refreshes after every change.
  const [now] = useState(() => Date.now())
  const fresh = !!c.tunnel_state_at && now - Date.parse(c.tunnel_state_at) <= TUNNEL_FRESH_MS
  let tone: 'off' | 'ok' | 'wait' | 'warn' = 'off'
  let line = 'Off — scans open only on the hospital network.'
  if (c.internet_access) {
    if (!c.tunnel_state || (c.tunnel_state === 'off' && !fresh) || c.tunnel_state === 'starting') {
      tone = 'wait'; line = 'Switching on — this computer picks it up within a minute.'
    } else if (!fresh) {
      tone = 'warn'; line = 'On, but this computer has not checked in for a few minutes. Is it switched on and online?'
    } else if (c.tunnel_state === 'up') {
      tone = 'ok'; line = 'On — doctors can open scans from home or on their phone.'
    } else if (c.tunnel_state === 'missing') {
      tone = 'warn'; line = 'On, but this computer could not download the internet-link program yet. Check that it can reach github.com; it keeps trying every ten minutes.'
    } else if (c.tunnel_state === 'off') {
      tone = 'wait'; line = 'Switching on — this computer picks it up within a minute.'
    } else {
      tone = 'warn'; line = 'On, but this computer cannot reach the internet link right now. Scans still open on the hospital network.'
    }
  }
  const colours = {
    off:  { bg: '#F8FAFC', fg: '#64748B', bd: '#E2E8F0' },
    ok:   { bg: '#ECFDF5', fg: '#047857', bd: '#A7F3D0' },
    wait: { bg: '#F1F5F9', fg: '#475569', bd: '#E2E8F0' },
    warn: { bg: '#FFFBEB', fg: '#92400E', bd: '#FDE68A' },
  }[tone]

  const canSwitch = isAdmin && (c.internet_access || available)

  return (
    <div className="mt-2 rounded-lg px-3 py-2 flex flex-col gap-2 sm:flex-row sm:items-center"
      style={{ background: colours.bg, border: `1px solid ${colours.bd}` }}>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide mb-0.5 flex items-center gap-1"
          style={{ color: '#94A3B8' }}>
          <Globe className="w-3 h-3" /> Opening scans from outside the hospital
        </p>
        <p className="text-xs" style={{ color: colours.fg }}>{line}</p>
        {!c.internet_access && !available && (
          <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>Not available on Uyirly yet.</p>
        )}
        {!c.internet_access && available && !isAdmin && (
          <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>An admin can switch this on.</p>
        )}
      </div>
      {canSwitch && (
        <button onClick={() => onChange(!c.internet_access)} disabled={busy}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 self-start sm:self-auto"
          style={c.internet_access
            ? { background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }
            : { background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
          {c.internet_access ? 'Switch off' : 'Switch on'}
        </button>
      )}
    </div>
  )
}

/**
 * Whether this computer holds the hospital's uploaded files (0275), and how
 * many have moved or are on their way.
 */
function KeepUploads({
  c, isAdmin, busy, onChange,
}: {
  c: ConnectorRow
  isAdmin: boolean
  busy: boolean
  onChange: (on: boolean) => void
}) {
  const parts: string[] = []
  if (c.files_kept) parts.push(`${c.files_kept} file${c.files_kept === 1 ? '' : 's'} here`)
  if (c.files_waiting) parts.push(`${c.files_waiting} on the way`)
  const line = c.keep_uploads
    ? `On — patient documents, IPD declarations and radiology report images move here.${parts.length ? ` ${parts.join(' · ')}.` : ''}`
    : `Off — uploaded files stay in the cloud.${c.files_kept ? ` ${c.files_kept} earlier file${c.files_kept === 1 ? '' : 's'} still here.` : ''}`
  return (
    <div className="mt-2 rounded-lg px-3 py-2 flex flex-col gap-2 sm:flex-row sm:items-center"
      style={c.keep_uploads
        ? { background: '#ECFDF5', border: '1px solid #A7F3D0' }
        : { background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide mb-0.5 flex items-center gap-1"
          style={{ color: '#94A3B8' }}>
          <HardDrive className="w-3 h-3" /> Keep uploaded files on this computer
        </p>
        <p className="text-xs" style={{ color: c.keep_uploads ? '#047857' : '#64748B' }}>{line}</p>
        {!isAdmin && !c.keep_uploads && (
          <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>An admin can switch this on.</p>
        )}
      </div>
      {isAdmin && (
        <button onClick={() => onChange(!c.keep_uploads)} disabled={busy}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 self-start sm:self-auto"
          style={c.keep_uploads
            ? { background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }
            : { background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
          {c.keep_uploads ? 'Switch off' : 'Switch on'}
        </button>
      )}
    </div>
  )
}

function StatusPill({ status, setUp }: { status: string; setUp: boolean }) {
  const map: Record<string, { bg: string; fg: string; label: string; icon: boolean }> = {
    online:  { bg: '#ECFDF5', fg: '#047857', label: 'Connected',    icon: true },
    offline: { bg: '#FEF3C7', fg: '#B45309', label: 'Not responding', icon: false },
    pending: { bg: '#F1F5F9', fg: '#64748B', label: 'Not set up yet', icon: false },
    revoked: { bg: '#F1F5F9', fg: '#94A3B8', label: 'Disconnected', icon: false },
  }
  // Never claim a connection to something that has never spoken to us.
  const s = !setUp && status !== 'revoked' ? map.pending : (map[status] ?? map.pending)
  const label = s.label
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
