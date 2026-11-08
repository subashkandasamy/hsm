'use client'

import type { RxWarning } from '@/lib/types'

interface Props {
  warnings: RxWarning[]
  /** The acknowledgement tick — required before a major warning can be overridden, and recorded. */
  acknowledged: boolean
  onAcknowledge: (v: boolean) => void
  /**
   * Hide the "not in the catalogue" line — while the doctor is still choosing
   * from the list, "azi" matches several molecules on the way to "Azithral 500"
   * and the line would be meaningless. The saved record keeps it either way.
   */
  hideUnchecked?: boolean
  /** Finishes "I have reviewed this warning and am … anyway". */
  verb?: string
}

/**
 * The allergy / interaction warnings for a drug being prescribed or ordered.
 * One component for OPD prescriptions and IPD medication orders, so a warning
 * looks and behaves the same wherever a drug is written.
 */
export default function RxSafetyBanner({ warnings, acknowledged, onAcknowledge, hideUnchecked = false, verb = 'prescribing' }: Props) {
  const shown = hideUnchecked ? warnings.filter((w) => w.type !== 'unrecognised') : warnings
  const hasMajor = warnings.some((w) => w.severity === 'major')
  if (!shown.length && !hasMajor) return null

  return (
    <>
      {shown.length > 0 && (
        <div className="mt-2 space-y-1">
          {shown.map((w, i) => {
            const major = w.severity === 'major' || w.type === 'allergy'
            const unchecked = w.type === 'unrecognised'
            return (
              <div key={i} className="flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                style={major ? { background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }
                  : unchecked ? { background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }
                  : { background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }}>
                <span>{w.type === 'allergy' ? '⚠ Allergy' : unchecked ? 'Not checked' : w.severity === 'major' ? '⚠ Major' : 'Interaction'}</span>
                <span style={{ fontWeight: 400 }}>{w.message}</span>
              </div>
            )
          })}
        </div>
      )}
      {hasMajor && (
        <label className="flex items-start gap-2 mt-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer"
          style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B' }}>
          <input type="checkbox" checked={acknowledged} onChange={(e) => onAcknowledge(e.target.checked)}
            className="mt-0.5" style={{ accentColor: '#DC2626' }} />
          <span>
            I have reviewed this warning and am {verb} anyway.
            <span style={{ fontWeight: 400, display: 'block', color: '#B91C1C' }}>
              This is recorded with your name.
            </span>
          </span>
        </label>
      )}
    </>
  )
}
