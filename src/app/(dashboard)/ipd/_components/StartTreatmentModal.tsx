'use client'

import { useState, useRef, useEffect } from 'react'
import { Printer, PenTool, ClipboardList, Loader2, Eraser } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import { signDeclarationDigitally, markManualPendingUpload } from '@/app/actions/ipdDeclaration'
import type { IpdDeclarationSignerRelationship } from '@/lib/types'

interface Props {
  admissionId: string
  patientName: string
  onClose: () => void
  onDone: () => void
}

const RELATIONSHIPS: { value: IpdDeclarationSignerRelationship; label: string }[] = [
  { value: 'self',   label: 'Self (Patient)' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'parent', label: 'Parent' },
  { value: 'child',  label: 'Child' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'other',  label: 'Other' },
]

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasDrawn = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#0F172A'
  }, [])

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    hasDrawn.current = true
  }
  function end() {
    if (!drawing.current) return
    drawing.current = false
    onChange(hasDrawn.current ? canvasRef.current!.toDataURL('image/png') : null)
  }
  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    hasDrawn.current = false
    onChange(null)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={440}
        height={140}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full rounded-xl touch-none"
        style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', height: '140px', cursor: 'crosshair' }}
      />
      <button type="button" onClick={clear}
        className="mt-1.5 flex items-center gap-1 text-xs font-medium" style={{ color: '#64748B' }}>
        <Eraser className="w-3.5 h-3.5" /> Clear signature
      </button>
    </div>
  )
}

export default function StartTreatmentModal({ admissionId, patientName, onClose, onDone }: Props) {
  const [mode, setMode] = useState<'choose' | 'sign' | 'manual'>('choose')
  const [signerName, setSignerName] = useState('')
  const [relationship, setRelationship] = useState<IpdDeclarationSignerRelationship>('self')
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSign() {
    if (!signerName.trim()) { setError('Signer name is required'); return }
    // A "digital signature" with nothing drawn printed as signed with no mark
    // anywhere (BUG-015). No paper to sign? Use "Sign on paper" instead.
    if (!signatureData) { setError('Ask the signer to sign in the box'); return }
    setSubmitting(true); setError(null)
    const res = await signDeclarationDigitally({ admissionId, signerName, signerRelationship: relationship, signatureData })
    setSubmitting(false)
    if (!res.success) { setError(res.error); return }
    onDone()
  }

  async function handleManual() {
    if (!signerName.trim()) { setError('Signer name is required'); return }
    setSubmitting(true); setError(null)
    const res = await markManualPendingUpload({ admissionId, signerName, signerRelationship: relationship })
    setSubmitting(false)
    if (!res.success) { setError(res.error); return }
    onDone()
  }

  return (
    <Modal open onClose={onClose} title={`Treatment Declaration — ${patientName}`} maxWidth="34rem">
      <div className="space-y-4">
        <a
          href={`/print/ipd/${admissionId}/declaration/pdf`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium w-fit"
          style={{ background: '#F1F5F9', color: '#475569' }}
        >
          <Printer className="w-4 h-4" /> Print / view declaration text
        </a>

        {error && <div className="px-3 py-2 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#EF4444' }}>{error}</div>}

        {mode === 'choose' && (
          <div className="grid grid-cols-1 gap-3">
            <button onClick={() => setMode('sign')}
              className="flex items-start gap-3 p-4 rounded-xl text-left"
              style={{ border: '1px solid #E2E8F0' }}>
              <PenTool className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#0D9488' }} />
              <div>
                <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>Sign digitally now</p>
                <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Patient or relative signs on screen. Treatment unlocks immediately.</p>
              </div>
            </button>
            <button onClick={() => setMode('manual')}
              className="flex items-start gap-3 p-4 rounded-xl text-left"
              style={{ border: '1px solid #E2E8F0' }}>
              <ClipboardList className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#B45309' }} />
              <div>
                <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>Mark manual — upload later</p>
                <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                  For urgent cases. Treatment unlocks immediately; a signed physical copy must be uploaded
                  later. Shows an amber &quot;pending upload&quot; badge until then.
                </p>
              </div>
            </button>
          </div>
        )}

        {(mode === 'sign' || mode === 'manual') && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>
                Signer Name <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                type="text" value={signerName} onChange={(e) => setSignerName(e.target.value)}
                placeholder="Full name of patient or relative"
                className="w-full px-3 py-3 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#0F172A', minHeight: '44px', outline: 'none' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Relationship to Patient</label>
              <Select value={relationship} onChange={(e) => setRelationship(e.target.value as IpdDeclarationSignerRelationship)}>
                {RELATIONSHIPS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </div>

            {mode === 'sign' && (
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>
                  Signature <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <SignaturePad onChange={setSignatureData} />
              </div>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setMode('choose')} className="px-4 py-2.5 rounded-xl text-sm"
                style={{ border: '1px solid #E2E8F0', color: '#475569', minHeight: '44px' }}>Back</button>
              <button
                onClick={mode === 'sign' ? handleSign : handleManual}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: submitting ? '#94A3B8' : '#0D9488', minHeight: '44px' }}
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {mode === 'sign' ? 'Sign & Start Treatment' : 'Mark Pending & Start Treatment'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
