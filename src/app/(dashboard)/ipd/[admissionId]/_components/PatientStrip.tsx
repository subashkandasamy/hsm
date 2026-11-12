'use client'

import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { getPatientStrip, savePatientStrip, type PatientStripData } from '@/app/actions/round'
import { computeNews, latestCompleteNews, NEWS_BAND_STYLE } from '@/lib/earlyWarning'
import { DIETS, DVT_OPTIONS, bmi, labelOf, onOxygen } from '@/lib/round'
import type { Admission, IcuObservation } from '@/lib/types'

const CODE_LABEL: Record<string, string> = { full: 'Full code', dnr: 'DNR', dni: 'DNI', comfort: 'Comfort care' }

function ago(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`
}
/** Calendar day of the stay, the admission day being day 1. */
function dayOf(since: string): number {
  const d0 = new Date(since); d0.setHours(0, 0, 0, 0)
  const d1 = new Date(); d1.setHours(0, 0, 0, 0)
  return Math.round((d1.getTime() - d0.getTime()) / 86_400_000) + 1
}

function Chip({ children, tone = 'plain', title }: { children: React.ReactNode; tone?: 'plain' | 'red' | 'amber' | 'teal'; title?: string }) {
  const t = {
    plain: { background: '#F1F5F9', color: '#334155', border: '#E2E8F0' },
    red:   { background: '#FEE2E2', color: '#B91C1C', border: '#FECACA' },
    amber: { background: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
    teal:  { background: 'rgba(13,148,136,0.08)', color: '#0F766E', border: 'rgba(13,148,136,0.2)' },
  }[tone]
  return (
    <span title={title} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium whitespace-nowrap"
      style={{ background: t.background, color: t.color, border: `1px solid ${t.border}` }}>{children}</span>
  )
}

/**
 * The strip above every tab: what a doctor or nurse must see before touching
 * the patient — allergy, how sick (NEWS2), ventilation and code status, the day
 * of stay and of ICU, weight, diet and DVT prophylaxis, and who is looking after
 * them. Reloads when a round is saved (refreshKey).
 */
export default function PatientStrip({ admission: adm, canEdit, refreshKey = 0, onSaved }: {
  admission: Admission
  canEdit: boolean
  refreshKey?: number
  onSaved: (patch: Partial<Admission>) => void
}) {
  const [data, setData] = useState<PatientStripData | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let alive = true
    getPatientStrip(adm.id).then((d) => { if (alive) setData(d) })
    return () => { alive = false }
  }, [adm.id, refreshKey])

  const allergyText = data?.allergies.length ? data.allergies.join(', ') : adm.patient?.allergies?.trim() || null
  const scoreOf = (x: IcuObservation) => computeNews({
    rr: x.rr, spo2: x.spo2, sbp: x.sbp, hr: x.hr, temp: x.temp, gcs_total: x.gcs_total, avpu: x.avpu,
    gcs_e: x.gcs_e, gcs_m: x.gcs_m, on_oxygen: onOxygen(x, !!adm.on_ventilator),
  })
  // The newest complete set is the score; a newer partial one is only noted.
  const full = latestCompleteNews(data?.recent ?? [], scoreOf)
  const newest = data?.latest ?? null
  const o = full?.row ?? newest
  const news = full?.news ?? (newest ? scoreOf(newest) : null)
  const partialNewer = !!newest && (!full || full.row.id !== newest.id)
  const b = bmi(adm.weight_kg, adm.height_cm)
  const open = adm.status === 'admitted'

  return (
    <div className="rounded-xl px-3 py-2.5 mb-4 flex flex-wrap items-center gap-2"
      style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid #E2E8F0', position: 'sticky', top: '0.5rem', zIndex: 20 }}>
      {allergyText
        ? <Chip tone="red" title="Allergies">Allergy: {allergyText}</Chip>
        : <Chip tone="amber">Allergy not recorded</Chip>}
      {news && news.params > 0 ? (
        <span title={`Early-warning score from the round ${o ? ago(o.recorded_at) : ''}`}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold whitespace-nowrap"
          style={{ background: NEWS_BAND_STYLE[news.band].bg, color: NEWS_BAND_STYLE[news.band].color }}>
          NEWS2 {news.score}{news.complete ? '' : ' (incomplete)'} · {o ? ago(o.recorded_at) : ''}
          {partialNewer && full && <span style={{ fontWeight: 400 }}> · newer reading incomplete</span>}
        </span>
      ) : <Chip>No round yet</Chip>}
      {adm.on_ventilator && <Chip tone="red">Ventilated</Chip>}
      {adm.code_status && adm.code_status !== 'full' && <Chip tone="red">{CODE_LABEL[adm.code_status] ?? adm.code_status}</Chip>}
      {adm.isolation && adm.isolation !== 'none' && <Chip tone="amber">{adm.isolation} isolation</Chip>}
      {open && <Chip tone="teal">Day {dayOf(adm.admitted_at)}{data?.icuSince ? ` · ICU day ${dayOf(data.icuSince)}` : ''}</Chip>}
      <Chip title="Weight / height / BMI">
        {adm.weight_kg ? `${adm.weight_kg} kg` : 'Weight —'}{adm.height_cm ? ` · ${adm.height_cm} cm` : ''}{b ? ` · BMI ${b}` : ''}
      </Chip>
      <Chip title="Diet">
        Diet: {labelOf(DIETS, adm.diet) ?? '—'}{adm.diet_kcal ? ` · ${adm.diet_kcal} kcal` : ''}{adm.diet_protein_g ? ` · ${adm.diet_protein_g} g protein` : ''}
      </Chip>
      <Chip title="DVT prophylaxis" tone={adm.dvt_prophylaxis ? 'plain' : 'amber'}>DVT: {labelOf(DVT_OPTIONS, adm.dvt_prophylaxis) ?? 'not set'}</Chip>
      {data?.consultants.length ? <Chip title="Care team">{data.consultants.join(', ')}</Chip> : null}
      {canEdit && open && (
        <button onClick={() => setEditing(true)} className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium"
          style={{ background: 'none', border: '1px solid #E2E8F0', color: '#475569', cursor: 'pointer' }}>
          <Pencil className="w-3 h-3" /> Edit
        </button>
      )}
      {editing && <StripEditor admission={adm} onClose={() => setEditing(false)} onSaved={(p) => { onSaved(p); setEditing(false) }} />}
    </div>
  )
}

function StripEditor({ admission: adm, onClose, onSaved }: { admission: Admission; onClose: () => void; onSaved: (p: Partial<Admission>) => void }) {
  const [f, setF] = useState({
    weight_kg: adm.weight_kg != null ? String(adm.weight_kg) : '', height_cm: adm.height_cm != null ? String(adm.height_cm) : '',
    diet: adm.diet ?? '', diet_kcal: adm.diet_kcal != null ? String(adm.diet_kcal) : '',
    diet_protein_g: adm.diet_protein_g != null ? String(adm.diet_protein_g) : '', dvt_prophylaxis: adm.dvt_prophylaxis ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const n = (v: string, int = false) => (v.trim() === '' ? null : int ? parseInt(v, 10) : Number(v))

  async function save() {
    const patch = {
      weight_kg: n(f.weight_kg), height_cm: n(f.height_cm), diet: (f.diet || null) as Admission['diet'],
      diet_kcal: n(f.diet_kcal, true), diet_protein_g: n(f.diet_protein_g, true), dvt_prophylaxis: (f.dvt_prophylaxis || null) as Admission['dvt_prophylaxis'],
    }
    if (Object.values(patch).some((v) => typeof v === 'number' && Number.isNaN(v))) { setError('Enter numbers only'); return }
    setSaving(true); setError(null)
    const r = await savePatientStrip(adm.id, patch)
    setSaving(false)
    if (!r.success) { setError(r.error); return }
    onSaved(patch)
  }

  return (
    <Modal open onClose={onClose} title="Patient details" maxWidth="30rem">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Weight (kg)"><Input inputMode="decimal" value={f.weight_kg} onChange={(e) => setF({ ...f, weight_kg: e.target.value })} /></FormField>
          <FormField label="Height (cm)"><Input inputMode="decimal" value={f.height_cm} onChange={(e) => setF({ ...f, height_cm: e.target.value })} /></FormField>
        </div>
        <FormField label="Diet">
          <Select value={f.diet} onChange={(e) => setF({ ...f, diet: e.target.value })}>
            <option value="">—</option>
            {DIETS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Calories (kcal / day)"><Input inputMode="numeric" value={f.diet_kcal} onChange={(e) => setF({ ...f, diet_kcal: e.target.value })} /></FormField>
          <FormField label="Protein (g / day)"><Input inputMode="numeric" value={f.diet_protein_g} onChange={(e) => setF({ ...f, diet_protein_g: e.target.value })} /></FormField>
        </div>
        <FormField label="DVT prophylaxis">
          <Select value={f.dvt_prophylaxis} onChange={(e) => setF({ ...f, dvt_prophylaxis: e.target.value })}>
            <option value="">—</option>
            {DVT_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
        </FormField>
        {error && <p className="text-sm" style={{ color: '#DC2626' }}>{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
