'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { isNoteFieldKey } from '@/lib/noteFields'
import { STARTER_PHRASES } from '@/lib/noteStarterPhrases'
import type { ClinicalTemplate, NoteTemplate } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

const MAX_BODY = 600

/**
 * The phrases on offer in one note box.
 *
 * Ordered by how often this hospital has actually used them, which is the only
 * curation the library gets and the only one it needs: after a fortnight the
 * top rows are the words the doctors here really write.
 *
 * `department` narrows to one specialty's phrases plus the shared ones. A
 * dental room should not have to scroll past obstetric findings, but most
 * phrases suit everyone and those are stored with department NULL.
 */
export async function listNoteTemplates(
  fieldKey: string,
  department?: ClinicalTemplate | null,
): Promise<NoteTemplate[]> {
  if (!isNoteFieldKey(fieldKey)) return []

  const supabase = await createClient()
  let q = supabase
    .from('note_templates')
    .select('id, field_key, label, body, department, use_count')
    .eq('field_key', fieldKey)
    .order('use_count', { ascending: false })
    .order('label', { ascending: true })
    .limit(40)
  // NULL department means "every room", so it is always included.
  if (department) q = q.or(`department.is.null,department.eq.${department}`)
  else q = q.is('department', null)

  const { data, error } = await q
  // A picker that silently shows nothing looks identical to an empty library,
  // which is how a broken read goes unnoticed for weeks. Say it out loud.
  if (error) {
    console.error('listNoteTemplates', fieldKey, error.message)
    return []
  }
  return (data ?? []) as NoteTemplate[]
}

/**
 * The hospital's whole library, for the screen that manages it.
 *
 * Alphabetical by box and then by name rather than by use, because this is the
 * list someone reads to find a phrase and fix it — a different job from the
 * picker, where the most-used belongs on top.
 */
export async function listAllNoteTemplates(): Promise<NoteTemplate[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('note_templates')
    .select('id, field_key, label, body, department, use_count')
    .order('field_key', { ascending: true })
    .order('label', { ascending: true })
  if (error) {
    console.error('listAllNoteTemplates', error.message)
    return []
  }
  return (data ?? []) as NoteTemplate[]
}

/**
 * Keep a phrase. Called from the note box itself, with the text the doctor has
 * just written — which is the route that actually fills the library, so it has
 * to work without a visit to any settings screen.
 */
export async function saveNoteTemplate(input: {
  field_key: string
  label: string
  body: string
  department?: ClinicalTemplate | null
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()

  if (!isNoteFieldKey(input.field_key)) return { success: false, error: 'Unknown note field' }
  const label = input.label.trim()
  const body  = input.body.trim()
  if (!label) return { success: false, error: 'Give the phrase a short name' }
  if (!body)  return { success: false, error: 'Nothing to save' }
  // Phrases, not paragraphs. A template long enough to be a whole note is how
  // records fill with findings nobody examined for.
  if (body.length > MAX_BODY) {
    return { success: false, error: `Keep a phrase under ${MAX_BODY} characters` }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('note_templates')
    .insert({
      tenant_id:  actor.tenant_id,
      field_key:  input.field_key,
      label,
      body,
      department: input.department ?? null,
      created_by: actor.id,
    })
    .select('id')
    .single()

  if (error) {
    // The unique index is case-folded, so this is the common and recoverable
    // case: somebody already keeps this phrase under this name.
    if (error.code === '23505') return { success: false, error: 'A phrase with that name already exists here' }
    return { success: false, error: error.message }
  }

  await logAudit(actor.id, 'create', 'note_template', data.id as string, { field_key: input.field_key, label })
  return { success: true, id: data.id as string }
}

/**
 * Count a use. Fire-and-forget from the picker: the doctor's tap must insert
 * the text immediately, and a phrase whose counter is one behind is not worth
 * a moment of their time.
 */
export async function useNoteTemplate(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('bump_note_template_use', { p_id: id })
  if (error) console.error('useNoteTemplate', id, error.message)
}

/**
 * Add the ready-made set, once, on purpose.
 *
 * Only into boxes that are still empty. A hospital that has already written
 * its own CVS phrases does not want ours appearing underneath them, and a
 * doctor who pressed this twice should not get everything doubled.
 *
 * Deliberately a button and not a seed at signup: these sentences end up in a
 * signed medical record, so a clinician accepts them rather than finding them
 * already there.
 */
export async function addStarterPhrases(): Promise<
  { success: true; added: number; skipped: string[] } | { success: false; error: string }
> {
  await requireWriteAccess()
  const actor = await getActorProfile()

  const supabase = await createClient()
  const { data: existing, error: readErr } = await supabase
    .from('note_templates').select('field_key')
  if (readErr) return { success: false, error: readErr.message }

  const taken = new Set((existing ?? []).map((r) => r.field_key as string))
  const skipped: string[] = []
  const toAdd: Array<Record<string, unknown>> = []

  for (const [fieldKey, list] of Object.entries(STARTER_PHRASES)) {
    if (taken.has(fieldKey)) { skipped.push(fieldKey); continue }
    for (const p of list ?? []) {
      toAdd.push({
        tenant_id: actor.tenant_id, field_key: fieldKey,
        label: p.label, body: p.body, department: null, created_by: actor.id,
      })
    }
  }

  if (toAdd.length === 0) return { success: true, added: 0, skipped }

  const { error } = await supabase.from('note_templates').insert(toAdd)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'create', 'note_template', 'starter-set', { added: toAdd.length })
  return { success: true, added: toAdd.length, skipped }
}

/** Change a phrase's name or its words. */
export async function updateNoteTemplate(
  id: string,
  input: { label: string; body: string },
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()

  const label = input.label.trim()
  const body  = input.body.trim()
  if (!label) return { success: false, error: 'Give the phrase a short name' }
  if (!body)  return { success: false, error: 'A phrase cannot be empty' }
  if (body.length > MAX_BODY) return { success: false, error: `Keep a phrase under ${MAX_BODY} characters` }

  const supabase = await createClient()
  const { error } = await supabase
    .from('note_templates')
    .update({ label, body, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) {
    if (error.code === '23505') return { success: false, error: 'A phrase with that name already exists here' }
    return { success: false, error: error.message }
  }

  await logAudit(actor.id, 'update', 'note_template', id, { label })
  return { success: true }
}

/**
 * Remove a phrase.
 *
 * The library is shared across the hospital, so a phrase one doctor added is a
 * phrase every doctor sees. Anyone who can write notes can retire a bad one —
 * the alternative is a wrong phrase sitting in the picker until an admin is
 * free, which is worse for the record than a deletion that can be re-typed.
 */
export async function deleteNoteTemplate(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()

  const supabase = await createClient()
  const { error } = await supabase.from('note_templates').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'delete', 'note_template', id, {})
  return { success: true }
}
