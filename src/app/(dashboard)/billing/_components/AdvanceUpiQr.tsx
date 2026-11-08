'use client'

import { useEffect, useState } from 'react'
import UpiCollectPanel from './UpiCollectPanel'
import { getAdvanceCollectAccount } from '@/app/actions/admissionBilling'

type Account = { key: string; name: string; vpa: string | null; payeeName: string }

/**
 * The QR for an IPD advance deposit (0268): the whole deposit goes into the
 * one account the admin chose for advances — main unless set otherwise. The
 * deposit is recorded against that same account on the server.
 */
export default function AdvanceUpiQr({ amount, admissionId }: {
  amount: number
  admissionId: string
}) {
  // Our reference on the bank statement: short, letters and digits only.
  const reference = admissionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase()
  const [account, setAccount] = useState<Account | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    getAdvanceCollectAccount()
      .then((res) => {
        if (!live) return
        if (res.success) setAccount(res.account)
        else setError(res.error)
      })
      .catch(() => { if (live) setError('Could not work out which account takes advances.') })
    return () => { live = false }
  }, [])

  if (error) return <p className="text-xs w-full" style={{ color: '#DC2626' }}>{error}</p>
  if (!account) return <p className="text-xs w-full" style={{ color: '#94A3B8' }}>Loading the payment QR…</p>
  return (
    <div className="w-full">
      <UpiCollectPanel
        vpa={account.vpa}
        payeeName={account.payeeName}
        amount={amount}
        billNo={`ADV${reference}`}
        note={`Advance ${reference}`}
        accountName={account.key === 'main' ? undefined : account.name}
      />
    </div>
  )
}
