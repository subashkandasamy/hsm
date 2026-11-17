'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PAGE_SIZES } from '@/lib/paging'

interface Props {
  page: number
  size: number
  total: number
  busy?: boolean
  onPage: (page: number) => void
  onSize: (size: number) => void
}

/** Page numbers to show: first, last, and two either side of the current one. */
function pageList(page: number, last: number): (number | '…')[] {
  const want = new Set([1, last, page - 2, page - 1, page, page + 1, page + 2].filter((p) => p >= 1 && p <= last))
  const out: (number | '…')[] = []
  let prev = 0
  for (const p of [...want].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push('…')
    out.push(p)
    prev = p
  }
  return out
}

/** "26–50 of 3,198", rows per page (25 / 50 / 100), and the pages. */
export default function Pager({ page, size, total, busy, onPage, onSize }: Props) {
  const last = Math.max(1, Math.ceil(total / size))
  const first = total ? (page - 1) * size + 1 : 0
  const end = Math.min(total, page * size)
  const btn = (disabled: boolean): React.CSSProperties => ({
    minWidth: 34, height: 34, borderRadius: 10, border: '1px solid #E2E8F0', background: 'rgba(255,255,255,0.85)',
    color: disabled ? '#CBD5E1' : '#475569', cursor: disabled ? 'not-allowed' : 'pointer',
  })
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-4" style={{ opacity: busy ? 0.6 : 1 }}>
      <div className="flex items-center gap-3 text-sm" style={{ color: '#64748B' }}>
        <span>{total ? `${first.toLocaleString('en-IN')}–${end.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')}` : 'Nothing to show'}</span>
        <label className="flex items-center gap-1.5">
          <span className="text-xs">Rows</span>
          <select value={size} onChange={(e) => onSize(Number(e.target.value))} disabled={busy}
            className="text-sm rounded-lg px-2 py-1" style={{ border: '1px solid #E2E8F0', background: 'rgba(255,255,255,0.9)', color: '#0F172A' }}>
            {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      {last > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous page" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}
            className="flex items-center justify-center" style={btn(busy || page <= 1)}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          {pageList(page, last).map((p, i) => p === '…'
            ? <span key={`gap-${i}`} className="px-1 text-sm" style={{ color: '#94A3B8' }}>…</span>
            : (
              <button key={p} type="button" disabled={busy} onClick={() => onPage(p)} aria-current={p === page ? 'page' : undefined}
                className="text-sm font-medium" style={p === page ? { ...btn(false), background: '#0D9488', color: '#fff', borderColor: '#0D9488' } : btn(!!busy)}>
                {p}
              </button>
            ))}
          <button type="button" aria-label="Next page" disabled={busy || page >= last} onClick={() => onPage(page + 1)}
            className="flex items-center justify-center" style={btn(busy || page >= last)}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
