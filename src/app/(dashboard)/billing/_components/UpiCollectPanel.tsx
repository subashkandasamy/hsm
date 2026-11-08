'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Monitor, MonitorOff, QrCode } from 'lucide-react'
import QrRenderer from '@/components/barcode/QrRenderer'
import { buildUpiIntent, ON_SCREEN_QR_PX } from '@/lib/upi'
import * as display from '@/lib/counterDisplay'

/**
 * Shown inside Record Payment when the method is UPI.
 *
 * Two ways for the patient to get at the same instruction: the ₹1,900 USB
 * counter display, or the QR on this screen for a hospital that has none (the
 * cashier turns the monitor). Both encode the identical `upi://` string, so
 * there is one payee and one amount however it is shown.
 *
 * Nothing here records a payment. The money moves bank-to-bank and tells us
 * nothing, so the cashier still marks it received — see the note at the foot.
 */
export default function UpiCollectPanel({ vpa, payeeName, amount, billNo, accountName }: {
  vpa: string | null | undefined
  payeeName: string
  amount: number
  billNo: string
  /** Set when collecting into one of the hospital's other accounts (0267), not the main one. */
  accountName?: string
}) {
  const [connected, setConnected] = useState(false)
  const [busy, setBusy]           = useState(false)
  const [msg, setMsg]             = useState<{ ok: boolean; text: string } | null>(null)
  const [onScreen, setOnScreen]   = useState(false)
  // Almost no hospital owns the USB display, so its button is not put in front
  // of everyone. It appears once this browser has been granted a device, or if
  // the cashier asks for it by the link below.
  const [wantDevice, setWantDevice] = useState(false)

  const supported = display.isSupported()
  const intent = buildUpiIntent({
    vpa: vpa ?? '', payeeName, amount, note: `Bill ${billNo}`, ref: billNo,
  })

  // Re-adopt a port this browser was already granted, so the cashier connects
  // once per machine rather than once per bill.
  useEffect(() => {
    let live = true
    display.adopt().then((ok) => {
      if (!live) return
      setConnected(ok)
      if (ok) setWantDevice(true)
    }).catch(() => {})
    return () => { live = false }
  }, [])

  if (!vpa) {
    return (
      <div className="px-3 py-2.5 rounded-xl text-sm" style={{
        background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A', lineHeight: 1.5,
      }}>
        <strong style={{ display: 'block', marginBottom: '2px' }}>
          {accountName ? `${accountName} has no UPI id` : 'No UPI id set yet'}
        </strong>
        {accountName ? 'An admin can add it under' : <>Add your hospital&rsquo;s UPI id under</>}{' '}
        <Link href={accountName ? '/settings/billing' : '/settings/profile'} style={{ color: '#0D9488', fontWeight: 600, textDecoration: 'underline' }}>
          {accountName ? 'Billing & Collections' : 'Hospital Profile'}
        </Link>{' '}
        and bills can show a payment QR with the amount already filled in.
      </div>
    )
  }

  if (!intent) {
    return (
      <div className="px-3 py-2.5 rounded-xl text-sm" style={{ background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' }}>
        Enter an amount above to show a payment QR.
      </div>
    )
  }

  async function handleConnect() {
    setBusy(true); setMsg(null)
    const res = await display.connect()
    setBusy(false)
    setConnected(display.isConnected())
    if (!res.ok && res.error) setMsg({ ok: false, text: res.error })
  }

  async function handleShow() {
    setBusy(true); setMsg(null)
    const res = await display.showQr({ intent: intent!, amount, vpa: vpa! })
    setBusy(false)
    setConnected(display.isConnected())
    setMsg(res.ok
      ? { ok: true, text: `Showing ₹${amount.toFixed(2)} on the counter display.` }
      : { ok: false, text: res.error })
  }

  return (
    <div className="rounded-xl p-3" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
        {supported && wantDevice && (connected
          ? (
            <button type="button" onClick={handleShow} disabled={busy}
              className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: busy ? '#94A3B8' : '#0D9488', border: 'none', cursor: 'pointer', minHeight: '40px' }}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Monitor className="w-4 h-4" />}
              Show on counter display
            </button>
          )
          : (
            <button type="button" onClick={handleConnect} disabled={busy}
              className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium"
              style={{ border: '1px solid #E2E8F0', background: '#fff', color: '#475569', cursor: 'pointer', minHeight: '40px' }}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MonitorOff className="w-4 h-4" />}
              Connect counter display
            </button>
          ))}

        <button type="button" onClick={() => setOnScreen((v) => !v)}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium"
          style={{ border: '1px solid #E2E8F0', background: '#fff', color: '#475569', cursor: 'pointer', minHeight: '40px' }}>
          <QrCode className="w-4 h-4" />
          {onScreen ? 'Hide QR' : 'Show QR on screen'}
        </button>
      </div>

      {supported && !wantDevice && (
        <button type="button" onClick={() => setWantDevice(true)}
          className="text-xs mt-2"
          style={{ color: '#0D9488', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
          I have a USB counter display
        </button>
      )}

      {!supported && (
        <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>
          A USB counter display needs Chrome or Edge on the counter computer. The on-screen QR works anywhere.
        </p>
      )}

      {msg && (
        <p className="text-xs mt-2" style={{ color: msg.ok ? '#0D9488' : '#DC2626' }}>{msg.text}</p>
      )}

      {onScreen && (
        <div className="mt-3 flex flex-col items-center gap-2">
          {/* The white frame is the QR's quiet zone. Without it, a dark surround
              defeats a good number of phone cameras. */}
          <div style={{ background: '#fff', padding: '12px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <QrRenderer value={intent} size={ON_SCREEN_QR_PX} />
          </div>
          <p className="text-xs text-center" style={{ color: '#64748B' }}>
            ₹{amount.toFixed(2)} to <span style={{ fontFamily: 'monospace' }}>{vpa}</span>{accountName ? ` — ${accountName}` : ''}
          </p>
        </div>
      )}

      <p className="text-xs mt-3" style={{ color: '#94A3B8', lineHeight: 1.5 }}>
        The patient pays your bank directly, so Uyirly is not told when it lands. Once their app shows it paid, record
        it below — and put the UTR in Reference if they can read it out, so this matches your bank statement later.
      </p>
    </div>
  )
}
