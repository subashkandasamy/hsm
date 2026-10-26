'use client'

import { useState, useRef, useEffect } from 'react'
import { ListPlus, Trash2, Check, X } from 'lucide-react'
import {
  listNoteTemplates, saveNoteTemplate, useNoteTemplate, deleteNoteTemplate,
} from '@/app/actions/noteTemplates'
import type { ClinicalTemplate, NoteTemplate } from '@/lib/types'

interface Props {
  fieldKey: string
  department?: ClinicalTemplate | null
  /** What is in the box now — what "save this as a phrase" would keep. */
  currentText: string
  onInsert: (text: string) => void
}

/**
 * The phrases kept for one note box, one tap away from the box itself.
 *
 * Deliberately not a settings screen. A doctor with a patient in front of them
 * will not go and curate a library, so both halves of this — using a phrase and
 * keeping one — have to live where the typing happens or they do not happen at
 * all.
 */
export default function PhrasePicker({ fieldKey, department, currentText, onInsert }: Props) {
  const [open, setOpen]         = useState(false)
  const [rows, setRows]         = useState<NoteTemplate[] | null>(null)
  const [naming, setNaming]     = useState(false)
  const [label, setLabel]       = useState('')
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Loaded on first open, not on mount: a consultation page carries a dozen of
  // these and most are never opened.
  useEffect(() => {
    if (!open || rows !== null) return
    let alive = true
    listNoteTemplates(fieldKey, department).then((r) => { if (alive) setRows(r) })
    return () => { alive = false }
  }, [open, rows, fieldKey, department])

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    // Escape as well as clicking away: a doctor who opened this by accident
    // should not have to find somewhere safe on the page to click.
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function close() {
    setOpen(false)
    setNaming(false)
    setLabel('')
    setError('')
  }

  function pick(t: NoteTemplate) {
    onInsert(t.body)
    // Counting the use is what sorts the list next time, but the doctor should
    // never wait for it.
    void useNoteTemplate(t.id)
    setRows((rs) => rs && rs.map((r) => (r.id === t.id ? { ...r, use_count: r.use_count + 1 } : r)))
    close()
  }

  async function save() {
    setBusy(true)
    setError('')
    const res = await saveNoteTemplate({
      field_key: fieldKey, label, body: currentText, department: department ?? null,
    })
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    setRows(null)   // re-read, so the new phrase appears in its sorted place
    setNaming(false)
    setLabel('')
  }

  async function remove(id: string) {
    setBusy(true)
    const res = await deleteNoteTemplate(id)
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    setRows((rs) => rs && rs.filter((r) => r.id !== id))
  }

  const canSaveCurrent = currentText.trim().length > 0

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        title="Saved phrases"
        className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
        style={{
          background: open ? 'rgba(13,148,136,0.16)' : 'rgba(13,148,136,0.08)',
          color: open ? '#0D9488' : '#64748B',
          border: `1px solid ${open ? '#99F6E4' : '#E2E8F0'}`,
          cursor: 'pointer',
        }}
      >
        <ListPlus className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 rounded-xl overflow-hidden"
          style={{
            background: '#fff',
            border: '1px solid #E2E8F0',
            boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
            width: '280px',
            maxWidth: 'calc(100vw - 2rem)',
          }}
        >
          <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
            {rows === null && (
              <p className="px-3 py-3 text-xs" style={{ color: '#94A3B8' }}>Loading…</p>
            )}
            {rows?.length === 0 && (
              <p className="px-3 py-3 text-xs" style={{ color: '#94A3B8' }}>
                No phrases here yet. Write one and keep it below.
              </p>
            )}
            {rows?.map((t) => (
              <div
                key={t.id}
                className="flex items-stretch"
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <button
                  type="button"
                  onClick={() => pick(t)}
                  className="flex-1 px-3 py-2 text-left"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', minWidth: 0 }}
                >
                  <span className="block text-sm font-medium truncate" style={{ color: '#0F172A' }}>{t.label}</span>
                  <span className="block text-xs truncate" style={{ color: '#64748B' }}>{t.body}</span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  disabled={busy}
                  title="Remove this phrase"
                  className="px-2 flex items-center"
                  style={{ background: 'none', border: 'none', color: '#CBD5E1', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#DC2626' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#CBD5E1' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid #F1F5F9' }}>
            {naming ? (
              <div className="p-2">
                <p className="text-xs mb-1.5 line-clamp-2" style={{ color: '#64748B' }}>
                  Keeping: “{currentText.trim()}”
                </p>
                <div className="flex gap-1.5">
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && label.trim() && !busy) void save() }}
                    placeholder="Short name, e.g. Normal CVS"
                    autoFocus
                    className="flex-1 px-2 py-1.5 rounded-lg text-sm"
                    style={{ border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', minWidth: 0 }}
                  />
                  <button
                    type="button" onClick={() => void save()} disabled={busy || !label.trim()}
                    title="Keep it"
                    className="w-8 rounded-lg flex items-center justify-center"
                    style={{
                      background: '#0D9488', color: '#fff', border: 'none',
                      opacity: busy || !label.trim() ? 0.5 : 1,
                      cursor: busy || !label.trim() ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    type="button" onClick={() => { setNaming(false); setError('') }}
                    title="Cancel"
                    className="w-8 rounded-lg flex items-center justify-center"
                    style={{ background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setNaming(true)}
                disabled={!canSaveCurrent}
                className="w-full px-3 py-2.5 text-sm text-left"
                style={{
                  background: 'none', border: 'none',
                  color: canSaveCurrent ? '#0D9488' : '#CBD5E1',
                  cursor: canSaveCurrent ? 'pointer' : 'not-allowed',
                  fontWeight: 500,
                }}
                title={canSaveCurrent ? '' : 'Write something in the box first'}
              >
                + Keep what I just wrote
              </button>
            )}
            {error && <p className="px-3 pb-2 text-xs" style={{ color: '#DC2626' }}>{error}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
