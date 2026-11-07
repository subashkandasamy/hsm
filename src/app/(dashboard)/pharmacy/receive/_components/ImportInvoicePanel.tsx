'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { AlertTriangle, FileUp, Loader2, X } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Select from '@/components/ui/Select'
import { matchInvoiceNames, type NameMatch } from '@/app/actions/pharmacy'
import {
  detectHeader, parseDelimited, readRows,
  INVOICE_FIELDS, applyMrpBasis, detectMrpBasis,
  checkFile, hasBlocking,
  type ColumnMap, type MrpBasis, type ParsedInvoiceRow,
} from '@/lib/pharmacy/invoiceFile'

export interface ImportedLine { row: ParsedInvoiceRow; match: NameMatch }

const input: React.CSSProperties = {
  border: '1px solid #E2E8F0', borderRadius: '0.5rem', padding: '0.4rem 0.55rem',
  fontSize: '0.875rem', color: '#0F172A', background: '#fff', width: '100%', minHeight: '38px',
}
const btn = (primary = false): React.CSSProperties => primary
  ? { background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }
  : { background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }

export default function ImportInvoicePanel({ onLoad, onClose }: {
  onLoad: (lines: ImportedLine[]) => void
  onClose: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<string[][] | null>(null)
  const [headerIndex, setHeaderIndex] = useState(0)
  const [map, setMap] = useState<ColumnMap>({})
  const [error, setError] = useState('')
  const [mrpBasis, setMrpBasis] = useState<MrpBasis | null>(null)
  const [isPending, startTransition] = useTransition()

  function read(raw: string, name: string) {
    setError(''); setFileName(name)
    const parsed = parseDelimited(raw)
    if (parsed.length < 2) { setError('That file has no rows in it.'); setRows(null); return }
    const found = detectHeader(parsed)
    setRows(parsed)
    setHeaderIndex(found.headerIndex >= 0 ? found.headerIndex : 0)
    setMap(found.map)
    if (found.headerIndex < 0) setError('Could not tell which column is which — set them below.')
  }

  async function onFile(f: File) {
    if (f.size > 4_000_000) { setError('That file is too big — 4 MB is the limit.'); return }
    read(await f.text(), f.name)
  }

  const headerCells = rows?.[headerIndex] ?? []
  const raw = useMemo(
    () => (rows ? readRows(rows, headerIndex, map) : []),
    [rows, headerIndex, map],
  )
  const detected = useMemo(() => detectMrpBasis(raw), [raw])
  const basis = mrpBasis ?? detected
  const preview = useMemo(() => applyMrpBasis(raw, basis), [raw, basis])
  const perPackShown = raw.some((r) => Number(r.packSize) > 1 && Number(r.mrp))
  const missing = INVOICE_FIELDS.filter((f) => f.needed && map[f.key] == null)

  // Everything wrong with the file, found before a single line is loaded. Rows
  // under the header that readRows threw away are counted so the skip is said
  // out loud rather than silently changing the total.
  const dataRows = rows ? Math.max(0, rows.length - headerIndex - 1) : 0
  const issues = useMemo(
    () => (rows ? checkFile(preview, map, { skipped: Math.max(0, dataRows - preview.length) }) : []),
    [rows, preview, map, dataRows],
  )
  const blocked = hasBlocking(issues)
  const toFix = issues.filter((i) => i.level === 'fix')
  const fixRows = new Set(toFix.flatMap((i) => i.lines)).size

  function load() {
    if (!preview.length) { setError('No medicine rows found under that header.'); return }
    if (blocked) { setError('Fix the file first — see the list above.'); return }
    setError('')
    startTransition(async () => {
      const matches = await matchInvoiceNames(preview.map((r) => r.name))
      onLoad(preview.map((row, i) => ({ row, match: matches[i] })))
    })
  }

  return (
    <GlassCard className="p-4 mb-4">
      <div className="flex items-start gap-2 mb-3">
        <div className="flex-1">
          <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>Import the distributor&apos;s invoice</p>
          <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
            A CSV file from the distributor, or copy the rows straight out of Excel and paste them here.
            Every line lands in the form below for you to check before anything is saved.
          </p>
        </div>
        <button onClick={onClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {!rows && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium" style={btn(true)}>
              <FileUp className="w-4 h-4" /> Choose a CSV file
            </button>
            <span className="text-xs" style={{ color: '#94A3B8' }}>or paste below</span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text')
              if (pasted.includes('\n')) { e.preventDefault(); setText(pasted); read(pasted, 'pasted rows') }
            }}
            rows={4}
            placeholder={'Item\tBatch\tExp\tQty\tRate\tMRP\nDOLO 650 TAB\tB2291\t09/28\t10\t80\t2.50'}
            style={{ ...input, minHeight: 96, fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem' }} />
          {text.trim() && (
            <button onClick={() => read(text, 'pasted rows')} className="px-3 py-2 rounded-xl text-sm font-medium" style={btn()}>
              Read these rows
            </button>
          )}
        </div>
      )}

      {rows && (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: '#64748B' }}>
            <span className="font-medium" style={{ color: '#334155' }}>{fileName}</span> · {rows.length} rows ·
            header on row {headerIndex + 1}
            <button onClick={() => { setRows(null); setText(''); setFileName('') }}
              className="ml-2 underline" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0D9488' }}>
              choose another
            </button>
          </p>

          {/* Column mapping */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {INVOICE_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="block text-xs font-medium mb-1" style={{ color: f.needed ? '#334155' : '#94A3B8' }}>
                  {f.label}{f.needed ? ' *' : ''}
                </span>
                <Select value={map[f.key] == null ? '' : String(map[f.key])}
                  onChange={(e) => setMap((m) => {
                    const v = e.target.value
                    const next = { ...m }
                    if (v === '') delete next[f.key]
                    else next[f.key] = Number(v)
                    return next
                  })}>
                  <option value="">— not in the file —</option>
                  {headerCells.map((c, i) => (
                    <option key={i} value={String(i)}>{c || `Column ${i + 1}`}</option>
                  ))}
                </Select>
              </label>
            ))}
          </div>

          {/* What is wrong with the file, before anything is loaded */}
          {issues.length > 0 && (
            <div className="rounded-xl p-3 text-xs" style={{
              border: `1px solid ${blocked ? '#FECACA' : toFix.length ? '#FDE68A' : '#E2E8F0'}`,
              background: blocked ? '#FEF2F2' : toFix.length ? '#FFFBEB' : '#F8FAFC',
            }}>
              <p className="font-medium mb-2" style={{ color: blocked ? '#991B1B' : toFix.length ? '#92400E' : '#475569' }}>
                {blocked
                  ? 'This file cannot be imported yet'
                  : toFix.length
                    ? `${fixRows} row${fixRows === 1 ? '' : 's'} will be refused when you save — correct them in the file and load it again`
                    : 'Worth knowing'}
              </p>
              <ul className="space-y-1.5">
                {issues.map((it, i) => (
                  <li key={i} style={{ color: '#334155' }}>
                    <span style={{
                      color: it.level === 'blocking' ? '#DC2626' : it.level === 'fix' ? '#B45309' : '#64748B',
                      fontWeight: 500,
                    }}>
                      {it.level === 'note' ? '·' : '•'} {it.title}
                    </span>
                    {it.lines.length > 0 && (
                      <span style={{ color: '#64748B' }}>
                        {' '}— {it.lines.length} row{it.lines.length === 1 ? '' : 's'}:
                        {' '}line {it.lines.slice(0, 12).join(', ')}
                        {it.lines.length > 12 ? ` and ${it.lines.length - 12} more` : ''}
                      </span>
                    )}
                    {it.example && (
                      <span className="block mt-0.5" style={{ color: '#64748B', paddingLeft: '0.9rem' }}>
                        e.g. {it.example}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2" style={{ color: '#64748B' }}>
                Line numbers are the rows of <strong>{fileName || 'the file'}</strong> as your
                spreadsheet shows them.
              </p>
            </div>
          )}

          {/* What that mapping produces */}
          {preview.length > 0 && (
            <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid #E2E8F0' }}>
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', color: '#64748B' }}>
                    {['Medicine', 'Batch', 'Expiry', 'Qty', 'Free', 'Rate', 'MRP'].map((h) => (
                      <th key={h} className="text-left px-2.5 py-1.5 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 3).map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #F1F5F9', color: '#0F172A' }}>
                      <td className="px-2.5 py-1.5">{r.name}</td>
                      <td className="px-2.5 py-1.5">{r.batch || <Gap />}</td>
                      <td className="px-2.5 py-1.5">{r.expiry || <Gap />}</td>
                      <td className="px-2.5 py-1.5">{r.packs || <Gap />}</td>
                      <td className="px-2.5 py-1.5">{r.free || '0'}</td>
                      <td className="px-2.5 py-1.5">{r.rate || <Gap />}</td>
                      <td className="px-2.5 py-1.5">{r.mrp || <Gap />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {perPackShown && (
            <label className="flex items-center gap-2 text-xs flex-wrap" style={{ color: '#334155' }}>
              <span className="font-medium">The MRP column is per</span>
              <span style={{ width: 150, display: 'inline-block' }}>
                <Select value={basis} onChange={(e) => setMrpBasis(e.target.value as MrpBasis)}>
                  <option value="unit">tablet / unit</option>
                  <option value="pack">strip / pack</option>
                </Select>
              </span>
              <span style={{ color: '#94A3B8' }}>
                {basis === 'pack'
                  ? 'divided by the pack size to get the price a patient pays per tablet'
                  : 'used as the price a patient pays per tablet'}
                {mrpBasis == null ? ' — worked out from the rates' : ''}
              </span>
            </label>
          )}

          {missing.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-lg" style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              Still to set: {missing.map((f) => f.label).join(', ')} — you can also fill those in the form afterwards.
            </p>
          )}
          {error && <p className="text-xs font-medium" style={{ color: '#B91C1C' }}>{error}</p>}

          <div className="flex items-center gap-2">
            <button onClick={load} disabled={isPending || !preview.length || blocked}
              className="px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5"
              style={{ ...btn(true), opacity: isPending || !preview.length || blocked ? 0.7 : 1 }}>
              {isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Matching medicines…</>
                : blocked
                  ? 'Fix the file first'
                  : toFix.length
                    ? `Load ${preview.length} lines anyway`
                    : `Load ${preview.length} line${preview.length === 1 ? '' : 's'}`}
            </button>
            <span className="text-xs" style={{ color: '#94A3B8' }}>Nothing is saved until you press Receive stock.</span>
          </div>
        </div>
      )}
    </GlassCard>
  )
}

const Gap = () => <span style={{ color: '#CBD5E1' }}>—</span>
