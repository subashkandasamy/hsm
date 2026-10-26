'use client'

import { useState } from 'react'
import { Pencil, Trash2, Plus, Check, X } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { NOTE_FIELDS, NOTE_FIELD_GROUPS, type NoteFieldKey } from '@/lib/noteFields'
import {
  saveNoteTemplate, updateNoteTemplate, deleteNoteTemplate, listAllNoteTemplates,
  addStarterPhrases,
} from '@/app/actions/noteTemplates'
import { STARTER_COUNT } from '@/lib/noteStarterPhrases'
import type { NoteTemplate } from '@/lib/types'

/**
 * The shared library, laid out the way a consultation runs.
 *
 * Most phrases arrive from the note box itself — a doctor keeps what they have
 * just written — so this screen is for the tidying afterwards: fixing wording,
 * retiring a phrase somebody added by mistake, and seeing what the hospital has
 * accumulated. Empty boxes are listed too, because the gaps are the useful part
 * of the picture.
 */
export default function PhraseManager({ initial }: { initial: NoteTemplate[] }) {
  const [rows, setRows]       = useState(initial)
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding]   = useState<NoteFieldKey | null>(null)
  const [label, setLabel]     = useState('')
  const [body, setBody]       = useState('')
  const [error, setError]     = useState('')
  const [busy, setBusy]       = useState(false)
  const [confirm, setConfirm] = useState<NoteTemplate | null>(null)
  const [starter, setStarter] = useState(false)
  const [added, setAdded]     = useState<number | null>(null)

  async function reload() {
    setRows(await listAllNoteTemplates())
  }

  function startEdit(t: NoteTemplate) {
    setAdding(null); setEditing(t.id); setLabel(t.label); setBody(t.body); setError('')
  }
  function startAdd(key: NoteFieldKey) {
    setEditing(null); setAdding(key); setLabel(''); setBody(''); setError('')
  }
  function cancel() {
    setEditing(null); setAdding(null); setLabel(''); setBody(''); setError('')
  }

  async function commit() {
    setBusy(true); setError('')
    const res = editing
      ? await updateNoteTemplate(editing, { label, body })
      : await saveNoteTemplate({ field_key: adding!, label, body })
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    cancel()
    await reload()
  }

  async function remove() {
    if (!confirm) return
    setBusy(true)
    const res = await deleteNoteTemplate(confirm.id)
    setBusy(false)
    setConfirm(null)
    if (!res.success) { setError(res.error); return }
    await reload()
  }

  async function starterSet() {
    setBusy(true); setError('')
    const res = await addStarterPhrases()
    setBusy(false)
    setStarter(false)
    if (!res.success) { setError(res.error); return }
    setAdded(res.added)
    await reload()
  }

  const form = (
    <div className="p-3 rounded-xl" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Short name, e.g. Normal CVS"
        autoFocus
        className="w-full px-2.5 py-1.5 rounded-lg text-sm mb-2"
        style={{ border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none' }}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="The words that go into the note, e.g. S1 S2 heard, no murmur"
        rows={2}
        className="w-full px-2.5 py-1.5 rounded-lg text-sm"
        style={{ border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', resize: 'vertical' }}
      />
      {error && <p className="text-xs mt-1.5" style={{ color: '#DC2626' }}>{error}</p>}
      <div className="flex gap-2 mt-2">
        <button
          type="button" onClick={() => void commit()} disabled={busy || !label.trim() || !body.trim()}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
          style={{
            background: '#0D9488', color: '#fff', border: 'none',
            opacity: busy || !label.trim() || !body.trim() ? 0.5 : 1,
            cursor: busy || !label.trim() || !body.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          <Check className="w-3.5 h-3.5" />{busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button" onClick={cancel}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
          style={{ background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}
        >
          <X className="w-3.5 h-3.5" />Cancel
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      {rows.length === 0 && added === null && (
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>
            Start with a ready-made set
          </h2>
          <p className="text-sm mb-3" style={{ color: '#64748B' }}>
            {STARTER_COUNT} everyday phrases for a general OPD — normal findings, common
            histories and handover lines. Read them first: they go into your patients&rsquo;
            records, so edit or remove anything you would not write yourself. Where a
            number or a side belongs, the phrase leaves a blank.
          </p>
          <button
            type="button" onClick={() => setStarter(true)} disabled={busy}
            className="px-3.5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}
          >
            Add the starter phrases
          </button>
          {error && <p className="text-xs mt-2" style={{ color: '#DC2626' }}>{error}</p>}
        </GlassCard>
      )}

      {added !== null && (
        <GlassCard className="p-4">
          <p className="text-sm" style={{ color: '#0F172A' }}>
            {added > 0
              ? `Added ${added} phrases. Go through them and change anything that is not how you write it.`
              : 'Nothing to add — these boxes already have phrases of their own.'}
          </p>
        </GlassCard>
      )}

      {NOTE_FIELD_GROUPS.map((group) => (
        <GlassCard key={group.label} className="p-5">
          <h2 className="text-sm font-semibold mb-4" style={{ color: '#0F172A' }}>{group.label}</h2>

          <div className="space-y-4">
            {group.keys.map((key) => {
              const mine = rows.filter((r) => r.field_key === key)
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>
                      {NOTE_FIELDS[key]}
                    </span>
                    <button
                      type="button" onClick={() => startAdd(key)}
                      className="text-xs font-semibold flex items-center gap-1"
                      style={{ background: 'none', border: 'none', color: '#0D9488', cursor: 'pointer' }}
                    >
                      <Plus className="w-3.5 h-3.5" />Add
                    </button>
                  </div>

                  {mine.length === 0 && adding !== key && (
                    <p className="text-xs italic" style={{ color: '#CBD5E1' }}>
                      Nothing kept here yet.
                    </p>
                  )}

                  <div className="space-y-1.5">
                    {mine.map((t) => (
                      editing === t.id ? <div key={t.id}>{form}</div> : (
                        <div
                          key={t.id}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl"
                          style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid #E2E8F0' }}
                        >
                          <div className="flex-1" style={{ minWidth: 0 }}>
                            <p className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>{t.label}</p>
                            <p className="text-xs truncate" style={{ color: '#64748B' }}>{t.body}</p>
                          </div>
                          {/* Used-how-often, because it is the only reason the
                              picker puts one phrase above another. */}
                          <span className="text-xs tabular-nums" style={{ color: '#94A3B8' }}>
                            {t.use_count > 0 ? `used ${t.use_count}×` : 'unused'}
                          </span>
                          <button
                            type="button" onClick={() => startEdit(t)} title="Edit"
                            style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button" onClick={() => setConfirm(t)} title="Remove"
                            style={{ background: 'none', border: 'none', color: '#CBD5E1', cursor: 'pointer' }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )
                    ))}
                    {adding === key && form}
                  </div>
                </div>
              )
            })}
          </div>
        </GlassCard>
      ))}

      <ConfirmDialog
        open={starter}
        onClose={() => setStarter(false)}
        onConfirm={() => void starterSet()}
        title="Add the starter phrases?"
        description={`${STARTER_COUNT} phrases will be added for everyone in this hospital, in the boxes that are still empty. You can edit or remove any of them afterwards.`}
        confirmLabel="Add them"
        confirmVariant="primary"
        loading={busy}
      />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => void remove()}
        title="Remove this phrase?"
        description={confirm
          ? `“${confirm.label}” will no longer be offered to anyone in this hospital. Notes already written keep their words.`
          : ''}
        confirmLabel="Remove"
        loading={busy}
      />
    </div>
  )
}
