'use client'

import { useState, useEffect, useCallback } from 'react'
import { HeartPulse, Plus, Activity } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import LivingChildrenCard from './LivingChildrenCard'
import Input from '@/components/ui/Input'
import DateText from '@/components/ui/DateText'
import {
  listAnc, createAnc, setAncStatus,
  listAncVisits, addAncVisit, listPartograph, addPartographObs,
} from '@/app/actions/obstetrics'
import type { AncRecord, AncVisit, PartographObs } from '@/lib/types'

function gaFrom(lmp: string | null, at?: string): string {
  if (!lmp) return '—'
  const days = Math.floor(((at ? new Date(at).getTime() : Date.now()) - new Date(lmp).getTime()) / 86400000)
  if (days < 0) return '—'
  return `${Math.floor(days / 7)}w ${days % 7}d`
}

const VISIT_FIELDS: [string, string, string][] = [
  ['weight_kg', 'Weight (kg)', 'number'], ['bp', 'BP', 'text'], ['fundal_height_cm', 'Fundal ht (cm)', 'number'],
  ['fetal_heart_rate', 'FHR', 'number'], ['hb', 'Hb', 'number'], ['urine_albumin', 'Urine alb', 'text'],
  ['urine_sugar', 'Urine sug', 'text'], ['fetal_movements', 'Fetal mvmt', 'text'],
]
const PARTO_FIELDS: [string, string, string][] = [
  ['cervix_cm', 'Cervix (cm)', 'number'], ['fetal_heart_rate', 'FHR', 'number'], ['contractions_per10', 'Contr/10min', 'number'],
  ['contraction_duration', 'Duration', 'text'], ['descent', 'Descent', 'text'], ['liquor', 'Liquor', 'text'],
  ['bp', 'BP', 'text'], ['pulse', 'Pulse', 'number'],
]

interface Props { patientId: string; canWrite: boolean }

export default function ObstetricsTab({ patientId, canWrite }: Props) {
  const [records, setRecords] = useState<AncRecord[]>([])
  const [visits, setVisits] = useState<AncVisit[]>([])
  const [parto, setParto] = useState<PartographObs[]>([])
  const [start, setStart] = useState<Record<string, string>>({})
  const [showStart, setShowStart] = useState(false)
  const [vForm, setVForm] = useState<Record<string, string>>({}); const [showV, setShowV] = useState(false)
  const [pForm, setPForm] = useState<Record<string, string>>({}); const [showP, setShowP] = useState(false)
  const [busy, setBusy] = useState(false)

  const active = records.find((r) => r.status === 'active')

  const load = useCallback(() => { listAnc(patientId).then(setRecords) }, [patientId])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (active) { listAncVisits(active.id).then(setVisits); listPartograph(active.id).then(setParto) }
    else { setVisits([]); setParto([]) }
  }, [active])

  const numOrNull = (v: string) => (v ? parseFloat(v) : null)
  const intOrNull = (v: string) => (v ? parseInt(v, 10) : null)

  async function startAnc() {
    setBusy(true)
    const res = await createAnc(patientId, {
      lmp: start.lmp || null, gravida: intOrNull(start.gravida ?? ''), para: intOrNull(start.para ?? ''),
      living: intOrNull(start.living ?? ''),
      abortions: intOrNull(start.abortions ?? ''), blood_group: start.blood_group || null,
      high_risk: start.high_risk === 'yes', high_risk_notes: start.high_risk_notes || null,
    })
    setBusy(false)
    if (res.success) { setStart({}); setShowStart(false); load() }
  }
  async function saveVisit() {
    if (!active) return
    setBusy(true)
    const res = await addAncVisit(active.id, {
      weight_kg: numOrNull(vForm.weight_kg ?? ''), bp: vForm.bp || null, fundal_height_cm: numOrNull(vForm.fundal_height_cm ?? ''),
      fetal_heart_rate: intOrNull(vForm.fetal_heart_rate ?? ''), hb: numOrNull(vForm.hb ?? ''),
      urine_albumin: vForm.urine_albumin || null, urine_sugar: vForm.urine_sugar || null, fetal_movements: vForm.fetal_movements || null,
      notes: vForm.notes || null,
    })
    setBusy(false)
    if (res.success && active) { setVForm({}); setShowV(false); listAncVisits(active.id).then(setVisits) }
  }
  async function saveParto() {
    if (!active) return
    setBusy(true)
    const res = await addPartographObs(active.id, {
      cervix_cm: intOrNull(pForm.cervix_cm ?? ''), fetal_heart_rate: intOrNull(pForm.fetal_heart_rate ?? ''),
      contractions_per10: intOrNull(pForm.contractions_per10 ?? ''), contraction_duration: pForm.contraction_duration || null,
      descent: pForm.descent || null, liquor: pForm.liquor || null, bp: pForm.bp || null, pulse: intOrNull(pForm.pulse ?? ''),
      notes: pForm.notes || null,
    })
    setBusy(false)
    if (res.success && active) { setPForm({}); setShowP(false); listPartograph(active.id).then(setParto) }
  }

  return (
    <div className="space-y-4">
      {/* Who she already has. Above the ANC record on purpose: it is the
          first thing Form F asks about and the thing the monthly return
          classifies her by. */}
      <LivingChildrenCard patientId={patientId} canWrite={canWrite}
        expectedLiving={active?.living ?? null} />

      {/* ANC record */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#0F172A' }}>
            <HeartPulse className="w-4 h-4" style={{ color: '#DB2777' }} /> Antenatal Care
          </h3>
          {canWrite && !active && (
            <button onClick={() => setShowStart((s) => !s)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: '#DB2777', color: '#fff', border: 'none', cursor: 'pointer' }}>
              <Plus className="w-3 h-3" /> Start ANC
            </button>
          )}
        </div>

        {showStart && !active && (
          <div className="rounded-xl p-3 mb-3 grid grid-cols-2 md:grid-cols-4 gap-2" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
            <div><label className="text-xs block mb-1" style={{ color: '#94A3B8' }}>LMP</label><Input type="date" value={start.lmp ?? ''} onChange={(e) => setStart((s) => ({ ...s, lmp: e.target.value }))} /></div>
            {/* Living was missing from this form while the labour ward panel
                displayed G P A L — so it always read "L–". It is also the
                figure Form F field 4 and the monthly return are built on. */}
            {[['gravida', 'Gravida'], ['para', 'Para'], ['living', 'Living'], ['abortions', 'Abortions'], ['blood_group', 'Blood group']].map(([k, l]) => (
              <div key={k}><label className="text-xs block mb-1" style={{ color: '#94A3B8' }}>{l}</label><Input value={start[k] ?? ''} onChange={(e) => setStart((s) => ({ ...s, [k]: e.target.value }))} /></div>
            ))}
            <div className="col-span-2"><label className="text-xs block mb-1" style={{ color: '#94A3B8' }}>High-risk notes</label><Input value={start.high_risk_notes ?? ''} onChange={(e) => setStart((s) => ({ ...s, high_risk: 'yes', high_risk_notes: e.target.value }))} placeholder="Leave blank if none" /></div>
            <div className="flex items-end"><button onClick={startAnc} disabled={busy} className="w-full px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: '#DB2777', color: '#fff', border: 'none', cursor: 'pointer' }}>{busy ? 'Saving…' : 'Start'}</button></div>
          </div>
        )}

        {active ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-1">
              {[['LMP', active.lmp ? <DateText date={active.lmp} /> : '—'], ['EDD', active.edd ? <DateText date={active.edd} /> : '—'], ['GA now', gaFrom(active.lmp)], ['G/P/A', `${active.gravida ?? '-'}/${active.para ?? '-'}/${active.abortions ?? '-'}`], ['Blood', active.blood_group ?? '—']].map(([l, v], i) => (
                <div key={i} className="rounded-xl px-3 py-2" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
                  <p className="text-sm font-bold" style={{ color: '#0F172A' }}>{v}</p>
                  <p className="text-xs" style={{ color: '#64748B' }}>{l}</p>
                </div>
              ))}
            </div>
            {active.high_risk && <p className="text-xs mt-1 font-semibold" style={{ color: '#DC2626' }}>⚠ High-risk{active.high_risk_notes ? `: ${active.high_risk_notes}` : ''}</p>}
            {canWrite && (
              <div className="flex gap-2 mt-2">
                <button onClick={() => setAncStatus(active.id, 'delivered').then(load)} className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: '#DCFCE7', color: '#15803D', border: 'none', cursor: 'pointer' }}>Mark delivered</button>
                <button onClick={() => setAncStatus(active.id, 'closed').then(load)} className="px-2.5 py-1 rounded-lg text-xs font-medium" style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>Close</button>
              </div>
            )}
          </>
        ) : !showStart && (
          <p className="text-xs" style={{ color: '#94A3B8' }}>No active antenatal record.</p>
        )}
      </GlassCard>

      {/* ANC visits + partograph — only with an active pregnancy */}
      {active && (
        <>
          <GlassCard className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>ANC Visits</h3>
              {canWrite && <button onClick={() => setShowV((s) => !s)} className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>+ Visit</button>}
            </div>
            {showV && (
              <div className="rounded-xl p-3 mb-3 grid grid-cols-2 md:grid-cols-4 gap-2" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
                {VISIT_FIELDS.map(([k, l, t]) => (
                  <div key={k}><label className="text-xs block mb-1" style={{ color: '#94A3B8' }}>{l}</label><Input type={t} step="0.1" value={vForm[k] ?? ''} onChange={(e) => setVForm((f) => ({ ...f, [k]: e.target.value }))} /></div>
                ))}
                <div className="flex items-end"><button onClick={saveVisit} disabled={busy} className="w-full px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>{busy ? '…' : 'Save'}</button></div>
              </div>
            )}
            {visits.length === 0 ? <p className="text-xs" style={{ color: '#94A3B8' }}>No visits recorded.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: 'rgba(248,250,252,0.9)' }}>{['Date', 'GA', 'Wt', 'BP', 'Fundal', 'FHR', 'Hb', 'Urine A/S'].map((h) => <th key={h} className="text-left px-2 py-1.5 font-semibold" style={{ color: '#475569' }}>{h}</th>)}</tr></thead>
                  <tbody>{visits.map((v) => (
                    <tr key={v.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                      <td className="px-2 py-1.5" style={{ color: '#94A3B8' }}><DateText date={v.visit_date} /></td>
                      <td className="px-2 py-1.5">{gaFrom(active.lmp, v.visit_date)}</td>
                      <td className="px-2 py-1.5">{v.weight_kg ?? '—'}</td><td className="px-2 py-1.5">{v.bp ?? '—'}</td>
                      <td className="px-2 py-1.5">{v.fundal_height_cm ?? '—'}</td><td className="px-2 py-1.5">{v.fetal_heart_rate ?? '—'}</td>
                      <td className="px-2 py-1.5">{v.hb ?? '—'}</td><td className="px-2 py-1.5">{v.urine_albumin ?? '—'}/{v.urine_sugar ?? '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#0F172A' }}><Activity className="w-4 h-4" style={{ color: '#7C3AED' }} /> Partograph (labour)</h3>
              {canWrite && <button onClick={() => setShowP((s) => !s)} className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: '#7C3AED', color: '#fff', border: 'none', cursor: 'pointer' }}>+ Observation</button>}
            </div>
            {showP && (
              <div className="rounded-xl p-3 mb-3 grid grid-cols-2 md:grid-cols-4 gap-2" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
                {PARTO_FIELDS.map(([k, l, t]) => (
                  <div key={k}><label className="text-xs block mb-1" style={{ color: '#94A3B8' }}>{l}</label><Input type={t} value={pForm[k] ?? ''} onChange={(e) => setPForm((f) => ({ ...f, [k]: e.target.value }))} /></div>
                ))}
                <div className="flex items-end"><button onClick={saveParto} disabled={busy} className="w-full px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: '#7C3AED', color: '#fff', border: 'none', cursor: 'pointer' }}>{busy ? '…' : 'Save'}</button></div>
              </div>
            )}
            {parto.length === 0 ? <p className="text-xs" style={{ color: '#94A3B8' }}>No labour observations.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: 'rgba(248,250,252,0.9)' }}>{['Time', 'Cervix', 'FHR', 'Contr/10', 'Descent', 'Liquor', 'BP', 'Pulse'].map((h) => <th key={h} className="text-left px-2 py-1.5 font-semibold" style={{ color: '#475569' }}>{h}</th>)}</tr></thead>
                  <tbody>{parto.map((p) => (
                    <tr key={p.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                      <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: '#94A3B8' }}>{new Date(p.recorded_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-2 py-1.5">{p.cervix_cm ?? '—'}</td><td className="px-2 py-1.5">{p.fetal_heart_rate ?? '—'}</td>
                      <td className="px-2 py-1.5">{p.contractions_per10 ?? '—'}</td><td className="px-2 py-1.5">{p.descent ?? '—'}</td>
                      <td className="px-2 py-1.5">{p.liquor ?? '—'}</td><td className="px-2 py-1.5">{p.bp ?? '—'}</td><td className="px-2 py-1.5">{p.pulse ?? '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </>
      )}
    </div>
  )
}
