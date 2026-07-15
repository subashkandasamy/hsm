import { ArrowRight, ArrowDown } from 'lucide-react'

interface Step { label: string; sublabel?: string }

const TEAL = '#0D9488'
const S9 = '#0F172A'
const S5 = '#64748B'
const S2 = '#E2E8F0'

/** Horizontal (desktop) / vertical (mobile) sequence-flow diagram, e.g. patient journey. */
export default function WorkflowDiagram({ steps, title }: { steps: Step[]; title?: string }) {
  return (
    <div className="not-prose my-6 rounded-2xl p-5" style={{ background: '#F8FAFC', border: `1px solid ${S2}` }}>
      {title && <p className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: S5 }}>{title}</p>}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0">
        {steps.map((s, i) => (
          <div key={i} className="flex flex-col sm:flex-row sm:flex-1 sm:items-center">
            <div className="rounded-xl px-3 py-3 text-center sm:flex-1" style={{ background: '#fff', border: `1px solid ${S2}` }}>
              <p className="text-sm font-semibold" style={{ color: S9 }}>{s.label}</p>
              {s.sublabel && <p className="text-xs mt-0.5" style={{ color: S5 }}>{s.sublabel}</p>}
            </div>
            {i < steps.length - 1 && (
              <div className="flex items-center justify-center shrink-0 py-1 sm:py-0 sm:px-2" style={{ color: TEAL }}>
                <span className="hidden sm:inline"><ArrowRight className="w-4 h-4" /></span>
                <span className="sm:hidden"><ArrowDown className="w-4 h-4" /></span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
