import { ImageResponse } from 'next/og'

export const alt = 'Uyirly — Hospital Management Software for India'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const MODULES = [
  'OPD', 'IPD', 'Emergency', 'Lab', 'Radiology', 'Pharmacy',
  'OT', 'Blood Bank', 'Billing', 'Insurance', 'HR', 'Inventory',
]

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 45%, #06B6D4 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Brand row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: 'rgba(255,255,255,0.15)',
              border: '2px solid rgba(255,255,255,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 34,
              fontWeight: 700,
              color: '#ffffff',
            }}
          >
            U
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, color: '#ffffff', letterSpacing: -1 }}>
            Uyirly
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div
            style={{
              fontSize: 76,
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 900,
            }}
          >
            Hospital Management Software for India
          </div>
          <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.92)', maxWidth: 880 }}>
            OPD to billing, lab to pharmacy — one cloud platform. DPDP aligned.
          </div>
        </div>

        {/* Module chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, maxWidth: 1040 }}>
          {MODULES.map((m) => (
            <div
              key={m}
              style={{
                fontSize: 22,
                color: '#ffffff',
                padding: '8px 18px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.16)',
                border: '1px solid rgba(255,255,255,0.28)',
              }}
            >
              {m}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  )
}
