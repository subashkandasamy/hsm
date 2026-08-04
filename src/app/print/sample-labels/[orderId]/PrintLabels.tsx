'use client'

import { useEffect } from 'react'
import QrRenderer from '@/components/barcode/QrRenderer'
import { ArrowLeft, Printer } from 'lucide-react'

interface StickerGroup {
  sampleType: string
  testNames: string[]
}

interface OrderData {
  id: string
  ordered_at: string
  patient: { id: string; full_name: string; uhid: string } | null
  items: Array<{ test: { name: string; sample_type: string | null } | null }> | null
}

interface Props { order: OrderData }

function groupBySampleType(order: OrderData): StickerGroup[] {
  const map = new Map<string, string[]>()
  for (const item of order.items ?? []) {
    const st = (item.test?.sample_type ?? 'General').trim()
    if (!map.has(st)) map.set(st, [])
    map.get(st)!.push(item.test?.name ?? 'Unknown')
  }
  return Array.from(map.entries()).map(([sampleType, testNames]) => ({ sampleType, testNames }))
}

function Sticker({ orderId, group, patient, date }: {
  orderId: string
  group: StickerGroup
  patient: { full_name: string; uhid: string } | null
  date: string
}) {
  return (
    <div
      className="sticker"
      style={{
        width: '50mm',
        height: '30mm',
        background: '#fff',
        fontFamily: 'system-ui, sans-serif',
        padding: '3px 5px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #CBD5E1',
        borderRadius: '4px',
      }}
    >
      {/* Sample type + date */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
        <span style={{
          fontSize: '7pt', fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: '#7C3AED',
          background: '#F3E8FF', padding: '1px 4px', borderRadius: '2px',
          whiteSpace: 'nowrap',
        }}>
          {group.sampleType}
        </span>
        <span style={{ fontSize: '7pt', color: '#94A3B8', whiteSpace: 'nowrap' }}>{date}</span>
      </div>

      {/* Barcode + text */}
      <div style={{ display: 'flex', gap: '5px', alignItems: 'flex-start', flex: 1, overflow: 'hidden' }}>
        <div style={{ flexShrink: 0 }}>
          <QrRenderer value={orderId} size={44} />
        </div>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <p style={{ fontSize: '9pt', fontWeight: 700, color: '#0F172A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {patient?.full_name ?? '—'}
          </p>
          <p style={{ fontSize: '8pt', color: '#0D9488', fontWeight: 600, margin: '1px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {patient?.uhid ?? '—'}
          </p>
          {group.testNames.slice(0, 3).map((name) => (
            <p key={name} style={{ fontSize: '7pt', color: '#475569', margin: 0, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </p>
          ))}
          {group.testNames.length > 3 && (
            <p style={{ fontSize: '7pt', color: '#94A3B8', margin: 0 }}>+{group.testNames.length - 3} more</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PrintLabels({ order }: Props) {
  const groups = groupBySampleType(order)
  const date = new Date(order.ordered_at).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  useEffect(() => {
    const t = setTimeout(() => window.print(), 500)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      <style>{`
        @page { size: 50mm 30mm; margin: 0; }

        @media print {
          html, body { width: 50mm; height: 30mm; margin: 0; padding: 0; background: #fff; }
          .screen-only { display: none !important; }
          .sticker {
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            page-break-after: always;
          }
          .sticker:last-child { page-break-after: auto; }
        }

        @media screen {
          body {
            background: #F1F5F9;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 24px;
            gap: 12px;
            min-height: 100vh;
          }
        }
      `}</style>

      <div className="screen-only" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '4px' }}>
        <button
          onClick={() => window.history.back()}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#fff', color: '#475569', cursor: 'pointer', fontSize: '14px', fontFamily: 'system-ui' }}
        >
          <ArrowLeft size={15} /> Back
        </button>
        <button
          onClick={() => window.print()}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', border: 'none', background: '#7C3AED', color: '#fff', cursor: 'pointer', fontSize: '14px', fontFamily: 'system-ui', fontWeight: 600 }}
        >
          <Printer size={15} /> Print {groups.length} Label{groups.length > 1 ? 's' : ''}
        </button>
      </div>

      {groups.map(({ sampleType, testNames }) => (
        <Sticker
          key={sampleType}
          orderId={order.id}
          group={{ sampleType, testNames }}
          patient={order.patient}
          date={date}
        />
      ))}
    </>
  )
}
