'use client'

import { useState } from 'react'
import { Trash2, Plus, ShieldAlert } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import EmptyState from '@/components/ui/EmptyState'
import { addAllergy, removeAllergy } from '@/app/actions/allergies'
import type { PatientAllergy, AllergySeverity } from '@/lib/types'

const SEVERITY_STYLE: Record<AllergySeverity, { bg: string; color: string; border: string }> = {
  severe:   { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
  moderate: { bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' },
  mild:     { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
}

interface Props {
  patientId: string
  initialAllergies: PatientAllergy[]
  canWrite: boolean
}

export default function AllergiesTab({ patientId, initialAllergies, canWrite }: Props) {
  const [allergies, setAllergies] = useState<PatientAllergy[]>(initialAllergies)
  const [form, setForm] = useState({ allergen: '', reaction: '', severity: 'moderate' as AllergySeverity })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.allergen.trim()) { setError('Allergen name is required'); return }
    setSaving(true)
    setError(null)
    const result = await addAllergy({
      patientId, allergen: form.allergen, reaction: form.reaction || null, severity: form.severity,
    })
    setSaving(false)
    if (result.success) {
      setAllergies((prev) => [result.allergy, ...prev])
      setForm({ allergen: '', reaction: '', severity: 'moderate' })
    } else {
      setError(result.error)
    }
  }

  async function handleRemove(id: string) {
    setRemovingId(id)
    const result = await removeAllergy(id)
    setRemovingId(null)
    if (result.success) setAllergies((prev) => prev.filter((a) => a.id !== id))
  }

  return (
    <div className="space-y-4">
      {/* Add form */}
      {canWrite && (
        <GlassCard className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#94A3B8' }}>
            Add Allergy
          </p>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField label="Allergen" htmlFor="allergen" required>
                <Input
                  id="allergen" value={form.allergen}
                  onChange={(e) => setForm((f) => ({ ...f, allergen: e.target.value }))}
                  placeholder="e.g. Penicillin" required
                />
              </FormField>
              <FormField label="Reaction" htmlFor="reaction">
                <Input
                  id="reaction" value={form.reaction}
                  onChange={(e) => setForm((f) => ({ ...f, reaction: e.target.value }))}
                  placeholder="e.g. Rash, Anaphylaxis"
                />
              </FormField>
              <FormField label="Severity" htmlFor="severity">
                <Select
                  id="severity" value={form.severity}
                  onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as AllergySeverity }))}
                >
                  <option value="mild">Mild</option>
                  <option value="moderate">Moderate</option>
                  <option value="severe">Severe</option>
                </Select>
              </FormField>
            </div>
            {error && (
              <p className="text-sm" style={{ color: '#DC2626' }}>{error}</p>
            )}
            <button
              type="submit" disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold min-h-[44px]"
              style={{ background: saving ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              <Plus className="w-4 h-4" /> {saving ? 'Adding…' : 'Add Allergy'}
            </button>
          </form>
        </GlassCard>
      )}

      {/* Allergy list */}
      {allergies.length === 0 ? (
        <EmptyState
          title="No allergies recorded"
          description="Structured allergy entries will appear here. Free-text allergies are in the Info tab."
        />
      ) : (
        <div className="space-y-2">
          {allergies.map((a) => {
            const style = SEVERITY_STYLE[a.severity]
            return (
              <GlassCard key={a.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    {a.severity === 'severe' && (
                      <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#DC2626' }} />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{a.allergen}</p>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                          style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}>
                          {a.severity}
                        </span>
                      </div>
                      {a.reaction && (
                        <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
                          Reaction: {a.reaction}
                        </p>
                      )}
                      {a.recorder && (
                        <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                          Recorded by {(a.recorder as { full_name: string }).full_name}
                        </p>
                      )}
                    </div>
                  </div>
                  {canWrite && (
                    <button
                      onClick={() => handleRemove(a.id)}
                      disabled={removingId === a.id}
                      className="p-2 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
                      style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
                      aria-label="Remove allergy"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </GlassCard>
            )
          })}
        </div>
      )}
    </div>
  )
}
