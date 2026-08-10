import type { ReactNode } from 'react'

const TEAL = '#0D9488'
const SLATE9 = '#0F172A'
const SLATE5 = '#64748B'
const SLATE2 = '#E2E8F0'

/**
 * A clean, browser-framed UI mockup used inside guides to illustrate a Uyirly
 * screen. These are product illustrations (not photographs) rendered in CSS,
 * matching the marketing mock style — honest and always crisp on any display.
 */
export default function ScreenMock({
  title, caption, children,
}: { title: string; caption?: string; children: ReactNode }) {
  return (
    <figure style={{ margin: '1.6rem 0' }}>
      <div style={{
        border: `1px solid ${SLATE2}`, borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 8px 30px rgba(2,6,23,0.06)', background: '#fff',
      }}>
        {/* Window chrome */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
          borderBottom: `1px solid ${SLATE2}`, background: '#F8FAFC',
        }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: '#FCA5A5' }} />
          <span style={{ width: 10, height: 10, borderRadius: 999, background: '#FCD34D' }} />
          <span style={{ width: 10, height: 10, borderRadius: 999, background: '#86EFAC' }} />
          <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 600, color: SLATE5 }}>{title}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#CBD5E1', fontFamily: 'monospace' }}>uyirly.com</span>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
      {caption && (
        <figcaption style={{ fontSize: 13, color: SLATE5, textAlign: 'center', marginTop: 8 }}>{caption}</figcaption>
      )}
    </figure>
  )
}

/** A compact stat/pill row for use inside a ScreenMock. */
export function MockStat({ label, value, color = TEAL }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ border: `1px solid ${SLATE2}`, borderRadius: 10, padding: '10px 12px', flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: 11, color: SLATE5, margin: 0 }}>{label}</p>
      <p style={{ fontSize: 17, fontWeight: 700, color, margin: '2px 0 0' }}>{value}</p>
    </div>
  )
}

/** A simple table for use inside a ScreenMock. */
export function MockTable({ head, rows }: { head: string[]; rows: (string | { v: string; color?: string })[][] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 380 }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '6px 10px', color: '#94A3B8', fontSize: 11, fontWeight: 600, borderBottom: `1px solid ${SLATE2}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} style={{ borderBottom: '1px solid #F1F5F9' }}>
              {r.map((c, ci) => {
                const cell = typeof c === 'string' ? { v: c } : c
                return (
                  <td key={ci} style={{ textAlign: ci === 0 ? 'left' : 'right', padding: '7px 10px', color: cell.color ?? (ci === 0 ? SLATE9 : SLATE5), fontWeight: ci === 0 ? 600 : 400 }}>{cell.v}</td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
