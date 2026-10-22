'use client'

import { useState, useTransition } from 'react'
import { Scan, Pill, Plus, X } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import {
  setScanBucket, addTrackedDrug, removeTrackedDrug, searchDrugsForReturn,
  type ScanBucketRow, type TrackedDrugRow,
} from '@/app/actions/pcpndt'

/**
 * The two facts the monthly returns cannot derive.
 *
 * Report I counts every ultrasound, split male and female and by what was
 * scanned — and the register cannot tell a cardiac scan from an antenatal one,
 * so the hospital says once per study.
 *
 * Report V needs a starting stock figure. Every month afterwards walks forward
 * from it, which makes a wrong opening a wrong closing for ever.
 */

const BUCKETS: { value: string; label: string; group: string }[] = [
  { value: 'male_abdomen',           label: 'Abdomen',                     group: 'Male' },
  { value: 'male_cardiac',           label: 'Cardiac',                     group: 'Male' },
  { value: 'female_general_abdomen', label: 'General abdomen',             group: 'Female' },
  { value: 'female_antenatal',       label: 'Antenatal',                   group: 'Female' },
  { value: 'female_preconception',   label: 'Pre-conception / follicular', group: 'Female' },
  { value: 'female_transvaginal',    label: 'Trans-vaginal',               group: 'Female' },
  { value: 'female_other',           label: 'Other ultrasound',            group: 'Female' },
  { value: 'not_ultrasound',         label: 'Not ultrasound — exclude',    group: 'Excluded' },
]

export default function ReturnSetup({ scans, drugs }: {
  scans: ScanBucketRow[]
  drugs: TrackedDrugRow[]
}) {
  const [rows, setRows] = useState(scans)
  const [tracked, setTracked] = useState(drugs)
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  // Drug picker
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Array<{ id: string; name: string }>>([])
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null)
  const [label, setLabel] = useState('')
  const [qty, setQty] = useState('')
  const [asOf, setAsOf] = useState('')

  function assign(id: string, bucket: string) {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, pcpndt_bucket: bucket || null } : x)))
    startTransition(async () => {
      const res = await setScanBucket(id, bucket || null)
      if (!res.success) setMsg(res.error)
    })
  }

  function search(v: string) {
    setQ(v); setPicked(null)
    startTransition(async () => setHits(await searchDrugsForReturn(v)))
  }

  function addDrug() {
    if (!picked) { setMsg('Pick a drug first'); return }
    startTransition(async () => {
      const res = await addTrackedDrug({
        drug_master_id: picked.id,
        report_label: label || picked.name,
        opening_qty: Number(qty || 0),
        opening_as_of: asOf,
      })
      if (!res.success) { setMsg(res.error); return }
      setTracked((t) => [...t, {
        id: crypto.randomUUID(), drug_master_id: picked.id,
        report_label: label || picked.name, opening_qty: Number(qty || 0),
        opening_as_of: asOf, is_active: true,
      }])
      setQ(''); setHits([]); setPicked(null); setLabel(''); setQty(''); setAsOf(''); setMsg(null)
    })
  }

  const unmapped = rows.filter((r) => !r.pcpndt_bucket).length

  return (
    <div className="space-y-4">
      {msg && (
        <GlassCard className="p-3" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <p className="text-xs" style={{ color: '#991B1B' }}>{msg}</p>
        </GlassCard>
      )}

      <GlassCard className="p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>
          <Scan className="w-4 h-4" style={{ color: '#0D9488' }} /> Which column each scan counts in
        </h3>
        <p className="text-xs mb-4" style={{ color: '#94A3B8' }}>
          The monthly scan count covers every ultrasound, not only the ones with a Form F behind
          them — it has columns for male abdomen and cardiac work. Nothing in the register can tell
          those apart, so each study is placed once here.
          {unmapped > 0 && (
            <span style={{ color: '#B45309' }}> {unmapped} not yet placed.</span>
          )}
        </p>

        {rows.length === 0 ? (
          <p className="text-xs" style={{ color: '#94A3B8' }}>No studies in the catalogue yet.</p>
        ) : (
          <div className="grid gap-1.5">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg"
                style={{ background: r.pcpndt_bucket ? '#F8FAFC' : '#FFFBEB', border: '1px solid #E2E8F0' }}>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate" style={{ color: '#0F172A' }}>{r.name}</p>
                  <p className="text-xs" style={{ color: '#94A3B8' }}>
                    {r.modality ?? 'unspecified'}{r.body_part ? ` · ${r.body_part}` : ''}
                  </p>
                </div>
                <Select value={r.pcpndt_bucket ?? ''} disabled={isPending}
                  onChange={(e) => assign(r.id, e.target.value)}
                  style={{ maxWidth: '16rem' }}>
                  <option value="">— not placed —</option>
                  {['Male', 'Female', 'Excluded'].map((g) => (
                    <optgroup key={g} label={g}>
                      {BUCKETS.filter((b) => b.group === g).map((b) => (
                        <option key={b.value} value={b.value}>{b.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>
          <Pill className="w-4 h-4" style={{ color: '#0D9488' }} /> Drugs on the monthly stock return
        </h3>
        <p className="text-xs mb-4" style={{ color: '#94A3B8' }}>
          Purchases and usage are counted from the pharmacy automatically. The one thing it cannot
          know is what was already on the shelf the day you started — and every month afterwards
          walks forward from that figure, so a wrong opening stays wrong.
        </p>

        <div className="grid gap-1.5 mb-4">
          {tracked.length === 0 && (
            <p className="text-xs" style={{ color: '#94A3B8' }}>
              Nothing tracked yet. The Tamil Nadu return names Combokit, Mefiprostal and
              Misoprostal — add whichever your pharmacy actually stocks.
            </p>
          )}
          {tracked.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-3 py-2 rounded-lg"
              style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <span className="text-xs font-semibold flex-1" style={{ color: '#0F172A' }}>{d.report_label}</span>
              <span className="text-xs" style={{ color: '#64748B' }}>
                opening {d.opening_qty} from {d.opening_as_of}
              </span>
              <button
                onClick={() => startTransition(async () => {
                  await removeTrackedDrug(d.id)
                  setTracked((t) => t.filter((x) => x.id !== d.id))
                })}
                className="p-1 rounded" style={{ color: '#94A3B8', cursor: 'pointer' }} aria-label="Remove">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="p-3 rounded-lg" style={{ background: '#F0FDFA', border: '1px solid #99F6E4' }}>
          <Input value={q} onChange={(e) => search(e.target.value)}
            placeholder="Search the drug catalogue — e.g. mifepristone" />
          {hits.length > 0 && !picked && (
            <div className="mt-2 grid gap-1 max-h-40 overflow-y-auto">
              {hits.map((h) => (
                <button key={h.id} onClick={() => { setPicked(h); setLabel(h.name); setHits([]) }}
                  className="text-left px-2.5 py-1.5 rounded text-xs"
                  style={{ background: '#fff', border: '1px solid #E2E8F0', cursor: 'pointer', color: '#0F172A' }}>
                  {h.name}
                </button>
              ))}
            </div>
          )}
          {picked && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Input value={label} onChange={(e) => setLabel(e.target.value)}
                placeholder="Name on the report" />
              <Input type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)}
                placeholder="Opening stock" />
              <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </div>
          )}
          {picked && (
            <>
              <p className="text-xs mt-1.5" style={{ color: '#0F766E' }}>
                The district form names brands rather than molecules, so call it whatever the
                form expects — &ldquo;Tab. Combokit&rdquo; rather than the catalogue name.
              </p>
              <button onClick={addDrug} disabled={isPending || !asOf}
                className="mt-2 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: '#0D9488', color: '#fff', border: 'none',
                         cursor: asOf ? 'pointer' : 'not-allowed', opacity: asOf ? 1 : 0.5 }}>
                <Plus className="w-3 h-3" /> Add to the return
              </button>
            </>
          )}
        </div>
      </GlassCard>
    </div>
  )
}
