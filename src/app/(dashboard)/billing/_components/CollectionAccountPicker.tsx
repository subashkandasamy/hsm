'use client'

import { useCallback, useEffect, useState } from 'react'
import Money from '@/components/ui/Money'
import { getCollectionPlan } from '@/app/actions/billing'
import type { CollectionAccountDue } from '@/lib/types'

/**
 * What the given bills owe each collection account (0267), fetched each time
 * `enabled` turns on — i.e. while a UPI or bank payment is being taken. A
 * hospital with only the main account gets one entry.
 */
export function useCollectionPlan(billIds: string[], enabled: boolean) {
  const idsKey = billIds.join(',')
  const [state, setState] = useState<{ key: string; accounts: CollectionAccountDue[] | null; error: string } | null>(null)

  const fetchPlan = useCallback(async (key: string) => {
    const ids = key ? key.split(',') : []
    if (!ids.length) return { key, accounts: [] as CollectionAccountDue[], error: '' }
    try {
      const res = await getCollectionPlan(ids)
      return res.success ? { key, accounts: res.accounts, error: '' } : { key, accounts: null, error: res.error }
    } catch {
      return { key, accounts: null, error: 'Could not work out which account to collect into.' }
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    let live = true
    fetchPlan(idsKey).then((next) => { if (live) setState(next) })
    return () => { live = false }
  }, [enabled, idsKey, fetchPlan])

  /** Fetch again (after a payment) and return the fresh accounts. */
  const reload = useCallback(async () => {
    const next = await fetchPlan(idsKey)
    setState(next)
    return next.accounts
  }, [fetchPlan, idsKey])

  const current = state && state.key === idsKey ? state : null
  return {
    accounts: current?.accounts ?? null,
    error: current?.error ?? '',
    loading: enabled && !current,
    reload,
  }
}

/**
 * The account being collected into: the one chosen, while it is still owed
 * something, else the first account that is.
 */
export function pickAccount(accounts: CollectionAccountDue[] | null, chosen: string | null): CollectionAccountDue | null {
  if (!accounts || !accounts.length) return null
  return accounts.find((a) => a.key === chosen) ?? accounts[0]
}

/**
 * "Pay into" — one choice per account the bills owe. With a single account
 * there is nothing to choose, so it only says where the money goes (and says
 * nothing at all for the main account, which is how it always was).
 */
export default function CollectionAccountPicker({ accounts, selected, onSelect }: {
  accounts: CollectionAccountDue[]
  selected: string | null
  onSelect: (a: CollectionAccountDue) => void
}) {
  if (accounts.length === 0) return null
  if (accounts.length === 1) {
    const only = accounts[0]
    if (only.key === 'main') return null
    return (
      <p className="text-xs" style={{ color: '#475569' }}>
        Paying into <strong style={{ color: '#0F172A' }}>{only.name}</strong>
      </p>
    )
  }
  return (
    <div>
      <p className="text-xs font-medium mb-1.5" style={{ color: '#475569' }}>
        Pay into — these bills are split across {accounts.length} accounts, one QR each
      </p>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {accounts.map((a) => {
          const on = a.key === selected
          return (
            <button key={a.key} type="button" onClick={() => onSelect(a)} aria-pressed={on}
              className="text-left px-3 py-2 rounded-xl text-sm"
              style={{
                background: on ? '#F0FDFA' : '#fff',
                border: `1.5px solid ${on ? '#0D9488' : '#E2E8F0'}`,
                color: '#0F172A',
              }}>
              <span className="block text-xs truncate" style={{ color: on ? '#0F766E' : '#64748B' }}>{a.name}</span>
              <span className="font-semibold"><Money amount={a.due} /></span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
