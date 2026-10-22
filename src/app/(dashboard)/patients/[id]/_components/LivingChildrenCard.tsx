'use client'

import { useCallback, useEffect, useState } from 'react'
import { Baby, Plus, X } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import {
  listPatientChildren, addPatientChild, removePatientChild, type PatientChild,
} from '@/app/actions/pcpndt'

/**
 * The living children, one by one.
 *
 * Form F field 4 does not ask how many children a woman has. It asks for the
 * age of each living son and each living daughter, separately — and Report III
 * classifies mothers who deliver as primi, with one female child, or with two
 * and above. Both questions are the same question, and it is the question the
 * whole Act turns on: whether families with daughters keep trying for a son.
 *
 * So this is a list, not a number. A count would satisfy neither form.
 */
export default function LivingChildrenCard({ patientId, canWrite }: {
  patientId: string
  canWrite: boolean
}) {
  const [children, setChildren] = useState<PatientChild[]>([])
  const [adding, setAdding] = useState(false)
  const [sex, setSex] = useState('')
  const [years, setYears] = useState('')
  const [months, setMonths] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => { listPatientChildren(patientId).then(setChildren) }, [patientId])
  useEffect(() => { load() }, [load])

  const sons = children.filter((c) => c.sex === 'male' && c.is_living).length
  const daughters = children.filter((c) => c.sex === 'female' && c.is_living).length

  async function add() {
    setErr(null)
    if (!sex) { setErr('Son or daughter?'); return }
    if (!years && !months) { setErr('Give an age in years or months'); return }
    setBusy(true)
    const res = await addPatientChild({
      patient_id: patientId,
      sex: sex as 'male' | 'female',
      age_years: years ? Number(years) : null,
      age_months: months ? Number(months) : null,
    })
    setBusy(false)
    if (!res.success) { setErr(res.error); return }
    setSex(''); setYears(''); setMonths(''); setAdding(false)
    load()
  }

  async function remove(id: string) {
    setBusy(true)
    await removePatientChild(id, patientId)
    setBusy(false)
    load()
  }

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#0F172A' }}>
          <Baby className="w-4 h-4" style={{ color: '#DB2777' }} /> Living children
        </h3>
        {canWrite && !adding && (
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold"
            style={{ background: '#DB2777', color: '#fff', border: 'none', cursor: 'pointer' }}>
            <Plus className="w-3 h-3" /> Add
          </button>
        )}
      </div>

      <p className="text-xs mb-3" style={{ color: '#94A3B8' }}>
        Form F asks for the age of each son and each daughter separately, so this is a list rather
        than a count. It fills field 4 on every scan and classifies the mother on the monthly return.
      </p>

      {children.length > 0 && (
        <p className="text-xs font-semibold mb-2" style={{ color: '#475569' }}>
          {sons} son{sons === 1 ? '' : 's'} · {daughters} daughter{daughters === 1 ? '' : 's'}
        </p>
      )}

      {children.length === 0 && !adding && (
        <p className="text-xs" style={{ color: '#94A3B8' }}>
          None recorded. A woman with no living children is &ldquo;primi&rdquo; on the return —
          but that has to be recorded rather than assumed from an empty list.
        </p>
      )}

      <div className="grid gap-1.5">
        {children.map((c) => (
          <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <span className="text-xs font-semibold" style={{ color: c.sex === 'female' ? '#DB2777' : '#1D4ED8' }}>
              {c.sex === 'female' ? 'Daughter' : 'Son'}
            </span>
            <span className="text-xs" style={{ color: '#64748B' }}>{ageLabel(c)}</span>
            {canWrite && (
              <button onClick={() => remove(c.id)} disabled={busy}
                className="ml-auto p-1 rounded" style={{ color: '#94A3B8', cursor: 'pointer' }}
                aria-label="Remove">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {adding && (
        <div className="mt-3 p-3 rounded-lg" style={{ background: '#FDF2F8', border: '1px solid #FBCFE8' }}>
          <div className="grid grid-cols-3 gap-2">
            <Select value={sex} onChange={(e) => setSex(e.target.value)}>
              <option value="">Son / daughter</option>
              <option value="male">Son</option>
              <option value="female">Daughter</option>
            </Select>
            <Input type="number" min={0} max={60} placeholder="Years" value={years}
              onChange={(e) => setYears(e.target.value)} />
            <Input type="number" min={0} max={11} placeholder="Months" value={months}
              onChange={(e) => setMonths(e.target.value)} />
          </div>
          <p className="text-xs mt-1.5" style={{ color: '#9D174D' }}>
            Either will do — the form accepts an age in years or in months, so a nine-month-old
            does not need a birthday invented for her.
          </p>
          {err && <p className="text-xs mt-1.5" style={{ color: '#DC2626' }}>{err}</p>}
          <div className="flex gap-2 mt-2">
            <button onClick={add} disabled={busy}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: '#DB2777', color: '#fff', border: 'none', cursor: 'pointer' }}>
              Add
            </button>
            <button onClick={() => { setAdding(false); setErr(null) }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </GlassCard>
  )
}

function ageLabel(c: PatientChild): string {
  if (c.age_years != null && c.age_months != null) return `${c.age_years}y ${c.age_months}m`
  if (c.age_years != null) return `${c.age_years} year${c.age_years === 1 ? '' : 's'}`
  if (c.age_months != null) return `${c.age_months} month${c.age_months === 1 ? '' : 's'}`
  if (c.dob) return `born ${c.dob}`
  return 'age not recorded'
}
