'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import { generatePairingCode, PAIRING_TTL_MINUTES } from '@/lib/lab/pairing'
import { processMessage } from '@/lib/lab/ingest'
import { revalidatePath } from 'next/cache'

type SimpleResult = { success: true } | { success: false; error: string }

export interface ConnectorRow {
  id: string
  name: string
  machine_name: string | null
  lan_ip: string | null
  listen_port: number
  version: string | null
  status: string
  last_seen_at: string | null
  paired_at: string | null
  pairing_code: string | null
  pairing_expires_at: string | null
}

export interface AnalyzerRow {
  id: string
  manufacturer: string | null
  model: string | null
  fingerprint: string | null
  protocol: string | null
  transport: string | null
  status: string
  last_message_at: string | null
  first_seen_at: string
  unknown_codes: number
}

export interface UnknownCode {
  mapping_id: string
  analyzer_id: string
  analyzer_label: string
  analyzer_code: string
  unit_ucum: string | null
  times_seen: number
  last_value: string | null
  last_seen: string | null
}

export interface UnmatchedMessage {
  id: string
  received_at: string
  sample_barcode: string | null
  analyzer_label: string
  patient_name: string | null
  result_count: number
  status: string
  error: string | null
}

export interface AnalyteOption {
  id: string
  code: string
  name: string
  unit_ucum: string | null
}

// ── Connectors ──────────────────────────────────────────────────────────────

export async function listConnectors(): Promise<ConnectorRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('connectors')
    .select('id, name, machine_name, lan_ip, listen_port, version, status, last_seen_at, paired_at, pairing_code, pairing_expires_at')
    .order('created_at')
  return (data ?? []) as ConnectorRow[]
}

/**
 * Create a connector and hand back a code to type into the installer.
 *
 * No token is produced here. The connector generates its own identity when it
 * claims the code, so a token never travels through a browser, an email or a
 * support conversation.
 */
export async function createConnector(
  name: string,
): Promise<{ success: true; code: string; expiresAt: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:manage')

  const trimmed = name.trim()
  if (!trimmed) return { success: false, error: 'Give this computer a name you will recognise' }
  if (trimmed.length > 60) return { success: false, error: 'That name is too long' }

  const supabase = await createClient()
  const id = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MINUTES * 60_000).toISOString()

  // Codes are globally unique, so on the astronomically unlikely collision we
  // simply try again rather than handing out a code that belongs elsewhere.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generatePairingCode()
    const { error } = await supabase.from('connectors').insert({
      id,
      tenant_id: actor.tenant_id,
      name: trimmed,
      pairing_code: code,
      pairing_expires_at: expiresAt,
      status: 'pending',
      created_by: actor.id,
    })
    if (!error) {
      await logAudit(actor.id, 'create', 'connector', id, { name: trimmed })
      revalidatePath('/settings/devices')
      return { success: true, code, expiresAt }
    }
    if (error.code !== '23505') return { success: false, error: error.message }
  }
  return { success: false, error: 'Could not generate a pairing code. Try again.' }
}

/** Issue a fresh code — the old one is replaced, never kept alongside. */
export async function regeneratePairingCode(
  id: string,
): Promise<{ success: true; code: string; expiresAt: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:manage')

  const supabase = await createClient()
  const code = generatePairingCode()
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MINUTES * 60_000).toISOString()

  const { error } = await supabase.from('connectors')
    .update({ pairing_code: code, pairing_expires_at: expiresAt })
    .eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'connector', id, { action: 'new pairing code' })
  revalidatePath('/settings/devices')
  return { success: true, code, expiresAt }
}

/**
 * Revoke a connector.
 *
 * The row survives so its messages keep their history — this is a laboratory
 * record, and deleting the thing that produced a result would take the result's
 * provenance with it. The token stops working immediately.
 */
export async function revokeConnector(id: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:manage')

  const supabase = await createClient()
  const { error } = await supabase.from('connectors')
    .update({ status: 'revoked', token_hash: null, pairing_code: null, pairing_expires_at: null })
    .eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'connector', id, { action: 'revoked' })
  revalidatePath('/settings/devices')
  return { success: true }
}

// ── Analyzers ───────────────────────────────────────────────────────────────

export async function listAnalyzers(): Promise<AnalyzerRow[]> {
  const supabase = await createClient()
  const [{ data: analyzers }, { data: unknown }] = await Promise.all([
    supabase.from('lab_analyzers')
      .select('id, manufacturer, model, fingerprint, protocol, transport, status, last_message_at, first_seen_at')
      .order('first_seen_at'),
    supabase.from('analyzer_mappings').select('analyzer_id').is('analyte_id', null),
  ])

  const pending = new Map<string, number>()
  for (const m of unknown ?? []) {
    const key = m.analyzer_id as string
    pending.set(key, (pending.get(key) ?? 0) + 1)
  }

  return (analyzers ?? []).map((a) => ({
    ...a,
    unknown_codes: pending.get(a.id as string) ?? 0,
  })) as AnalyzerRow[]
}

/**
 * Move an analyzer between discovered, live and paused.
 *
 * Going live is a deliberate act by a person who has looked at what the machine
 * sends. It does not change whether results are released to anyone — that still
 * needs authorisation — it changes whether this instrument's traffic is trusted
 * enough to reach a chart at all.
 */
export async function setAnalyzerStatus(id: string, status: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:manage')

  if (!['discovered', 'quarantine', 'live', 'paused'].includes(status)) {
    return { success: false, error: 'Unknown status' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('lab_analyzers').update({ status }).eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'lab_analyzer', id, { status })
  revalidatePath('/settings/devices')
  return { success: true }
}

// ── The unknown-code queue ──────────────────────────────────────────────────

export async function listUnknownCodes(): Promise<UnknownCode[]> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('get_unknown_analyzer_codes')
  return (data ?? []) as UnknownCode[]
}

/** The analyte list, for the picker. Global — a haemoglobin is a haemoglobin. */
export async function listAnalytes(): Promise<AnalyteOption[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lab_analytes')
    .select('id, code, name, unit_ucum')
    .eq('is_active', true)
    .order('name')
  return (data ?? []) as AnalyteOption[]
}

/**
 * Teach the system what one of this machine's codes means.
 *
 * Marked 'confirmed' rather than 'library', because a person looked at it. A
 * later library update must never quietly overwrite a hospital's own answer.
 */
export async function mapAnalyzerCode(
  mappingId: string,
  analyteId: string,
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:manage')
  if (!analyteId) return { success: false, error: 'Choose what this code measures' }

  const supabase = await createClient()
  const { error } = await supabase.from('analyzer_mappings')
    .update({ analyte_id: analyteId, source: 'confirmed' })
    .eq('id', mappingId)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'analyzer_mapping', mappingId, { analyte_id: analyteId })
  revalidatePath('/settings/devices')
  return { success: true }
}

/** Some codes are genuinely not ours to record — internal flags, QC channels. */
export async function ignoreAnalyzerCode(mappingId: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:manage')

  const supabase = await createClient()
  const { error } = await supabase.from('analyzer_mappings')
    .update({ enabled: false, source: 'confirmed' })
    .eq('id', mappingId)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'analyzer_mapping', mappingId, { action: 'ignored' })
  revalidatePath('/settings/devices')
  return { success: true }
}

// ── The unmatched-sample queue ──────────────────────────────────────────────

export async function listUnmatchedMessages(): Promise<UnmatchedMessage[]> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('get_unmatched_messages')
  return (data ?? []) as UnmatchedMessage[]
}

/**
 * Try a stored message again.
 *
 * Used after a person has mapped a code or corrected a barcode. Nothing is
 * asked of the analyzer — the original bytes were kept precisely so that the
 * second attempt costs nothing and the first attempt is never lost.
 *
 * Runs as the service role because processMessage writes results, and the
 * tenant is taken from the message's own row and passed explicitly. The
 * database checks it: an order belonging to another hospital is refused.
 */
export async function retryMessage(
  id: string,
  barcode?: string,
): Promise<{ success: true; status: string; written?: number; error?: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:manage')

  const supabase = await createClient()
  // Read through the user's own client first, so RLS proves this message
  // belongs to the actor's hospital before the service role touches anything.
  const { data: msg } = await supabase
    .from('analyzer_messages')
    .select('id, tenant_id, connector_id, raw_message')
    .eq('id', id)
    .maybeSingle()
  if (!msg) return { success: false, error: 'That message is no longer here' }

  const svc = createServiceClient()

  if (barcode !== undefined) {
    const trimmed = barcode.trim()
    if (!trimmed) return { success: false, error: 'Enter the barcode from the tube' }
    // Confirm the barcode is one of this hospital's before writing it on.
    const { data: sample } = await supabase
      .from('lab_samples').select('id').eq('barcode', trimmed).maybeSingle()
    if (!sample) return { success: false, error: `No tube here has barcode ${trimmed}` }
    await svc.from('analyzer_messages').update({ sample_barcode: trimmed }).eq('id', id)
  }

  const outcome = await processMessage(svc, {
    tenantId: msg.tenant_id as string,
    connectorId: (msg.connector_id as string | null) ?? null,
    messageId: id,
    raw: msg.raw_message as string,
  })

  await logAudit(actor.id, 'update', 'analyzer_message', id, {
    action: 'retried', result: outcome.status, barcode: barcode ?? null,
  })
  revalidatePath('/settings/devices')
  revalidatePath('/lab')
  return { success: true, status: outcome.status, written: outcome.written, error: outcome.error }
}

/** Not ours — a control run, another hospital's tube, a test transmission. */
export async function ignoreMessage(id: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:manage')

  const supabase = await createClient()
  const { error } = await supabase.from('analyzer_messages')
    .update({ status: 'ignored' }).eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'analyzer_message', id, { action: 'ignored' })
  revalidatePath('/settings/devices')
  return { success: true }
}
