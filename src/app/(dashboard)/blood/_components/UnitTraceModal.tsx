'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import DateText from '@/components/ui/DateText'
import { getUnitTrace } from '@/app/actions/blood'
import type { BloodUnit, BloodUnitTrace } from '@/lib/types'

const COMPONENT_LABELS: Record<string, string> = { whole: 'Whole Blood', prbc: 'PRBC', plasma: 'Plasma', platelets: 'Platelets' }

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs uppercase tracking-wide" style={{ color: '#94A3B8', minWidth: '6rem' }}>{label}</span>
      <span className="text-sm" style={{ color: '#0F172A' }}>{children}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: '#0F766E', fontWeight: 700, letterSpacing: '0.5px' }}>{title}</p>
      <div className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>{children}</div>
    </div>
  )
}

export default function UnitTraceModal({ unit, onClose }: { unit: BloodUnit; onClose: () => void }) {
  const [trace, setTrace] = useState<BloodUnitTrace | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getUnitTrace(unit.id).then((t) => { setTrace(t); setLoading(false) })
  }, [unit.id])

  const u = trace?.unit
  const markers = u ? [['HIV', u.hiv], ['HBsAg', u.hbsag], ['HCV', u.hcv], ['Syphilis', u.syphilis], ['Malaria', u.malaria]] as const : []

  return (
    <Modal open onClose={onClose} title={`Unit Traceability — ${unit.blood_group} ${COMPONENT_LABELS[unit.component] ?? unit.component}`} maxWidth="40rem">
      {loading || !u ? (
        <p className="text-sm text-center py-6" style={{ color: '#94A3B8' }}>Loading trace…</p>
      ) : (
        <div className="space-y-3">
          <Section title="Unit">
            <Row label="Bag No.">{u.bag_number ?? '—'}</Row>
            <Row label="Group / Comp">{u.blood_group} · {COMPONENT_LABELS[u.component] ?? u.component}</Row>
            <Row label="Status">{u.status}</Row>
            <Row label="Expiry"><DateText date={u.expiry} /></Row>
            {u.parent_unit_id && <Row label="Separated">Derived from a whole-blood unit</Row>}
          </Section>

          <Section title="Source">
            <Row label="Donor">{u.donor?.name ?? 'Unknown'}</Row>
            {u.camp && <Row label="Camp">{u.camp.name} (<DateText date={u.camp.camp_date} />)</Row>}
            <Row label="Collected">{u.collected_at ? <DateText date={u.collected_at} /> : '—'}</Row>
          </Section>

          <Section title="Screening">
            <Row label="Result">
              <span className="text-xs px-2 py-0.5 rounded font-semibold"
                style={u.screening_status === 'passed' ? { background: '#DCFCE7', color: '#15803D' } : u.screening_status === 'failed' ? { background: '#FEE2E2', color: '#DC2626' } : { background: '#FEF3C7', color: '#B45309' }}>
                {u.screening_status}
              </span>
            </Row>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {markers.map(([label, val]) => (
                <span key={label} className="text-xs px-1.5 py-0.5 rounded"
                  style={val === 'reactive' ? { background: '#FEE2E2', color: '#DC2626' } : val === 'non_reactive' ? { background: '#DCFCE7', color: '#15803D' } : { background: '#F1F5F9', color: '#64748B' }}>
                  {label}: {val === 'non_reactive' ? 'NR' : val === 'reactive' ? 'R' : '—'}
                </span>
              ))}
            </div>
          </Section>

          {trace!.crossmatches.length > 0 && (
            <Section title="Cross-matches">
              {trace!.crossmatches.map((x) => (
                <Row key={x.id} label={<DateText date={x.crossmatched_at} />}>
                  Major {x.major_result}{x.minor_result ? ` · Minor ${x.minor_result}` : ''} · {x.compatible ? 'Compatible' : 'Incompatible'}
                  {x.recipient_sample_no ? ` · Sample ${x.recipient_sample_no}` : ''}
                </Row>
              ))}
            </Section>
          )}

          {trace!.issues.length > 0 ? (
            <Section title="Recipient & Transfusion">
              {trace!.issues.map((iss) => (
                <div key={iss.id} className="space-y-1">
                  <Row label="Issued to">{iss.patient_name} <span className="font-mono text-xs" style={{ color: '#94A3B8' }}>{iss.patient_uhid}</span></Row>
                  <Row label="Issued"><DateText date={iss.issued_at} /></Row>
                  {iss.transfusions.map((tf) => (
                    <div key={tf.id} className="ml-2 mt-1 text-xs" style={{ color: '#475569' }}>
                      ✓ Transfused{tf.started_at ? <> · <DateText date={tf.started_at} /></> : ''}
                      {tf.reactions.map((r) => (
                        <div key={r.id} className="mt-0.5" style={{ color: '#DC2626' }}>⚠ {r.reaction_type} ({r.severity.replace('_', ' ')})</div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </Section>
          ) : (
            <Section title="Recipient & Transfusion"><p className="text-xs" style={{ color: '#94A3B8' }}>Not yet issued.</p></Section>
          )}

          <div className="flex justify-end pt-1">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Close</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
