'use client'

/**
 * Packages at the top of a lab order screen (OPD order, consultation, ward).
 *
 * Choosing one shows exactly what will be ordered. One package per order; tick
 * it again to take it off. The tests it holds are greyed out in the list below
 * by the screen that uses this, so nothing is ordered twice.
 */

import { Check, ChevronDown, ChevronRight, Package } from 'lucide-react'
import Money from '@/components/ui/Money'
import type { TestPackage } from '@/lib/types'
import { KindTag } from './PackagesTab'

export default function PackagePicker({ packages, selectedId, onChange }: {
  packages: TestPackage[]
  selectedId: string | null
  onChange: (id: string | null) => void
}) {
  if (!packages.length) return null
  return (
    <div>
      <p className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: '#0F172A' }}>
        <Package className="w-4 h-4" style={{ color: '#0D9488' }} /> Packages
      </p>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
        {packages.map((p, n) => {
          const on = p.id === selectedId
          const labs = p.items.filter((i) => i.kind === 'lab').length
          const scans = p.items.length - labs
          return (
            <div key={p.id} style={{ borderBottom: n < packages.length - 1 ? '1px solid #F1F5F9' : 'none', background: on ? 'rgba(13,148,136,0.07)' : '#fff' }}>
              <button type="button" onClick={() => onChange(on ? null : p.id)} aria-pressed={on}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                    style={{ background: on ? '#0D9488' : '#F1F5F9', border: `1px solid ${on ? '#0D9488' : '#CBD5E1'}` }}>
                    {on && <Check className="w-3 h-3" style={{ color: '#fff' }} />}
                  </span>
                  <span className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>{p.name}</span>
                  <span className="text-xs flex-shrink-0" style={{ color: '#94A3B8' }}>
                    {labs} test{labs === 1 ? '' : 's'}{scans ? ` + ${scans} scan${scans === 1 ? '' : 's'}` : ''}
                  </span>
                  {on ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#64748B' }} />
                    : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#CBD5E1' }} />}
                </span>
                <span className="text-sm font-semibold flex-shrink-0" style={{ color: '#0D9488' }}><Money amount={p.price} /></span>
              </button>
              {on && (
                <div className="px-3 pb-3 pl-9">
                  <p className="text-xs mb-1.5" style={{ color: '#64748B' }}>This package orders:</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {p.items.map((i) => (
                      <li key={`${i.kind}:${i.test_id}`} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
                        style={{ background: '#fff', border: '1px solid #E2E8F0', color: '#0F172A' }}>
                        <KindTag kind={i.kind} /> {i.name}
                        {i.applies_to !== 'all' && (
                          <span style={{ color: '#7C3AED' }}>· {i.applies_to === 'female' ? 'women only' : 'men only'}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {p.items.some((i) => i.applies_to !== 'all') && (
                    <p className="text-xs mt-1.5" style={{ color: '#64748B' }}>
                      Tests for the other sex are left out automatically, going by the patient&apos;s record.
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
