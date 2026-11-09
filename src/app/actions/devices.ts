'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
// A 'use server' module may only export async functions — the RSC transform
// turns every export into a server action, and a re-exported type becomes a
// missing one at runtime while the typechecker stays happy. Importers take
// SilentAnalyzer from lib/lab/silent directly.
import { selectSilent, type AnalyzerPulse, type SilentAnalyzer } from '@/lib/lab/silent'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { actorCan, getActorProfile, requireModule, requireWriteAccess } from '@/lib/server-utils'
import {
  CloudflareError, deleteTunnel, provisionTunnel, removeTunnelHostname, tunnelsAvailable,
} from '@/lib/cloudflare/tunnel'
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
  /** How much has come through it — decides whether removing it loses history. */
  message_count: number
  /** Admin switch: may this computer serve files to the internet. */
  internet_access: boolean
  tunnel_hostname: string | null
  /** What the computer last said about its tunnel: off | starting | up | down | missing. */
  tunnel_state: string | null
  tunnel_state_at: string | null
  /** Admin switch: this computer collects the hospital's uploaded files (0275). */
  keep_uploads: boolean
  /** Uploaded files waiting to move here, and already here. */
  files_waiting: number
  files_kept: number
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

export interface ModalityRow {
  id: string
  ae_title: string
  modality: string | null
  manufacturer: string | null
  model: string | null
  station_name: string | null
  status: string
  last_study_at: string | null
  last_worklist_at: string | null
  first_seen_at: string
  studies: number
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

export interface ConnectorRelease {
  version: string
  file_name: string
  size_bytes: number
  sha256: string
  is_signed: boolean
  published_at: string
  url: string
}

// ── The installer ───────────────────────────────────────────────────────────

/**
 * Where a hospital gets the program.
 *
 * Returns null when nothing has been published, and the page then says so
 * plainly instead of offering a link that 404s.
 */
export async function getConnectorDownload(): Promise<ConnectorRelease | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('connector_releases')
    .select('version, file_path, file_name, size_bytes, sha256, is_signed, published_at')
    .eq('platform', 'windows')
    .eq('is_current', true)
    .maybeSingle()

  if (!data) return null

  // Derived, never stored: a stored URL strands every row if the project or
  // the CDN host ever changes.
  const { data: pub } = supabase.storage
    .from('connector-downloads')
    .getPublicUrl(data.file_path as string)

  return {
    version: data.version as string,
    file_name: data.file_name as string,
    size_bytes: Number(data.size_bytes),
    sha256: data.sha256 as string,
    is_signed: data.is_signed as boolean,
    published_at: data.published_at as string,
    url: pub.publicUrl,
  }
}

// ── Connectors ──────────────────────────────────────────────────────────────

export async function listConnectors(): Promise<ConnectorRow[]> {
  // Server-only since 0274: the row holds the scan-link signing key and the
  // token hash, so no browser session reads the table. The same people who
  // can open Settings → Devices see the list.
  const actor = await getActorProfile()
  if (!(await actorCan('lab:manage')) && !(await actorCan('lab:process'))) return []

  const svc = createServiceClient()
  const [{ data }, { data: msgs }] = await Promise.all([
    svc.from('connectors')
      .select('id, name, machine_name, lan_ip, listen_port, version, status, last_seen_at, paired_at, pairing_code, pairing_expires_at, internet_access, tunnel_hostname, tunnel_state, tunnel_state_at, keep_uploads')
      .eq('tenant_id', actor.tenant_id)
      .order('created_at'),
    svc.from('analyzer_messages').select('connector_id').eq('tenant_id', actor.tenant_id),
  ])
  const { data: files } = await svc.from('local_files').select('connector_id, status').eq('tenant_id', actor.tenant_id)
  const waiting = new Map<string, number>()
  const kept = new Map<string, number>()
  for (const f of files ?? []) {
    const key = f.connector_id as string | null
    if (!key) continue
    const m = f.status === 'on_computer' ? kept : waiting
    m.set(key, (m.get(key) ?? 0) + 1)
  }

  const seen = new Map<string, number>()
  for (const m of msgs ?? []) {
    const key = m.connector_id as string | null
    if (key) seen.set(key, (seen.get(key) ?? 0) + 1)
  }

  return (data ?? []).map((c) => ({
    ...c,
    internet_access: !!c.internet_access,
    keep_uploads: !!c.keep_uploads,
    files_waiting: waiting.get(c.id as string) ?? 0,
    files_kept: kept.get(c.id as string) ?? 0,
    message_count: seen.get(c.id as string) ?? 0,
  })) as ConnectorRow[]
}

/**
 * Switch on or off keeping the hospital's uploaded files on this computer:
 * patient documents, IPD declaration uploads and radiology report images
 * (0275). One computer per hospital — switching one on switches any other off,
 * so a file is never looked for on the wrong machine.
 *
 * Off only stops NEW uploads moving. Files already on the computer stay there:
 * nothing in Uyirly ever asks the computer to delete or send back a file.
 *
 * Admins only, like internet access: where patient files live is the owner's
 * decision.
 */
export async function setKeepUploads(id: string, on: boolean): Promise<SimpleResult> {
  const actor = await getActorProfile()
  if (actor.role !== 'admin') return { success: false, error: 'Only an admin can change where uploaded files are kept' }
  await requireWriteAccess()
  await requireModule('lab')

  const svc = createServiceClient()
  const { data: c } = await svc.from('connectors').select('id, name, status, paired_at, version')
    .eq('tenant_id', actor.tenant_id).eq('id', id).maybeSingle()
  if (!c) return { success: false, error: 'That computer is no longer here' }
  if (on && (c.status === 'revoked' || !c.paired_at)) {
    return { success: false, error: 'Connect this computer first, then switch this on' }
  }

  if (on) {
    await svc.from('connectors').update({ keep_uploads: false })
      .eq('tenant_id', actor.tenant_id).eq('keep_uploads', true).neq('id', id)
  }
  const { error } = await svc.from('connectors').update({ keep_uploads: on })
    .eq('tenant_id', actor.tenant_id).eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'connector', id, {
    action: on ? 'keep uploads on' : 'keep uploads off', name: c.name,
  })
  revalidatePath('/settings/devices')
  return { success: true }
}

/** Whether this Uyirly server has a Cloudflare account to make tunnels with. */
export async function getInternetAccessAvailable(): Promise<boolean> {
  return tunnelsAvailable()
}

/**
 * Switch a computer's internet access on or off.
 *
 * On: make (or reuse) its Cloudflare Tunnel and public hostname. The computer
 * learns of it on its next heartbeat, within a minute, starts cloudflared,
 * and scan links from outside the hospital begin to work once it reports the
 * tunnel up.
 *
 * Off: delete the hostname at Cloudflare. That closes the door at Cloudflare's
 * edge at once, whatever the hospital computer is doing; the computer stops
 * cloudflared on its next heartbeat. The tunnel is kept so switching back on
 * reuses it.
 *
 * Admins only. Putting a hospital's files on the internet is a decision about
 * patient data, not a laboratory setting.
 */
export async function setInternetAccess(id: string, on: boolean): Promise<SimpleResult> {
  const actor = await getActorProfile()
  if (actor.role !== 'admin') {
    return { success: false, error: 'Only an admin can change internet access' }
  }
  await requireWriteAccess()
  await requireModule('lab')

  const svc = createServiceClient()
  const { data: c } = await svc.from('connectors')
    .select('id, name, status, paired_at, internet_access, tunnel_id, tunnel_dns_record_id')
    .eq('tenant_id', actor.tenant_id).eq('id', id).maybeSingle()
  if (!c) return { success: false, error: 'That computer is no longer here' }

  if (on) {
    if (c.status === 'revoked' || !c.paired_at) {
      return { success: false, error: 'Connect this computer first, then switch internet access on' }
    }
    if (!tunnelsAvailable()) {
      return { success: false, error: 'Internet access is not set up on Uyirly yet. Please contact Uyirly support.' }
    }
    try {
      const t = await provisionTunnel(
        { connectorId: c.id as string, tunnelId: c.tunnel_id as string | null, dnsRecordId: c.tunnel_dns_record_id as string | null },
        async (step) => {
          await svc.from('connectors').update({
            ...(step.tunnelId ? { tunnel_id: step.tunnelId } : {}),
            ...(step.dnsRecordId ? { tunnel_dns_record_id: step.dnsRecordId } : {}),
            ...(step.hostname ? { tunnel_hostname: step.hostname } : {}),
          }).eq('id', c.id)
        },
      )
      const { error } = await svc.from('connectors').update({
        internet_access: true,
        tunnel_id: t.tunnelId,
        tunnel_hostname: t.hostname,
        tunnel_dns_record_id: t.dnsRecordId,
      }).eq('id', c.id)
      if (error) return { success: false, error: error.message }
    } catch (e) {
      return { success: false, error: e instanceof CloudflareError ? e.message : 'Could not set up internet access' }
    }
  } else {
    try {
      if (c.tunnel_dns_record_id) await removeTunnelHostname(c.tunnel_dns_record_id as string)
    } catch (e) {
      // Say so rather than pretend: the hostname may still be live.
      return { success: false, error: `Could not switch internet access off: ${(e as Error).message}` }
    }
    const { error } = await svc.from('connectors')
      .update({ internet_access: false, tunnel_dns_record_id: null })
      .eq('id', c.id)
    if (error) return { success: false, error: error.message }
  }

  await logAudit(actor.id, 'update', 'connector', id, {
    action: on ? 'internet access on' : 'internet access off', name: c.name,
  })
  revalidatePath('/settings/devices')
  return { success: true }
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
  await requireWriteAccess()
  await requireModule('lab')

  const trimmed = name.trim()
  if (!trimmed) return { success: false, error: 'Give this computer a name you will recognise' }
  if (trimmed.length > 60) return { success: false, error: 'That name is too long' }

  const svc = createServiceClient()
  const id = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MINUTES * 60_000).toISOString()

  // Codes are globally unique, so on the astronomically unlikely collision we
  // simply try again rather than handing out a code that belongs elsewhere.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generatePairingCode()
    const { error } = await svc.from('connectors').insert({
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
  await requireWriteAccess()
  await requireModule('lab')

  const svc = createServiceClient()
  const code = generatePairingCode()
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MINUTES * 60_000).toISOString()

  const { data: updated, error } = await svc.from('connectors')
    .update({ pairing_code: code, pairing_expires_at: expiresAt })
    .eq('tenant_id', actor.tenant_id).eq('id', id)
    .select('id')
  if (error) return { success: false, error: error.message }
  if (!updated?.length) return { success: false, error: 'That computer is no longer here' }

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
  await requireWriteAccess()
  await requireModule('lab')

  const svc = createServiceClient()
  const { data: c } = await svc.from('connectors')
    .select('id, tunnel_dns_record_id').eq('tenant_id', actor.tenant_id).eq('id', id).maybeSingle()
  if (!c) return { success: false, error: 'That computer is no longer here' }

  // A disconnected computer must not stay reachable from the internet. The
  // hostname goes first; if Cloudflare cannot be reached, say so and stop, so
  // nobody believes the door is shut when it is not.
  if (c.tunnel_dns_record_id) {
    try { await removeTunnelHostname(c.tunnel_dns_record_id as string) } catch (e) {
      return { success: false, error: `Could not take this computer off the internet: ${(e as Error).message}` }
    }
  }

  const { error } = await svc.from('connectors')
    .update({
      status: 'revoked', token_hash: null, pairing_code: null, pairing_expires_at: null,
      internet_access: false, tunnel_dns_record_id: null,
      // New uploads stay in the cloud; files already on it stay there.
      keep_uploads: false,
    })
    .eq('tenant_id', actor.tenant_id).eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'connector', id, { action: 'revoked' })
  revalidatePath('/settings/devices')
  return { success: true }
}

/**
 * Remove a connector entirely.
 *
 * Safe to do, which is worth stating plainly: both tables that reference a
 * connector are ON DELETE SET NULL, so every raw message and every discovered
 * analyzer survives — only the note of which computer relayed them is cleared.
 * A result's provenance points at the analyzer that produced it, not at the PC
 * in between, so nothing clinical is lost.
 *
 * Only a connector that is already disconnected may go. Removing one that is
 * still working would stop results arriving with no warning, so that is a
 * deliberate two-step: disconnect, then delete.
 */
export async function deleteConnector(id: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:manage')
  await requireWriteAccess()
  await requireModule('lab')

  const svc = createServiceClient()
  const { data: connector } = await svc
    .from('connectors').select('id, name, status, paired_at, tunnel_id, tunnel_dns_record_id')
    .eq('tenant_id', actor.tenant_id).eq('id', id).maybeSingle()
  if (!connector) return { success: false, error: 'That computer is no longer here' }

  const live = connector.status !== 'revoked' && !!connector.paired_at
  if (live) {
    return { success: false, error: 'Disconnect this computer before removing it' }
  }

  // Revoking already removed the hostname; this catches a row from before
  // that existed. The tunnel itself is deleted best-effort — Cloudflare keeps
  // it while the old PC is still connected, and with no hostname it serves
  // nothing.
  if (connector.tunnel_dns_record_id) {
    try { await removeTunnelHostname(connector.tunnel_dns_record_id as string) } catch (e) {
      return { success: false, error: `Could not take this computer off the internet: ${(e as Error).message}` }
    }
  }
  if (connector.tunnel_id) await deleteTunnel(connector.tunnel_id as string)

  const { error } = await svc.from('connectors').delete()
    .eq('tenant_id', actor.tenant_id).eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'delete', 'connector', id, { name: connector.name })
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
    supabase.from('analyzer_mappings').select('analyzer_id').is('analyte_id', null).eq('enabled', true),
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
 * Live analyzers that have gone quiet.
 *
 * An analyzer transmits once and forgets. Our disk-first guarantee only begins
 * when the message REACHES the connector — so if the link is down at that
 * moment the result is gone. It is recoverable from the instrument's own
 * memory, but only if somebody notices, and nothing told them.
 *
 * Over a cable a dead link is rare. Over Wi-Fi, which is how a hospital with
 * machines in three rooms will connect them, it is the main failure mode. This
 * is the difference between a system that is reliable and one that quietly
 * stopped working on Tuesday.
 *
 * The rule itself lives in lib/lab/silent.ts so it can be tested without a
 * hospital, a clock or a login.
 */
export async function listSilentAnalyzers(hours = 4): Promise<SilentAnalyzer[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lab_analyzers')
    .select('id, manufacturer, model, fingerprint, transport, status, last_message_at')
  return selectSilent((data ?? []) as AnalyzerPulse[], hours, new Date())
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
  await requireWriteAccess()
  await requireModule('lab')

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

// ── Scanners ────────────────────────────────────────────────────────────────

/**
 * The imaging machines that have introduced themselves.
 *
 * Same shape as the analyzer list, and for the same reason: a scanner
 * registers itself the first time it sends a study, and until this existed a
 * hospital had no way to see that it had — the row went into the database and
 * nothing in the product ever showed it. A radiology department could not tell
 * whether its CT was connected, when it last sent anything, or how to stop it.
 */
export async function listModalities(): Promise<ModalityRow[]> {
  const supabase = await createClient()
  const [{ data: modalities }, { data: studies }] = await Promise.all([
    supabase.from('radiology_modalities')
      .select('id, ae_title, modality, manufacturer, model, station_name, status, last_study_at, last_worklist_at, first_seen_at')
      .order('first_seen_at'),
    supabase.from('radiology_studies').select('modality_id'),
  ])

  const seen = new Map<string, number>()
  for (const st of studies ?? []) {
    const key = st.modality_id as string | null
    if (!key) continue
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }

  return (modalities ?? []).map((m) => ({
    ...m,
    studies: seen.get(m.id as string) ?? 0,
  })) as ModalityRow[]
}

/** Move a scanner between discovered, live and paused. Mirrors setAnalyzerStatus. */
export async function setModalityStatus(id: string, status: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:manage')
  await requireWriteAccess()
  await requireModule('radiology')

  // radiology_modalities has no quarantine state — a scanner either sends or
  // it does not, and there is no per-code mapping to hold back for review.
  if (!['discovered', 'live', 'paused'].includes(status)) {
    return { success: false, error: 'Unknown status' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('radiology_modalities').update({ status }).eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'radiology_modality', id, { status })
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
  await requirePermission(actor.role, 'lab:process')
  await requireWriteAccess()
  await requireModule('lab')
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

/**
 * Confirm several code mappings at once.
 *
 * Only ever called with the codes an instrument and the catalogue already
 * spell the same way — the screen decides that, and a looser guess is never
 * included. Twenty-four dropdowns in a laboratory, on somebody else's
 * computer, is how a five minute job becomes an afternoon and a mis-click.
 *
 * Each is still written as 'confirmed', because a person pressed the button
 * having read the list. Nothing here is automatic.
 */
export async function mapAnalyzerCodes(
  pairs: Array<{ mappingId: string; analyteId: string }>,
): Promise<{ success: true; mapped: number } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:process')
  await requireWriteAccess()
  await requireModule('lab')
  if (!pairs.length) return { success: false, error: 'Nothing to confirm' }

  const supabase = await createClient()
  let mapped = 0
  for (const { mappingId, analyteId } of pairs) {
    if (!mappingId || !analyteId) continue
    // One at a time rather than an upsert: these rows already exist, the list
    // is short, and a partial failure should leave the ones that worked
    // mapped rather than rolling the lot back for one bad id.
    const { error } = await supabase.from('analyzer_mappings')
      .update({ analyte_id: analyteId, source: 'confirmed' })
      .eq('id', mappingId)
    if (!error) mapped += 1
  }

  await logAudit(actor.id, 'update', 'analyzer_mapping', null, { bulk: true, mapped })
  revalidatePath('/settings/devices')
  return mapped > 0
    ? { success: true, mapped }
    : { success: false, error: 'None of those could be saved' }
}

/** Some codes are genuinely not ours to record — internal flags, QC channels. */
export async function ignoreAnalyzerCode(mappingId: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:process')
  await requireWriteAccess()
  await requireModule('lab')

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
  await requirePermission(actor.role, 'lab:process')
  await requireWriteAccess()
  await requireModule('lab')

  const supabase = await createClient()
  // Read through the user's own client first, so RLS proves this message
  // belongs to the actor's hospital before the service role touches anything.
  const { data: msg } = await supabase
    .from('analyzer_messages')
    .select('id, tenant_id, connector_id, raw_message, source')
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
    // The same source as the first attempt, or a replay would compute a
    // different stand-in identity and create a second analyzer for one machine.
    source: (msg.source as string | null) ?? null,
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
  await requirePermission(actor.role, 'lab:process')
  await requireWriteAccess()
  await requireModule('lab')

  const supabase = await createClient()
  const { error } = await supabase.from('analyzer_messages')
    .update({ status: 'ignored' }).eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'analyzer_message', id, { action: 'ignored' })
  revalidatePath('/settings/devices')
  return { success: true }
}
