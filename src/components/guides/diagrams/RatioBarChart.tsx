interface RatioRow { label: string; ratio: number; note?: string }

const TEAL = '#0D9488'
const S9 = '#0F172A'
const S5 = '#64748B'
const S2 = '#E2E8F0'

/**
 * Horizontal bars for "1 nurse : N patients" style ratios. Bar length is
 * proportional to staffing intensity (1/ratio) — a lower ratio (e.g. ICU 1:1)
 * draws a longer, darker bar than a higher one (general ward 1:6).
 */
export default function RatioBarChart({ rows, title }: { rows: RatioRow[]; title?: string }) {
  const maxIntensity = Math.max(...rows.map((r) => 1 / r.ratio))
  return (
    <div className="not-prose my-6 rounded-2xl p-5" style={{ background: '#F8FAFC', border: `1px solid ${S2}` }}>
      {title && <p className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: S5 }}>{title}</p>}
      <div className="space-y-3">
        {rows.map((r, i) => {
          const pct = Math.max(8, ((1 / r.ratio) / maxIntensity) * 100)
          return (
            <div key={i}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-sm font-medium" style={{ color: S9 }}>{r.label}</span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: TEAL }}>1:{r.ratio}</span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: '#E2E8F0' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: TEAL }} />
              </div>
              {r.note && <p className="text-xs mt-1" style={{ color: S5 }}>{r.note}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
