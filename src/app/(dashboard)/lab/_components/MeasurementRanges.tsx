'use client'

/**
 * Lab → Catalog → a test → its measurements: the normal range each one is
 * judged against, where that range came from, and the hospital's own.
 * See src/app/actions/labRanges.ts.
 */

import { useEffect, useState } from 'react'
import {
  getMeasurementRanges, saveMeasurementRange, saveMeasurementNormalText, resetMeasurementRange,
  type MeasurementRanges, type RangeRow,
} from '@/app/actions/labRanges'
import { setMeasurementOptional } from '@/app/actions/lab'

const INK = '#0F172A'
const MUTED = '#64748B'
const FAINT = '#94A3B8'
const LINE = '#E2E8F0'
const ACCENT = '#0D9488'

function bounds(lo: number | null, hi: number | null): string {
  if (lo != null && hi != null) return `${lo}–${hi}`
  if (hi != null) return `< ${hi}`
  if (lo != null) return `> ${lo}`
  return '—'
}

/** "Men 4.5–5.5 · Women 3.8–4.8 (18+)" — the adult rows, which are what a report uses for most patients. */
function summary(rows: RangeRow[]): string {
  const adults = rows.filter((r) => r.age_max_days >= 6570)
  const pick = adults.length ? adults : rows
  const any = pick.find((r) => r.sex === 'any')
  const men = pick.find((r) => r.sex === 'male')
  const women = pick.find((r) => r.sex === 'female')
  const age = pick.every((r) => r.age_min_days >= 6570) ? ' (18+)' : ''
  if (men || women) return `Men ${men ? bounds(men.ref_low, men.ref_high) : '—'} · Women ${women ? bounds(women.ref_low, women.ref_high) : '—'}${age}`
  return any ? `${bounds(any.ref_low, any.ref_high)}${age}` : '—'
}

/** The written normal, e.g. "Pale yellow" — the hospital's own first. */
function writtenNormal(rows: RangeRow[]): string | null {
  return rows.find((r) => r.normal_text)?.normal_text ?? null
}

/**
 * The hospital's rows are a kept copy of Uyirly's standard ("Use Uyirly
 * standard" on a measurement its analyzer sends keeps one, so the analyzer
 * cannot quietly replace it). Shown as the standard, because it is.
 */
function sameAsStandard(mine: RangeRow[], standard: RangeRow[]): boolean {
  if (!mine.length || mine.length !== standard.length) return false
  const key = (r: RangeRow) => [r.sex, r.age_min_days, r.age_max_days, r.ref_low, r.ref_high, r.normal_text ?? ''].join('|')
  const std = new Set(standard.map(key))
  return mine.every((r) => std.has(key(r)))
}

export default function MeasurementRangesTable({ testId }: { testId: string }) {
  const [rows, setRows] = useState<MeasurementRanges[] | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  async function reload() { setRows(await getMeasurementRanges(testId)) }
  useEffect(() => {
    let alive = true
    getMeasurementRanges(testId)
      .then((r) => { if (alive) setRows(r) })
      .catch(() => { if (alive) setErr('Could not load the measurements — refresh the page') })
    return () => { alive = false }
  }, [testId])

  async function toggleOptional(m: MeasurementRanges) {
    setBusy(m.analyte_id); setErr('')
    const r = await setMeasurementOptional(testId, m.analyte_id, !m.optional)
    setBusy(null)
    if (!r.success) { setErr(r.error); return }
    setRows((prev) => (prev ?? []).map((x) => x.analyte_id === m.analyte_id ? { ...x, optional: !m.optional } : x))
  }

  async function revertToStandard(m: MeasurementRanges) {
    setBusy(m.analyte_id); setErr('')
    const r = await resetMeasurementRange(m.analyte_id)
    setBusy(null)
    if (!r.success) { setErr(r.error); return }
    await reload()
  }

  if (!rows) return <p className="text-xs py-2" style={{ color: FAINT }}>{err || 'Loading…'}</p>
  if (!rows.length) return <p className="text-xs py-2" style={{ color: FAINT }}>This test has no measurement lines.</p>

  return (
    <div>
      <p className="text-xs mb-2" style={{ color: MUTED }}>
        Each measurement is judged against the normal shown, and the report prints it beside the result. Your
        hospital&apos;s own comes first, then one your analyzer sends, then Uyirly&apos;s standard. What you set here
        applies wherever that measurement appears. Written results (colour, pus cells) are printed with their normal
        but not flagged automatically. Mark a measurement <strong>optional</strong> when your analyzer cannot produce
        it — left blank, it is not printed and does not hold up the report.
      </p>
      {err && <p className="text-xs mb-2" style={{ color: '#B91C1C' }}>{err}</p>}
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${LINE}`, background: '#fff' }}>
        {rows.map((m) => {
          const fromAnalyzer = m.mine.length > 0 && m.mine.every((r) => r.source === 'analyzer')
          const standardCopy = sameAsStandard(m.mine, m.standard)
          const own = m.mine.length > 0 && !standardCopy
          const whose = own ? (fromAnalyzer ? 'From your analyzer' : 'Your hospital') : (m.mine.length || m.standard.length) ? 'Uyirly standard' : null
          const shown = m.mine.length ? summary(m.mine) : m.standard.length ? summary(m.standard) : null
          const numeric = m.value_type === 'numeric'
          const written = m.value_type === 'text'
          const writtenShown = writtenNormal(m.mine) ?? writtenNormal(m.standard)
          const editable = numeric || written
          return (
            <div key={m.analyte_id} style={{ borderBottom: '1px solid #F1F5F9' }}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="text-sm flex-1 min-w-[9rem]" style={{ color: m.optional ? FAINT : INK }}>
                  {m.name}
                  {m.short && m.short !== m.name && <span className="text-xs" style={{ color: MUTED }}> ({m.short})</span>}
                  {m.unit && <span className="text-xs" style={{ color: FAINT }}> {m.unit}</span>}
                </span>
                <span className="text-xs min-w-[10rem]" style={{ color: INK }}>
                  {numeric
                    ? (shown ?? <span style={{ color: '#B45309' }}>No range — set one</span>)
                    : written
                      ? (writtenShown ? `Normal: ${writtenShown}` : <span style={{ color: FAINT }}>Written result — no normal set</span>)
                      : m.normal_values?.length ? `Normal: ${m.normal_values.join(' / ')}` : <span style={{ color: FAINT }}>Graded result</span>}
                  {whose && editable && (numeric ? shown : writtenShown) && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                      style={own ? { background: '#F0FDFA', color: '#0F766E' } : { background: '#F1F5F9', color: MUTED }}>
                      {whose}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5">
                  {editable && (
                    <button type="button" onClick={() => setEditing(editing === m.analyte_id ? null : m.analyte_id)}
                      className="px-2 py-1 rounded-lg text-xs font-semibold"
                      style={{ background: '#F0FDFA', color: ACCENT, border: '1px solid #99F6E4', cursor: 'pointer' }}>
                      {editing === m.analyte_id ? 'Close' : numeric ? 'Edit range' : 'Edit normal'}
                    </button>
                  )}
                  {own && (
                    <button type="button" onClick={() => revertToStandard(m)} disabled={busy === m.analyte_id}
                      title={m.standard.length ? `Uyirly standard: ${written ? writtenNormal(m.standard) : summary(m.standard)}` : 'Uyirly has no standard for this one'}
                      className="px-2 py-1 rounded-lg text-xs"
                      style={{ background: '#fff', color: MUTED, border: `1px solid ${LINE}`, cursor: 'pointer' }}>
                      Use Uyirly standard
                    </button>
                  )}
                  <button type="button" onClick={() => toggleOptional(m)} disabled={busy === m.analyte_id}
                    title={m.optional ? 'Optional — tap to make it required' : 'Required — tap to make it optional'}
                    className="px-2 py-1 rounded-lg text-xs"
                    style={m.optional
                      ? { background: '#F8FAFC', color: FAINT, border: '1px dashed #CBD5E1', cursor: 'pointer' }
                      : { background: '#fff', color: MUTED, border: `1px solid ${LINE}`, cursor: 'pointer' }}>
                    {m.optional ? 'Optional' : 'Required'}
                  </button>
                </span>
              </div>
              {editing === m.analyte_id && (numeric
                ? <RangeEditor m={m} onDone={async () => { setEditing(null); await reload() }} />
                : <NormalTextEditor m={m} onDone={async () => { setEditing(null); await reload() }} />)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RangeEditor({ m, onDone }: { m: MeasurementRanges; onDone: () => void }) {
  const start = m.mine.length ? m.mine : m.standard
  const adult = start.filter((r) => r.age_max_days >= 6570)
  const pick = (sex: RangeRow['sex']) => adult.find((r) => r.sex === sex)
  const [bySex, setBySex] = useState(!!(pick('male') || pick('female')))
  const val = (n: number | null | undefined) => (n == null ? '' : String(n))
  const [f, setF] = useState({
    anyLo: val(pick('any')?.ref_low), anyHi: val(pick('any')?.ref_high),
    menLo: val(pick('male')?.ref_low), menHi: val(pick('male')?.ref_high),
    womenLo: val(pick('female')?.ref_low), womenHi: val(pick('female')?.ref_high),
  })
  const [allAges, setAllAges] = useState(m.mine.some((r) => r.age_min_days === 0))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const num = (s: string) => (s.trim() === '' ? null : Number(s))

  async function save() {
    setSaving(true); setErr('')
    const r = await saveMeasurementRange(m.analyte_id, {
      bySex, allAges,
      everyone: { low: num(f.anyLo), high: num(f.anyHi) },
      men: { low: num(f.menLo), high: num(f.menHi) },
      women: { low: num(f.womenLo), high: num(f.womenHi) },
    })
    setSaving(false)
    if (!r.success) { setErr(r.error); return }
    onDone()
  }

  const box = 'w-24 px-2 py-1.5 rounded-lg text-sm border text-right'
  const bdr = { borderColor: LINE, color: INK, background: '#fff' }
  const pair = (label: string, lo: keyof typeof f, hi: keyof typeof f) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs w-20" style={{ color: MUTED }}>{label}</span>
      <input inputMode="decimal" aria-label={`${label} lower limit`} placeholder="low" value={f[lo]}
        onChange={(e) => setF({ ...f, [lo]: e.target.value })} className={box} style={bdr} />
      <span style={{ color: FAINT }}>to</span>
      <input inputMode="decimal" aria-label={`${label} upper limit`} placeholder="high" value={f[hi]}
        onChange={(e) => setF({ ...f, [hi]: e.target.value })} className={box} style={bdr} />
      {m.unit && <span className="text-xs" style={{ color: FAINT }}>{m.unit}</span>}
    </div>
  )

  return (
    <div className="px-3 pb-3 pt-1 space-y-2" style={{ background: '#F8FAFC' }}>
      <div className="flex flex-wrap gap-3 text-xs" style={{ color: INK }}>
        <label className="flex items-center gap-1.5"><input type="radio" checked={!bySex} onChange={() => setBySex(false)} /> Same for everyone</label>
        <label className="flex items-center gap-1.5"><input type="radio" checked={bySex} onChange={() => setBySex(true)} /> Different for men and women</label>
      </div>
      {bySex ? (<>{pair('Men', 'menLo', 'menHi')}{pair('Women', 'womenLo', 'womenHi')}</>) : pair('Everyone', 'anyLo', 'anyHi')}
      <label className="flex items-center gap-1.5 text-xs" style={{ color: MUTED }}>
        <input type="checkbox" checked={allAges} onChange={(e) => setAllAges(e.target.checked)} />
        Use for children too (otherwise adults, 18 and over — like Uyirly&apos;s standard)
      </label>
      <p className="text-xs" style={{ color: FAINT }}>
        Leave a box empty for a one-sided range, e.g. only an upper limit.
        {m.standard.length > 0 && <> Uyirly standard: {summary(m.standard)}.</>}
        {' '}If your analyzer sends its own ranges, saving here replaces what it taught.
      </p>
      {err && <p className="text-xs" style={{ color: '#B91C1C' }}>{err}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={saving}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: saving ? FAINT : ACCENT, color: '#fff', border: 'none', cursor: saving ? 'wait' : 'pointer' }}>
          {saving ? 'Saving…' : 'Save range'}
        </button>
      </div>
    </div>
  )
}

function NormalTextEditor({ m, onDone }: { m: MeasurementRanges; onDone: () => void }) {
  const [text, setText] = useState(writtenNormal(m.mine) ?? writtenNormal(m.standard) ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    setSaving(true); setErr('')
    const r = await saveMeasurementNormalText(m.analyte_id, text)
    setSaving(false)
    if (!r.success) { setErr(r.error); return }
    onDone()
  }

  const std = writtenNormal(m.standard)
  return (
    <div className="px-3 pb-3 pt-1 space-y-2" style={{ background: '#F8FAFC' }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs w-20" style={{ color: MUTED }}>Normal</span>
        <input aria-label={`${m.name} normal`} value={text} maxLength={80}
          onChange={(e) => setText(e.target.value)} placeholder="e.g. Pale yellow, 0–5, Nil"
          className="w-56 px-2 py-1.5 rounded-lg text-sm border" style={{ borderColor: LINE, color: INK, background: '#fff' }} />
        {m.unit && <span className="text-xs" style={{ color: FAINT }}>{m.unit}</span>}
      </div>
      <p className="text-xs" style={{ color: FAINT }}>
        Printed in the report&apos;s normal column, exactly as typed.
        {std && <> Uyirly standard: {std}.</>}
      </p>
      {err && <p className="text-xs" style={{ color: '#B91C1C' }}>{err}</p>}
      <button type="button" onClick={save} disabled={saving}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold"
        style={{ background: saving ? FAINT : ACCENT, color: '#fff', border: 'none', cursor: saving ? 'wait' : 'pointer' }}>
        {saving ? 'Saving…' : 'Save normal'}
      </button>
    </div>
  )
}
