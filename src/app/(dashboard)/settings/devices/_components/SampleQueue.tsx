'use client'

import { useState, useTransition } from 'react'
import { FileQuestion, RotateCw, EyeOff } from 'lucide-react'
import Input from '@/components/ui/Input'
import { retryMessage, ignoreMessage, type UnmatchedMessage } from '@/app/actions/devices'

/**
 * Results that arrived for a tube we do not have.
 *
 * Usually the barcode was typed into the analyzer by hand and a digit is wrong,
 * or the sample was run before the order was raised. Occasionally it is a
 * quality-control run, which is not a patient at all.
 *
 * Nothing here is guessed onto the nearest order. A haemoglobin on the wrong
 * chart is far worse than a haemoglobin nobody can find, so this waits for a
 * person — and because the original message was stored before anything tried to
 * understand it, resolving one costs nothing and the analyzer is not involved.
 *
 * The name the machine carried is shown only to help that person recognise the
 * sample. It is never matched on.
 */
export default function SampleQueue({
  messages, onChange,
}: {
  messages: UnmatchedMessage[]
  onChange: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [openId, setOpenId] = useState<string | null>(null)
  const [barcode, setBarcode] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  if (!messages.length) return null

  // Two different problems used to share one heading. A message whose codes
  // are unknown had already found its patient, so "Attach to a patient" did
  // nothing and the hospital had no way to tell why.
  const noPatient = messages.filter((m) => m.status !== 'unmapped')
  const noCodes = messages.filter((m) => m.status === 'unmapped')
  const countOf = (list: UnmatchedMessage[]) =>
    list.reduce((n, m) => n + (m.result_count || 0), 0)

  function attach(m: UnmatchedMessage) {
    setError(''); setNote('')
    startTransition(async () => {
      const res = await retryMessage(m.id, barcode)
      if (!res.success) { setError(res.error); return }
      if (res.status === 'matched') {
        setOpenId(null); setBarcode('')
        onChange()
      } else {
        setNote(res.error ?? `Still could not attach it (${res.status}).`)
        onChange()
      }
    })
  }

  function retry(m: UnmatchedMessage) {
    setError(''); setNote('')
    startTransition(async () => {
      const res = await retryMessage(m.id)
      if (!res.success) { setError(res.error); return }
      if (res.status !== 'matched') setNote(res.error ?? `Still unresolved (${res.status}).`)
      onChange()
    })
  }

  function ignore(m: UnmatchedMessage) {
    startTransition(async () => {
      await ignoreMessage(m.id)
      onChange()
    })
  }

  return (
    <section className="mb-6">
      {noPatient.length > 0 && (
      <div className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid #BFDBFE', background: '#EFF6FF' }}>
        <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid #BFDBFE' }}>
          <FileQuestion className="w-4 h-4 flex-shrink-0" style={{ color: '#1D4ED8' }} />
          <p className="text-sm font-semibold" style={{ color: '#1E3A8A' }}>
            {countOf(noPatient)} result{countOf(noPatient) === 1 ? '' : 's'} could not be matched to a patient
          </p>
        </div>

        <div className="px-4 py-2.5" style={{ background: '#fff', borderBottom: '1px solid #DBEAFE' }}>
          <p className="text-xs" style={{ color: '#64748B' }}>
            These are safely stored and nothing was guessed. Enter the barcode from
            the tube to attach them to the right patient.
          </p>
        </div>

        {noPatient.map((m) => (
          <div key={m.id} className="px-4 py-3" style={{ background: '#fff', borderTop: '1px solid #DBEAFE' }}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {m.sample_barcode ? (
                <span className="text-sm font-mono font-semibold" style={{ color: '#0F172A' }}>
                  {m.sample_barcode}
                </span>
              ) : (
                <span className="text-sm font-semibold" style={{ color: '#B45309' }}>No barcode sent</span>
              )}
              {m.patient_name && (
                <span className="text-xs" style={{ color: '#475569' }}>
                  machine said &ldquo;{m.patient_name}&rdquo;
                </span>
              )}
              <span className="text-xs" style={{ color: '#94A3B8' }}>
                {m.result_count} measurement{m.result_count === 1 ? '' : 's'} · {m.analyzer_label}
              </span>

              <div className="flex gap-1.5 ml-auto">
                {openId !== m.id && (
                  <button onClick={() => { setOpenId(m.id); setBarcode(m.sample_barcode ?? ''); setError(''); setNote('') }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: '#1D4ED8', color: '#fff', border: 'none', cursor: 'pointer' }}>
                    Attach to a patient
                  </button>
                )}
                <button onClick={() => retry(m)} disabled={isPending} title="Try again"
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"
                  style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                  <RotateCw className="w-3 h-3" /> Try again
                </button>
                <button onClick={() => ignore(m)} disabled={isPending} title="Not a patient sample"
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"
                  style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                  <EyeOff className="w-3 h-3" />
                </button>
              </div>
            </div>

            {m.error && (
              <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>{m.error}</p>
            )}

            {openId === m.id && (
              <div className="mt-3 rounded-lg p-3" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#475569' }}>
                  Barcode printed on the tube
                </label>
                <div className="flex flex-wrap gap-2">
                  <div className="flex-1 min-w-[200px]">
                    <Input value={barcode} onChange={(e) => setBarcode(e.target.value)}
                      placeholder="260923000101" autoFocus />
                  </div>
                  <button onClick={() => attach(m)} disabled={isPending}
                    className="px-4 py-2 rounded-lg text-xs font-semibold"
                    style={{ background: isPending ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none' }}>
                    {isPending ? 'Attaching…' : 'Attach'}
                  </button>
                  <button onClick={() => { setOpenId(null); setError(''); setNote('') }}
                    className="px-3 py-2 rounded-lg text-xs font-medium"
                    style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
                    Cancel
                  </button>
                </div>
                {error && <p className="text-xs mt-2" style={{ color: '#DC2626' }}>{error}</p>}
                {note && <p className="text-xs mt-2" style={{ color: '#B45309' }}>{note}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
      )}

      {noCodes.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #FDE68A', background: '#FFFBEB' }}>
          <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid #FDE68A' }}>
            <FileQuestion className="w-4 h-4 flex-shrink-0" style={{ color: '#B45309' }} />
            <p className="text-sm font-semibold" style={{ color: '#92400E' }}>
              {countOf(noCodes)} result{countOf(noCodes) === 1 ? '' : 's'} waiting on a measurement you have not identified
            </p>
          </div>
          <div className="px-4 py-2.5" style={{ background: '#fff', borderBottom: '1px solid #FEF3C7' }}>
            <p className="text-xs" style={{ color: '#64748B' }}>
              These found their patient. Answer the measurements above and they will
              go through by themselves — there is nothing to attach.
            </p>
          </div>
          {noCodes.map((m) => (
            <div key={m.id} className="px-4 py-3" style={{ background: '#fff', borderTop: '1px solid #FEF3C7' }}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-mono font-semibold" style={{ color: '#0F172A' }}>
                  {m.sample_barcode}
                </span>
                <span className="text-xs" style={{ color: '#94A3B8' }}>
                  {m.result_count} measurement{m.result_count === 1 ? '' : 's'} · {m.analyzer_label}
                </span>
                <div className="flex gap-1.5 ml-auto">
                  <button onClick={() => retry(m)} disabled={isPending}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1"
                    style={{ background: '#B45309', color: '#fff', border: 'none', cursor: 'pointer' }}>
                    <RotateCw className="w-3 h-3" /> Try again
                  </button>
                  <button onClick={() => ignore(m)} disabled={isPending} title="Not a patient sample"
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                    <EyeOff className="w-3 h-3" />
                  </button>
                </div>
              </div>
              {m.error && <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>{m.error}</p>}
            </div>
          ))}
          {note && <p className="text-xs px-4 py-2" style={{ background: '#fff', color: '#B45309' }}>{note}</p>}
        </div>
      )}
    </section>
  )
}
