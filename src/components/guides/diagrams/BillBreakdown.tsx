interface LineItem { label: string; amount: number; note?: string }

const TEAL = '#0D9488'
const S9 = '#0F172A'
const S5 = '#64748B'
const S2 = '#E2E8F0'

function inr(n: number) {
  return '₹' + n.toLocaleString('en-IN')
}

/** Itemized sample-bill visual — line items adding to a total, receipt-style. */
export default function BillBreakdown({ title, items, total }: { title?: string; items: LineItem[]; total: number }) {
  return (
    <div className="not-prose my-6 rounded-2xl overflow-hidden" style={{ border: `1px solid ${S2}` }}>
      {title && (
        <div className="px-5 py-3" style={{ background: '#F8FAFC', borderBottom: `1px solid ${S2}` }}>
          <p className="text-sm font-semibold" style={{ color: S9 }}>{title}</p>
        </div>
      )}
      <div className="px-5 py-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-start justify-between py-2.5" style={{ borderBottom: `1px solid #F1F5F9` }}>
            <div>
              <p className="text-sm" style={{ color: S9 }}>{it.label}</p>
              {it.note && <p className="text-xs mt-0.5" style={{ color: S5 }}>{it.note}</p>}
            </div>
            <span className="text-sm font-medium tabular-nums shrink-0 ml-4" style={{ color: S9 }}>{inr(it.amount)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-5 py-3.5" style={{ background: '#F0FDFA' }}>
        <span className="text-sm font-bold" style={{ color: S9 }}>Total</span>
        <span className="text-base font-bold tabular-nums" style={{ color: TEAL }}>{inr(total)}</span>
      </div>
    </div>
  )
}
