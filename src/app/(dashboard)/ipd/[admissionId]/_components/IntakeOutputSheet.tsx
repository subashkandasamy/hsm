'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Droplets, Save } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { getIoSheet, recordFluidBalance } from '@/app/actions/icu'
import {
  INTAKE_CATEGORIES, OUTPUT_CATEGORIES, categoryLabel, hourLabel, sheetDayOf, sheetDayWindow, sheetGrid,
} from '@/lib/fluids'
import type { IcuFluidEntry } from '@/lib/types'

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function toLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('en-IN')}`

/**
 * KMCH's intake/output chart: the sheet day hour by hour (08:00 → 07:59),
 * 6 / 12 / 24-hour totals, the day's net and the running balance since
 * admission. Finished IV bags arrive here on their own (finishInfusionBag).
 */
export default function IntakeOutputSheet({ admissionId, canWrite }: { admissionId: string; canWrite: boolean }) {
  const [day, setDay] = useState(() => sheetDayOf(new Date()))
  const [today] = useState(() => sheetDayOf(new Date()))
  const [sheet, setSheet] = useState<{ entries: IcuFluidEntry[]; before: { intake: number; output: number } } | null>(null)
  const load = useCallback(() => { getIoSheet(admissionId, day).then(setSheet) }, [admissionId, day])
  useEffect(() => { load() }, [load])

  const g = sheetGrid((sheet?.entries ?? []) as Array<{ direction: 'intake' | 'output'; category: string; volume_ml: number; recorded_at: string }>, day)
  const rowsFor = (dir: 'intake' | 'output') => {
    const list = dir === 'intake' ? INTAKE_CATEGORIES : OUTPUT_CATEGORIES
    const extra = [...g.grid.keys()].filter((k) => k.startsWith(`${dir}:`)).map((k) => k.split(':')[1]).filter((c) => !list.some((x) => x.value === c))
    return [...list.map((x) => x.value as string), ...extra].filter((c) => g.grid.has(`${dir}:${c}`) || ['iv', 'oral', 'urine'].includes(c))
  }
  const net24 = g.intake.h24 - g.output.h24
  const cumulative = (sheet ? sheet.before.intake - sheet.before.output : 0) + net24
  const { start } = sheetDayWindow(day)
  const dayLabel = start.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })

  const cell = (v: number) => (v ? v.toLocaleString('en-IN') : '')
  const th = 'px-1.5 py-1.5 text-center font-semibold'
  const td = 'px-1.5 py-1 text-center tabular-nums'

  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-start gap-2">
          <Droplets className="w-4 h-4 mt-0.5" style={{ color: '#0D9488' }} />
          <div>
            <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Intake &amp; output</h2>
            <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>Day runs 08:00 → 07:59. Finished IV bags are added automatically.</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button aria-label="Previous day" onClick={() => setDay(addDays(day, -1))} className="p-1.5 rounded-lg" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', cursor: 'pointer' }}><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-medium px-2" style={{ color: '#0F172A' }}>{dayLabel}{day === today ? ' (today)' : ''}</span>
          <button aria-label="Next day" onClick={() => setDay(addDays(day, 1))} disabled={day >= today}
            className="p-1.5 rounded-lg" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', cursor: day >= today ? 'not-allowed' : 'pointer', opacity: day >= today ? 0.4 : 1 }}><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3 text-xs">
        {([['In 6 h', g.intake.h6], ['In 12 h', g.intake.h12], ['In 24 h', g.intake.h24], ['Out 24 h', g.output.h24]] as const).map(([l, v]) => (
          <span key={l} className="px-2 py-1 rounded-lg" style={{ background: '#F1F5F9', color: '#334155' }}>{l}: <b>{v.toLocaleString('en-IN')} ml</b></span>
        ))}
        <span className="px-2 py-1 rounded-lg font-semibold" style={{ background: net24 >= 0 ? 'rgba(13,148,136,0.08)' : '#FEF3C7', color: net24 >= 0 ? '#0F766E' : '#92400E' }}>Net 24 h: {signed(net24)} ml</span>
        <span className="px-2 py-1 rounded-lg font-semibold" style={{ background: '#F8FAFC', color: '#334155', border: '1px solid #E2E8F0' }}>Since admission: {signed(cumulative)} ml</span>
      </div>

      <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #E2E8F0' }}>
        <table className="text-[11px]" style={{ minWidth: '68rem', width: '100%' }}>
          <thead>
            <tr style={{ background: '#F8FAFC', color: '#475569' }}>
              <th className="px-2 py-1.5 text-left font-semibold sticky left-0" style={{ background: '#F8FAFC' }}>ml</th>
              {Array.from({ length: 24 }, (_, i) => <th key={i} className={th}>{hourLabel(i)}</th>)}
              <th className={th} style={{ background: '#EEF2F7' }}>6 h</th><th className={th} style={{ background: '#EEF2F7' }}>12 h</th><th className={th} style={{ background: '#EEF2F7' }}>24 h</th>
            </tr>
          </thead>
          <tbody>
            {(['intake', 'output'] as const).map((dir) => (
              <Fragment key={dir}>
                {rowsFor(dir).map((c) => {
                  const arr = g.grid.get(`${dir}:${c}`) ?? Array(24).fill(0)
                  return (
                    <tr key={`${dir}:${c}`} style={{ borderTop: '1px solid #F1F5F9' }}>
                      <td className="px-2 py-1 whitespace-nowrap sticky left-0" style={{ background: '#fff', color: '#334155' }}>{categoryLabel(dir, c)}</td>
                      {arr.map((v: number, i: number) => <td key={i} className={td}>{cell(v)}</td>)}
                      <td className={td} style={{ background: '#F8FAFC' }}>{cell(g.sum(arr, 6))}</td>
                      <td className={td} style={{ background: '#F8FAFC' }}>{cell(g.sum(arr, 12))}</td>
                      <td className={td} style={{ background: '#F8FAFC', fontWeight: 600 }}>{cell(g.sum(arr, 24))}</td>
                    </tr>
                  )
                })}
                <tr key={`${dir}-total`} style={{ borderTop: '1px solid #E2E8F0', background: dir === 'intake' ? 'rgba(13,148,136,0.05)' : 'rgba(180,83,9,0.05)' }}>
                  <td className="px-2 py-1 font-semibold whitespace-nowrap sticky left-0" style={{ background: dir === 'intake' ? '#F2FAF9' : '#FBF6F1', color: '#0F172A' }}>Total {dir}</td>
                  {g[dir].hourly.map((v: number, i: number) => <td key={i} className={td} style={{ fontWeight: 600 }}>{cell(v)}</td>)}
                  <td className={td} style={{ fontWeight: 700 }}>{cell(g[dir].h6)}</td>
                  <td className={td} style={{ fontWeight: 700 }}>{cell(g[dir].h12)}</td>
                  <td className={td} style={{ fontWeight: 700 }}>{cell(g[dir].h24)}</td>
                </tr>
              </Fragment>
            ))}
            <tr style={{ borderTop: '2px solid #E2E8F0' }}>
              <td className="px-2 py-1 font-semibold sticky left-0" style={{ background: '#fff', color: '#0F172A' }}>Net (in − out)</td>
              <td colSpan={24} />
              <td className={td} style={{ fontWeight: 700 }}>{signed(g.intake.h6 - g.output.h6)}</td>
              <td className={td} style={{ fontWeight: 700 }}>{signed(g.intake.h12 - g.output.h12)}</td>
              <td className={td} style={{ fontWeight: 700 }}>{signed(net24)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {canWrite && <FluidEntryForm admissionId={admissionId} onSaved={load} />}

      {sheet?.entries.length ? (
        <div className="mt-3 space-y-1">
          {sheet.entries.map((e) => (
            <p key={e.id} className="text-xs" style={{ color: '#475569' }}>
              <span className="tabular-nums">{new Date(e.recorded_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
              {' · '}{e.direction === 'intake' ? 'In' : 'Out'} — {categoryLabel(e.direction as 'intake' | 'output', e.category)}{e.site ? ` (${e.site})` : ''}: <b>{e.volume_ml} ml</b>
              {e.notes ? ` · ${e.notes}` : ''}{e.source_schedule_id ? ' · from IV bag' : ''}{e.recorder?.full_name ? ` · ${e.recorder.full_name}` : ''}
            </p>
          ))}
        </div>
      ) : <p className="text-xs mt-3" style={{ color: '#94A3B8' }}>Nothing charted on this day.</p>}
    </GlassCard>
  )
}

function FluidEntryForm({ admissionId, onSaved }: { admissionId: string; onSaved: () => void }) {
  const [dir, setDir] = useState<'intake' | 'output'>('output')
  const [cat, setCat] = useState('urine')
  const [site, setSite] = useState('')
  const [vol, setVol] = useState('')
  const [at, setAt] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const cats = dir === 'intake' ? INTAKE_CATEGORIES : OUTPUT_CATEGORIES

  async function save() {
    const v = Number(vol)
    if (vol.trim() === '' || !Number.isInteger(v) || v < 0) { setMsg({ ok: false, text: 'Enter the volume in whole ml' }); return }
    setSaving(true); setMsg(null)
    const r = await recordFluidBalance(admissionId, {
      direction: dir, category: cat, volume_ml: v, site: site.trim() || null, notes: notes.trim() || null,
      recorded_at: at ? new Date(at).toISOString() : null,
    })
    setSaving(false)
    if (!r.success) { setMsg({ ok: false, text: r.error }); return }
    setVol(''); setNotes(''); setAt(''); setMsg({ ok: true, text: 'Saved' })
    onSaved()
  }

  return (
    <div className="mt-3 rounded-xl p-3" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-6 items-end">
        <FormField label="In / out">
          <Select value={dir} onChange={(e) => { const d = e.target.value as 'intake' | 'output'; setDir(d); setCat(d === 'intake' ? 'oral' : 'urine') }}>
            <option value="intake">Intake</option><option value="output">Output</option>
          </Select>
        </FormField>
        <FormField label="What">
          <Select value={cat} onChange={(e) => setCat(e.target.value)}>
            {cats.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </FormField>
        <FormField label="ml"><Input inputMode="numeric" value={vol} onChange={(e) => setVol(e.target.value)} /></FormField>
        <FormField label="Site (drain / tube)"><Input value={site} placeholder="e.g. Right ICD" onChange={(e) => setSite(e.target.value)} /></FormField>
        <FormField label="Time (if earlier)"><Input type="datetime-local" value={at} max={toLocal(new Date())} onChange={(e) => setAt(e.target.value)} /></FormField>
        <button onClick={save} disabled={saving} className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: saving ? 'wait' : 'pointer' }}>
          <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Add'}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Input value={notes} placeholder="Note (optional) — e.g. stool loose ×2" onChange={(e) => setNotes(e.target.value)} />
        {msg && <span className="text-xs whitespace-nowrap" style={{ color: msg.ok ? '#15803D' : '#DC2626' }}>{msg.text}</span>}
      </div>
    </div>
  )
}
