'use client'

/**
 * Lab → Catalog → Packages.
 *
 * A package is several tests sold together at one price, like a health
 * check-up. Ordering it orders each test; the laboratory and radiology work on
 * them exactly as on any other order. See src/app/actions/packages.ts.
 */

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Package, Plus, Search, X, AlertTriangle } from 'lucide-react'
import Money from '@/components/ui/Money'
import { listPackages, savePackage, setPackageActive, type PackageInput } from '@/app/actions/packages'
import { listLabCatalog } from '@/app/actions/lab'
import { listRadiologyCatalog } from '@/app/actions/radiology'
import type { LabTestCatalog, RadiologyCatalog, TestPackage } from '@/lib/types'
import type { PackageAppliesTo } from '@/lib/lab/packagePrice'

const ACCENT = '#0D9488'
const INK = '#0F172A'
const MUTED = '#64748B'
const FAINT = '#94A3B8'
const LINE = '#E2E8F0'

const FOR_WHOM: Array<{ value: PackageAppliesTo; label: string }> = [
  { value: 'all', label: 'Everyone' },
  { value: 'female', label: 'Women only' },
  { value: 'male', label: 'Men only' },
]

interface DraftItem { kind: 'lab' | 'scan'; test_id: string; name: string; price: number; applies_to: PackageAppliesTo }
interface Draft { id?: string; name: string; price: string; items: DraftItem[] }

export default function PackagesTab() {
  const [packages, setPackages] = useState<TestPackage[] | null>(null)
  const [labs, setLabs] = useState<LabTestCatalog[]>([])
  const [scans, setScans] = useState<RadiologyCatalog[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [listErr, setListErr] = useState('')

  const fetchAll = () => Promise.all([listPackages(), listLabCatalog(), listRadiologyCatalog()])
  async function load() {
    const [p, l, s] = await fetchAll()
    setPackages(p); setLabs(l); setScans(s)
  }
  useEffect(() => {
    let alive = true
    fetchAll()
      .then(([p, l, s]) => { if (alive) { setPackages(p); setLabs(l); setScans(s) } })
      .catch(() => { if (alive) setListErr('Could not load packages — refresh the page') })
    return () => { alive = false }
  }, [])

  function startNew() { setDraft({ name: '', price: '', items: [] }) }
  function startEdit(p: TestPackage) {
    setDraft({
      id: p.id, name: p.name, price: String(p.price),
      items: p.items.map((i) => ({ kind: i.kind, test_id: i.test_id, name: i.name, price: i.price, applies_to: i.applies_to })),
    })
  }

  async function toggle(p: TestPackage) {
    setBusyId(p.id); setListErr('')
    const r = await setPackageActive(p.id, !p.is_active)
    setBusyId(null)
    if (!r.success) { setListErr(r.error); return }
    setPackages((prev) => (prev ?? []).map((x) => x.id === p.id ? { ...x, is_active: !p.is_active } : x))
  }

  if (draft) {
    return <PackageEditor draft={draft} labs={labs} scans={scans}
      onCancel={() => setDraft(null)}
      onSaved={async () => { setDraft(null); await load() }} />
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <p className="text-sm max-w-xl" style={{ color: MUTED }}>
          A package is several tests sold together at one price — a health check-up, or the tests
          before surgery. Ordering a package orders each of its tests; the lab works on them as usual.
        </p>
        <button type="button" onClick={startNew}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold flex-shrink-0"
          style={{ background: ACCENT, color: '#fff', border: 'none', cursor: 'pointer' }}>
          <Plus className="w-4 h-4" /> New package
        </button>
      </div>

      {listErr && <p className="text-sm mb-3 rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626' }}>{listErr}</p>}

      {packages === null ? (
        <p className="text-sm text-center py-10" style={{ color: FAINT }}>Loading…</p>
      ) : packages.length === 0 ? (
        <div className="text-center py-12 rounded-2xl" style={{ border: `1px dashed ${LINE}` }}>
          <Package className="w-8 h-8 mx-auto mb-2" style={{ color: FAINT }} />
          <p className="text-sm font-medium" style={{ color: INK }}>No packages yet</p>
          <p className="text-xs mt-1" style={{ color: MUTED }}>Make one for each check-up or test set your hospital sells.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {packages.map((p) => <PackageCard key={p.id} pkg={p} busy={busyId === p.id}
            onEdit={() => startEdit(p)} onToggle={() => toggle(p)} />)}
        </div>
      )}
    </div>
  )
}

// ── One package in the list ──────────────────────────────────────────────────

function PackageCard({ pkg, busy, onEdit, onToggle }: { pkg: TestPackage; busy: boolean; onEdit: () => void; onToggle: () => void }) {
  const labCount = pkg.items.filter((i) => i.kind === 'lab').length
  const scanCount = pkg.items.length - labCount
  return (
    <div className="rounded-2xl p-4" style={{ border: `1px solid ${LINE}`, background: pkg.is_active ? '#fff' : '#F8FAFC', opacity: pkg.is_active ? 1 : 0.75 }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: INK }}>{pkg.name}</p>
          <p className="text-xs mt-0.5" style={{ color: MUTED }}>{countLabel(labCount, scanCount)}</p>
        </div>
        <p className="text-base font-semibold flex-shrink-0" style={{ color: ACCENT }}><Money amount={pkg.price} /></p>
      </div>
      <p className="text-xs mt-2 line-clamp-2" style={{ color: MUTED }}>
        {pkg.items.map((i) => i.name + (i.applies_to === 'female' ? ' (women)' : i.applies_to === 'male' ? ' (men)' : '')).join(' · ')}
      </p>
      {pkg.problems.length > 0 && (
        <p className="text-xs mt-2 flex items-start gap-1.5 rounded-lg px-2 py-1.5" style={{ background: '#FFFBEB', color: '#92400E' }}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{pkg.problems.join(' · ')} — this package cannot be ordered until you edit it.</span>
        </p>
      )}
      <div className="flex items-center justify-between gap-3 mt-3 pt-3" style={{ borderTop: `1px solid #F1F5F9` }}>
        <p className="text-xs" style={{ color: FAINT }}>Bought separately: <Money amount={pkg.separate_total} /></p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onEdit} className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: '#F0FDFA', color: ACCENT, border: '1px solid #99F6E4', cursor: 'pointer' }}>Edit</button>
          <button type="button" onClick={onToggle} disabled={busy}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: pkg.is_active ? '#fff' : ACCENT, color: pkg.is_active ? MUTED : '#fff', border: `1px solid ${pkg.is_active ? LINE : ACCENT}`, cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? '…' : pkg.is_active ? 'Switch off' : 'Switch on'}
          </button>
        </div>
      </div>
    </div>
  )
}

function countLabel(labs: number, scans: number): string {
  const l = `${labs} lab test${labs === 1 ? '' : 's'}`
  return scans ? `${l} + ${scans} scan${scans === 1 ? '' : 's'}` : l
}

// ── Making or changing a package ─────────────────────────────────────────────

function PackageEditor({ draft: initial, labs, scans, onCancel, onSaved }: {
  draft: Draft; labs: LabTestCatalog[]; scans: RadiologyCatalog[]; onCancel: () => void; onSaved: () => void
}) {
  const [draft, setDraft] = useState<Draft>(initial)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const added = useMemo(() => new Set(draft.items.map((i) => `${i.kind}:${i.test_id}`)), [draft.items])
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const all: DraftItem[] = [
      ...labs.map((t) => ({ kind: 'lab' as const, test_id: t.id, name: t.name, price: t.price, applies_to: 'all' as const, code: t.code ?? '' })),
      ...scans.map((t) => ({ kind: 'scan' as const, test_id: t.id, name: t.name, price: t.price, applies_to: 'all' as const, code: t.modality ?? '' })),
    ].filter((t) => !added.has(`${t.kind}:${t.test_id}`) && (t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)))
    return all.slice(0, 8)
  }, [query, labs, scans, added])

  const separate = Math.round(draft.items.reduce((s, i) => s + i.price, 0) * 100) / 100
  const price = Number(draft.price)
  const labItems = draft.items.filter((i) => i.kind === 'lab')
  const scanItems = draft.items.filter((i) => i.kind === 'scan')

  function add(item: DraftItem) {
    setDraft((d) => ({ ...d, items: [...d.items, { ...item, applies_to: 'all' }] })); setQuery('')
  }
  function remove(item: DraftItem) {
    setDraft((d) => ({ ...d, items: d.items.filter((i) => !(i.kind === item.kind && i.test_id === item.test_id)) }))
  }
  function setFor(item: DraftItem, applies_to: PackageAppliesTo) {
    setDraft((d) => ({ ...d, items: d.items.map((i) => i.kind === item.kind && i.test_id === item.test_id ? { ...i, applies_to } : i) }))
  }

  async function save() {
    setSaving(true); setErr('')
    const input: PackageInput = {
      id: draft.id, name: draft.name, price: Number(draft.price),
      items: draft.items.map((i) => ({ kind: i.kind, test_id: i.test_id, applies_to: i.applies_to })),
    }
    const r = await savePackage(input)
    setSaving(false)
    if (!r.success) { setErr(r.error); return }
    onSaved()
  }

  const inp = 'w-full px-3 py-2 rounded-xl text-sm border'
  const bdr = { borderColor: LINE, color: INK, background: '#fff' }

  return (
    <div className="max-w-3xl">
      <button type="button" onClick={onCancel} className="flex items-center gap-1 text-xs font-medium mb-4"
        style={{ color: MUTED, background: 'none', border: 'none', cursor: 'pointer' }}>
        <ArrowLeft className="w-3.5 h-3.5" /> Back to packages
      </button>

      <label className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Package name</label>
      <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder="e.g. Basic Health Check-Up" className={inp} style={bdr} maxLength={120} />

      <label className="block text-xs font-medium mt-5 mb-1" style={{ color: MUTED }}>Add tests and scans</label>
      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4" style={{ color: FAINT }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your lab tests and scans by name…" className={`${inp} pl-9`} style={bdr} />
        {matches.length > 0 && (
          <ul className="mt-1 rounded-xl overflow-hidden" style={{ border: `1px solid ${LINE}`, background: '#fff' }}>
            {matches.map((m) => (
              <li key={`${m.kind}:${m.test_id}`}>
                <button type="button" onClick={() => add(m)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm"
                  style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}>
                  <span className="flex items-center gap-2 min-w-0">
                    <KindTag kind={m.kind} />
                    <span className="truncate" style={{ color: INK }}>{m.name}</span>
                  </span>
                  <span className="flex items-center gap-2 flex-shrink-0 text-xs" style={{ color: MUTED }}>
                    <Money amount={m.price} /> <Plus className="w-3.5 h-3.5" style={{ color: ACCENT }} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim() && matches.length === 0 && (
          <p className="text-xs mt-1" style={{ color: FAINT }}>
            Nothing matches. Only tests your hospital sells on their own can go in a package — add a test to your catalogue first.
          </p>
        )}
      </div>

      <div className="mt-5 rounded-2xl overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
        {draft.items.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: FAINT }}>No tests yet — search above to add them.</p>
        ) : (
          <>
            <ItemGroup title="Lab tests" items={labItems} onRemove={remove} onFor={setFor} />
            <ItemGroup title="Scans & ECG" items={scanItems} onRemove={remove} onFor={setFor} />
          </>
        )}
      </div>
      {draft.items.some((i) => i.applies_to !== 'all') && (
        <p className="text-xs mt-2" style={{ color: MUTED }}>
          Tests marked for women or men only are left out automatically for the other sex. The price stays the same.
        </p>
      )}

      <div className="mt-5 rounded-2xl p-4" style={{ background: '#F8FAFC', border: `1px solid ${LINE}` }}>
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: MUTED }}>These tests bought separately</span>
          <span className="font-medium" style={{ color: INK }}><Money amount={separate} /></span>
        </div>
        <div className="flex items-center justify-between gap-3 mt-3">
          <label htmlFor="pkg-price" className="text-sm font-semibold" style={{ color: INK }}>Package price (₹)</label>
          <input id="pkg-price" type="number" min={1} step="1" value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            className="w-36 px-3 py-2 rounded-xl text-sm border text-right font-semibold" style={{ ...bdr, color: ACCENT }} />
        </div>
        {price > 0 && separate > 0 && <PriceNote price={price} separate={separate} />}
        <p className="text-xs mt-3" style={{ color: FAINT }}>
          On the bill, each test shows its share of the package price, so lab and scan money stay in their own departments.
        </p>
      </div>

      {err && <p className="text-sm mt-4 rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626' }}>{err}</p>}

      <div className="flex justify-end gap-3 mt-5">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: '#F1F5F9', color: '#475569', border: `1px solid ${LINE}`, cursor: 'pointer' }}>Cancel</button>
        <button type="button" onClick={save} disabled={saving}
          className="px-5 py-2 rounded-xl text-sm font-semibold"
          style={{ background: saving ? FAINT : ACCENT, color: '#fff', border: 'none', cursor: saving ? 'wait' : 'pointer' }}>
          {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Save package'}
        </button>
      </div>
    </div>
  )
}

function PriceNote({ price, separate }: { price: number; separate: number }) {
  const diff = Math.round((price - separate) * 100) / 100
  if (diff === 0) return <p className="text-xs mt-2" style={{ color: MUTED }}>Same as buying the tests separately.</p>
  const pct = Math.round((Math.abs(diff) / separate) * 100)
  return diff < 0
    ? <p className="text-xs mt-2" style={{ color: '#047857' }}>Patient saves <Money amount={-diff} /> ({pct}% off).</p>
    : <p className="text-xs mt-2" style={{ color: '#92400E' }}><Money amount={diff} /> more than buying the tests separately.</p>
}

function ItemGroup({ title, items, onRemove, onFor }: {
  title: string; items: DraftItem[]; onRemove: (i: DraftItem) => void; onFor: (i: DraftItem, v: PackageAppliesTo) => void
}) {
  if (!items.length) return null
  return (
    <div>
      <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide" style={{ background: '#F8FAFC', color: MUTED, borderBottom: `1px solid ${LINE}` }}>
        {title} ({items.length})
      </p>
      {items.map((i) => (
        <div key={`${i.kind}:${i.test_id}`} className="flex flex-wrap items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <span className="flex-1 min-w-[10rem] text-sm" style={{ color: INK }}>{i.name}</span>
          <select value={i.applies_to} onChange={(e) => onFor(i, e.target.value as PackageAppliesTo)}
            aria-label={`Who gets ${i.name}`}
            className="px-2 py-1 rounded-lg text-xs border" style={{ borderColor: LINE, color: INK, background: '#fff' }}>
            {FOR_WHOM.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <span className="w-20 text-right text-xs" style={{ color: MUTED }} title="Price of this test on its own"><Money amount={i.price} /></span>
          <button type="button" onClick={() => onRemove(i)} aria-label={`Take ${i.name} out`}
            className="p-1 rounded-lg" style={{ background: 'none', border: 'none', cursor: 'pointer', color: FAINT }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

export function KindTag({ kind }: { kind: 'lab' | 'scan' }) {
  return (
    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded flex-shrink-0"
      style={kind === 'lab' ? { background: '#EFF6FF', color: '#2563EB' } : { background: '#F5F3FF', color: '#7C3AED' }}>
      {kind === 'lab' ? 'Lab' : 'Scan'}
    </span>
  )
}
