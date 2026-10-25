'use client'

import { useEffect, useState } from 'react'
import { Loader2, Check } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import { getLedgerMappings, saveLedgerMapping } from '@/app/actions/accounts'
import type { LedgerMapping } from '@/lib/types'
import { SOURCE_LABEL, METHOD_LABEL } from './labels'

/**
 * The hospital's own names for its income heads and its ways of taking money.
 *
 * This exists because there is no universal chart of accounts. One hospital
 * posts laboratory income to "Diagnostic Income" and the next to "Lab
 * Receipts", and an accounting package rejects a voucher naming a ledger it
 * has never heard of — in Tally, Busy, Marg and Zoho alike. So it cannot be
 * defaulted, only asked for, and it belongs to every export rather than to any
 * one of them.
 *
 * Left blank, the export simply leaves the column empty. That is deliberate:
 * a guessed ledger name looks right in the file and fails at the import, which
 * is the worst place to find out.
 */

const SOURCES = ['consultation', 'lab', 'radiology', 'pharmacy', 'ipd_pharmacy',
                 'bed', 'nursing', 'icu', 'ot', 'blood', 'dental', 'manual'] as const
const METHODS = ['cash', 'card', 'upi', 'bank_transfer', 'cheque', 'insurance'] as const

export default function LedgersTab({ canManage }: { canManage: boolean }) {
  const [map, setMap]   = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(true)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getLedgerMappings()
      .then((rows: LedgerMapping[]) => {
        const m: Record<string, string> = {}
        for (const r of rows) m[`${r.kind}:${r.key}`] = r.ledger_name
        setMap(m)
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(false))
  }, [])

  async function save(kind: 'source' | 'method', key: string, value: string) {
    setError(null)
    const res = await saveLedgerMapping({ kind, key, ledgerName: value })
    if (!res.success) { setError(res.error ?? 'Could not save that name'); return }
    setSaved(`${kind}:${key}`)
    setTimeout(() => setSaved(null), 1500)
  }

  if (busy) {
    return (
      <GlassCard className="p-10 flex items-center justify-center" style={{ color: '#94A3B8' }}>
        <Loader2 className="w-5 h-5 animate-spin" />
      </GlassCard>
    )
  }

  return (
    <div>
      <GlassCard className="p-4 mb-4">
        <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
          Type the names your accountant already uses in their books. Every export
          carries these, so a file imports instead of being rejected for naming a
          ledger that does not exist. Leave a row blank and the column is simply
          left empty — better than a guess that fails at the import.
        </p>
      </GlassCard>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm"
             style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Group title="Income heads" subtitle="What each kind of charge is posted to"
               rows={SOURCES.map((k) => ({ key: k, label: SOURCE_LABEL[k] ?? k }))}
               kind="source" map={map} setMap={setMap} save={save} saved={saved} canManage={canManage} />
        <Group title="Payment methods" subtitle="Where money taken each way is banked"
               rows={METHODS.map((k) => ({ key: k, label: METHOD_LABEL[k] ?? k }))}
               kind="method" map={map} setMap={setMap} save={save} saved={saved} canManage={canManage} />
      </div>
    </div>
  )
}

function Group({ title, subtitle, rows, kind, map, setMap, save, saved, canManage }: {
  title: string; subtitle: string
  rows: Array<{ key: string; label: string }>
  kind: 'source' | 'method'
  map: Record<string, string>
  setMap: React.Dispatch<React.SetStateAction<Record<string, string>>>
  save: (kind: 'source' | 'method', key: string, value: string) => void
  saved: string | null
  canManage: boolean
}) {
  return (
    <GlassCard className="p-5">
      <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{title}</h2>
      <p className="mb-3" style={{ fontSize: '12px', color: '#94A3B8' }}>{subtitle}</p>
      <div className="grid gap-2">
        {rows.map(({ key, label }) => {
          const id = `${kind}:${key}`
          return (
            <div key={key} className="flex items-center gap-3">
              <span style={{ fontSize: '13px', color: '#475569', width: '38%' }}>{label}</span>
              <div className="flex-1 flex items-center gap-2">
                <Input
                  value={map[id] ?? ''}
                  disabled={!canManage}
                  placeholder="—"
                  onChange={(e) => setMap((m) => ({ ...m, [id]: e.target.value }))}
                  onBlur={(e) => canManage && save(kind, key, e.target.value)}
                />
                {saved === id && <Check className="w-4 h-4 flex-shrink-0" style={{ color: '#0D9488' }} />}
              </div>
            </div>
          )
        })}
      </div>
    </GlassCard>
  )
}
