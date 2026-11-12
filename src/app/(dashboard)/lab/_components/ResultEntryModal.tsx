'use client'

import { useState, useEffect, useCallback } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { enterResults, getOrderAnalyteForm, saveAnalyteResults } from '@/app/actions/lab'
import { checkPlausible, type Plausibility } from '@/lib/labPlausible'
import type { LabOrder, LabFlag, AnalyteFormRow, AnalyteFlag } from '@/lib/types'

const FLAG_COLORS: Record<string, { bg: string; color: string }> = {
  pending:       { bg: '#F1F5F9', color: '#64748B' },
  unranged:      { bg: '#F1F5F9', color: '#64748B' },
  normal:        { bg: '#DCFCE7', color: '#15803D' },
  high:          { bg: '#FEE2E2', color: '#DC2626' },
  low:           { bg: '#DBEAFE', color: '#1D4ED8' },
  abnormal:      { bg: '#FEF3C7', color: '#B45309' },
  critical_high: { bg: '#FEE2E2', color: '#991B1B' },
  critical_low:  { bg: '#DBEAFE', color: '#1E3A8A' },
}
const FLAG_LABEL: Record<string, string> = {
  pending: '—', unranged: '—', normal: 'NORMAL', high: 'HIGH', low: 'LOW',
  abnormal: 'ABNORMAL', critical_high: 'CRITICAL HIGH', critical_low: 'CRITICAL LOW',
}

/**
 * What the flag will be, shown as the technician types.
 *
 * Deliberately reads the range already snapshotted onto the row by the server,
 * so the preview and the stored verdict cannot disagree about the numbers. The
 * rule below mirrors save_lab_analyte_results; the database remains the
 * authority and its answer replaces this the moment the panel is saved.
 */
function previewFlag(row: AnalyteFormRow, raw: string): AnalyteFlag {
  if (!raw) return 'pending'
  if (row.value_type === 'text') return 'unranged'
  if (row.value_type === 'ordinal') {
    // Normality on an ordered scale is membership, not position. The server
    // holds normal_values; here the first option is the normal one on every
    // scale we ship (Negative, or Normal for urobilinogen, or Absent).
    return raw === (row.allowed_values?.[0] ?? '') ? 'normal' : 'abnormal'
  }
  const v = parseFloat(raw)
  if (Number.isNaN(v)) return 'pending'
  if (row.crit_high != null && v >= row.crit_high) return 'critical_high'
  if (row.crit_low != null && v <= row.crit_low) return 'critical_low'
  if (row.ref_high != null && v > row.ref_high) return 'high'
  if (row.ref_low != null && v < row.ref_low) return 'low'
  if (row.ref_low != null || row.ref_high != null) return 'normal'
  return 'unranged'
}

function rangeLabel(row: AnalyteFormRow): string {
  if (row.value_type === 'ordinal') return row.allowed_values?.[0] ?? ''
  if (row.ref_low != null && row.ref_high != null) return `${row.ref_low} – ${row.ref_high}`
  if (row.ref_high != null) return `< ${row.ref_high}`
  if (row.ref_low != null) return `> ${row.ref_low}`
  return ''
}

interface SingleState { result_value: string; result_text: string; unit: string }

interface Props {
  open: boolean
  order: LabOrder
  onClose: () => void
  onSuccess: () => void
}

export default function ResultEntryModal({ open, order, onClose, onSuccess }: Props) {
  const [rows, setRows] = useState<AnalyteFormRow[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Tests with no analytes behind them keep the single value / text / unit they
  // have always had, so a hospital's own local panel is untouched by all this.
  const [singles, setSingles] = useState<Record<string, SingleState>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const form = await getOrderAnalyteForm(order.id)
    setRows(form)
    setValues(Object.fromEntries(form.map((r) => [
      `${r.test_id}|${r.analyte_id}`,
      r.value_text ?? (r.value_num != null ? String(r.value_num) : ''),
    ])))
    const withAnalytes = new Set(form.map((r) => r.test_id))
    setSingles(Object.fromEntries((order.items ?? [])
      .filter((i) => !withAnalytes.has(i.test_id))
      .map((i) => [i.id, {
        result_value: i.result_value != null ? String(i.result_value) : '',
        result_text: i.result_text ?? '',
        unit: i.unit ?? i.test?.unit ?? '',
      }])))
    setLoading(false)
  }, [order])

  useEffect(() => { if (open) load() }, [open, load])

  // An "unusual" value (far past the range) needs a second Save to confirm.
  const [confirmUnusual, setConfirmUnusual] = useState<string | null>(null)

  function plausibilityProblems() {
    const out: Array<NonNullable<Plausibility>> = []
    for (const r of rows) {
      const raw = values[`${r.test_id}|${r.analyte_id}`] ?? ''
      if (r.value_type !== 'numeric' || raw === '') continue
      const p = checkPlausible({ code: r.code, name: r.short_name || r.name, unit: r.unit_ucum, value: parseFloat(raw), refHigh: r.ref_high })
      if (p) out.push(p)
    }
    for (const item of order.items ?? []) {
      const r = singles[item.id]
      if (!r || r.result_value === '') continue
      const p = checkPlausible({ code: item.test?.code, name: item.test?.name ?? 'Result', unit: r.unit || item.test?.unit, value: parseFloat(r.result_value), refHigh: item.test?.ref_high })
      if (p) out.push(p)
    }
    return out
  }

  async function handleSave() {
    const problems = plausibilityProblems()
    const impossible = problems.filter((p) => p.level === 'impossible')
    if (impossible.length) { setError(impossible.map((p) => p.message).join('. ')); setConfirmUnusual(null); return }
    const unusualKey = problems.map((p) => p.message).join('. ')
    if (unusualKey && confirmUnusual !== unusualKey) {
      setError(`${unusualKey}. Check it, then press Save again to keep it.`); setConfirmUnusual(unusualKey); return
    }
    setSaving(true); setError(null)

    if (rows.length) {
      const items = rows.map((r) => {
        const raw = values[`${r.test_id}|${r.analyte_id}`] ?? ''
        const numeric = r.value_type === 'numeric'
        return {
          test_id: r.test_id,
          analyte_id: r.analyte_id,
          value_num: numeric && raw !== '' ? parseFloat(raw) : null,
          value_text: !numeric && raw !== '' ? raw : null,
        }
      }).filter((i) => i.value_num != null || i.value_text != null)

      if (items.length) {
        const res = await saveAnalyteResults(order.id, items)
        if (!res.success) { setSaving(false); setError(res.error); return }
      }
    }

    const singleItems = Object.entries(singles).map(([item_id, r]) => ({
      item_id,
      result_value: r.result_value !== '' ? parseFloat(r.result_value) : null,
      result_text: r.result_text || null,
      unit: r.unit || null,
    }))
    if (singleItems.length) {
      const res = await enterResults(order.id, singleItems)
      if (!res.success) { setSaving(false); setError(res.error); return }
    }

    setSaving(false)
    onSuccess()
  }

  // Panels, in the order the report prints them.
  const byTest = new Map<string, AnalyteFormRow[]>()
  for (const r of rows) byTest.set(r.test_id, [...(byTest.get(r.test_id) ?? []), r])

  return (
    <Modal open={open} onClose={onClose} title={`Enter Results — ${order.patient?.full_name}`} maxWidth="52rem">
      {loading ? (
        <p className="text-sm py-8 text-center" style={{ color: '#94A3B8' }}>Loading…</p>
      ) : (
        <div className="space-y-4">
          {[...byTest.entries()].map(([testId, analytes]) => (
            <div key={testId} className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
              <div className="px-4 py-2.5" style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{analytes[0].test_name}</p>
                <p className="text-xs" style={{ color: '#94A3B8' }}>{analytes.length} measurements</p>
              </div>
              <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
                {analytes.map((r) => {
                  const key = `${r.test_id}|${r.analyte_id}`
                  const raw = values[key] ?? ''
                  const flag = previewFlag(r, raw)
                  const fc = FLAG_COLORS[flag] ?? FLAG_COLORS.pending
                  const ref = rangeLabel(r)
                  return (
                    <div key={key} className="grid items-center gap-3 px-4 py-2"
                      style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) auto' }}>
                      <div className="min-w-0">
                        <p className="text-sm truncate" style={{ color: '#0F172A' }}>{r.short_name ?? r.name}</p>
                        {r.unit_ucum && <p className="text-xs" style={{ color: '#94A3B8' }}>{r.unit_ucum}</p>}
                      </div>

                      {r.value_type === 'ordinal' ? (
                        <Select value={raw} onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}>
                          <option value="">—</option>
                          {(r.allowed_values ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                        </Select>
                      ) : r.value_type === 'text' ? (
                        <Input value={raw} placeholder="e.g. 2-3, Occasional"
                          onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))} />
                      ) : (
                        <Input type="number" step="any" value={raw} inputMode="decimal"
                          onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))} />
                      )}

                      <span className="text-xs tabular-nums" style={{ color: '#94A3B8' }}>
                        {ref ? (r.value_type === 'ordinal' ? `Normal: ${ref}` : ref)
                             : <span title="No reference range is set for this analyte. Your laboratory should set one before relying on the flag.">not set</span>}
                      </span>

                      <span className="text-xs px-2 py-0.5 rounded-lg font-semibold whitespace-nowrap"
                        style={{ background: fc.bg, color: fc.color, minWidth: 70, textAlign: 'center' }}>
                        {FLAG_LABEL[flag] ?? '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {(order.items ?? []).filter((i) => !byTest.has(i.test_id)).map((item) => {
            const r = singles[item.id] ?? { result_value: '', result_text: '', unit: '' }
            const set = (f: keyof SingleState, v: string) =>
              setSingles((prev) => ({ ...prev, [item.id]: { ...prev[item.id], [f]: v } }))
            return (
              <div key={item.id} className="rounded-xl p-4" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
                <p className="font-semibold text-sm mb-3" style={{ color: '#0F172A' }}>
                  {item.test?.name ?? 'Unknown test'}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <FormField label="Numeric Value">
                    <Input type="number" step="any" value={r.result_value}
                      onChange={(e) => set('result_value', e.target.value)} placeholder="e.g. 95.5" />
                  </FormField>
                  <FormField label="Unit">
                    <Input value={r.unit} onChange={(e) => set('unit', e.target.value)}
                      placeholder={item.test?.unit ?? ''} />
                  </FormField>
                  <FormField label="Text Result">
                    <Input value={r.result_text} onChange={(e) => set('result_text', e.target.value)}
                      placeholder="e.g. Negative, Reactive" />
                  </FormField>
                </div>
              </div>
            )
          })}

          {error && (
            <div className="text-sm rounded-xl px-3 py-2"
              style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>
          )}

          <div className="flex gap-3 justify-end pt-1">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 rounded-xl text-sm font-semibold"
              style={{ background: saving ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving…' : 'Save Results'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
