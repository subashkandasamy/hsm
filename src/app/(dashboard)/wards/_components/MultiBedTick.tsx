// The room type's "Multiple beds in one room" — offered when a room type is
// created, and (12 Nov 2026) also when it or one of its rooms is edited: an ICU
// set up as a single room could never be given its other beds.

export default function MultiBedTick({ checked, onChange, note }: { checked: boolean; onChange: (v: boolean) => void; note?: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer rounded-xl p-3"
      style={{ border: `1px solid ${checked ? '#0D9488' : '#E2E8F0'}`, background: checked ? 'rgba(13,148,136,0.04)' : '#FAFAFA' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: '1rem', height: '1rem', accentColor: '#0D9488', cursor: 'pointer' }} />
      <div>
        <p className="text-sm font-medium" style={{ color: '#0F172A' }}>Multiple beds in one room</p>
        <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
          General ward, ICU, HDU — then add beds with +Beds. {note ?? 'Applies to every room of this type.'}
        </p>
      </div>
    </label>
  )
}
