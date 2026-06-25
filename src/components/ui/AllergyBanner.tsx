import { AlertTriangle, ShieldAlert } from 'lucide-react'
import type { PatientAllergy } from '@/lib/types'

interface Props {
  allergies: PatientAllergy[]
  className?: string
}

export default function AllergyBanner({ allergies, className = '' }: Props) {
  if (allergies.length === 0) return null

  const severe = allergies.filter((a) => a.severity === 'severe')
  const hasSevere = severe.length > 0

  if (hasSevere) {
    return (
      <div
        className={`flex items-start gap-3 px-4 py-3 rounded-xl ${className}`}
        style={{ background: '#FEF2F2', border: '2px solid #FECACA' }}
        role="alert"
        aria-label="Severe allergy warning"
      >
        <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#DC2626' }} />
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: '#DC2626' }}>
            SEVERE ALLERGY — {severe.map((a) => a.allergen).join(', ')}
          </p>
          {severe.some((a) => a.reaction) && (
            <p className="text-xs mt-0.5" style={{ color: '#B91C1C' }}>
              {severe.filter((a) => a.reaction).map((a) => `${a.allergen}: ${a.reaction}`).join(' · ')}
            </p>
          )}
          {allergies.length > severe.length && (
            <p className="text-xs mt-0.5" style={{ color: '#991B1B' }}>
              +{allergies.length - severe.length} additional allergy/allergies on record
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl ${className}`}
      style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}
      role="note"
      aria-label="Allergy notice"
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#B45309' }} />
      <p className="text-sm" style={{ color: '#92400E' }}>
        <span className="font-semibold">Allergies on record: </span>
        {allergies.map((a) => a.allergen).join(', ')}
      </p>
    </div>
  )
}
