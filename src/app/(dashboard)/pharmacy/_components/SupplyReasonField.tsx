'use client'

/**
 * The reason a Schedule X medicine is being supplied (0269) — a few words in
 * the pharmacist's own terms, as KMCH writes in its paper ledger. Shown only
 * once the server has said the medicine is Schedule X.
 */
export default function SupplyReasonField({ value, onChange, compact = false, autoFocus = true }: {
  value: string
  onChange: (v: string) => void
  compact?: boolean
  autoFocus?: boolean
}) {
  return (
    <div className={compact ? 'w-full' : ''}>
      <label className="block text-xs font-semibold mb-1" style={{ color: '#92400E' }}>
        Reason for supply — Schedule X <span style={{ color: '#DC2626' }}>*</span>
      </label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus}
        maxLength={200} placeholder="e.g. pain, fever"
        className={`w-full rounded-lg text-sm ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}
        style={{ border: '1px solid #FCD34D', background: '#FFFBEB', color: '#0F172A', outline: 'none' }} />
      <p className="text-[11px] mt-0.5" style={{ color: '#92400E' }}>Goes in the X register with the patient and medicine.</p>
    </div>
  )
}
