interface Stat { value: string; label: string }

const TEAL = '#0D9488'
const S9 = '#0F172A'
const S5 = '#64748B'
const S2 = '#E2E8F0'

export default function StatGrid({ stats }: { stats: Stat[] }) {
  return (
    <div className="not-prose my-6 grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(stats.length, 3)}, minmax(0,1fr))` }}>
      {stats.map((s, i) => (
        <div key={i} className="rounded-2xl p-4 text-center" style={{ background: '#F8FAFC', border: `1px solid ${S2}` }}>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums" style={{ color: TEAL }}>{s.value}</p>
          <p className="text-xs mt-1" style={{ color: S5 }}>{s.label}</p>
        </div>
      ))}
    </div>
  )
}
