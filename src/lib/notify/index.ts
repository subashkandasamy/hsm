import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import type { NotificationChannel, NotificationRefType } from '@/lib/types'

// ── Provider interface ────────────────────────────────────────────────────────
// WhatsApp is delivered via the Meta WhatsApp Cloud API (direct, no BSP markup).
// SMS is still a stub — swap sendSms for MSG91/Twilio when SMS fallback is wanted.
//
// Required env for live WhatsApp delivery (until these are set, sendWhatsApp
// stays in stub mode so nothing breaks pre-configuration):
//   WHATSAPP_PHONE_NUMBER_ID   – the Cloud API phone number id (Meta app)
//   WHATSAPP_ACCESS_TOKEN      – Bearer token for the WhatsApp Business account
// Optional:
//   WHATSAPP_API_VERSION       – Graph API version (default 'v21.0')
//   WHATSAPP_TEMPLATE_LANG     – template language code (default 'en_US';
//                                MUST match the language of the approved template)
//   WHATSAPP_DEFAULT_CC        – country code prepended to bare local numbers
//                                (default '91' for India)

interface ProviderResult { messageId: string | null; error: string | null }

// Normalise a stored phone into the digits-with-country-code form Meta expects
// (e.g. '+91 97397 84611' → '919739784611'). Returns null if unusable.
function normalizePhone(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length < 8) return null // too short to be a real number
  const cc = process.env.WHATSAPP_DEFAULT_CC || '91'
  if (digits.length === 10) return cc + digits               // bare local → prepend CC
  if (digits.startsWith('0')) return cc + digits.replace(/^0+/, '')
  return digits                                              // assume already has CC
}

async function sendWhatsApp(
  phone: string,
  templateName: string | null,
  params: string[]
): Promise<ProviderResult> {
  // The tenant must set provider_template_name (an approved Meta template) first.
  if (!templateName) return { messageId: null, error: 'Template not configured for WhatsApp' }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_ACCESS_TOKEN

  // Not configured yet → keep prior stub behaviour so dev/demo works without creds.
  if (!phoneNumberId || !token) {
    console.log('[Notify/WhatsApp stub — Meta not configured]', { phone, templateName, params })
    return { messageId: `wa_stub_${Date.now()}`, error: null }
  }

  const to = normalizePhone(phone)
  if (!to) return { messageId: null, error: `Invalid recipient phone: "${phone}"` }

  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0'
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || 'en_US'

  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: lang },
      // Body variables ({{1}}, {{2}}…) only when the template actually has them.
      ...(params.length
        ? { components: [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: p })) }] }
        : {}),
    },
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[]
      error?: { message?: string }
    }
    if (!res.ok) {
      return { messageId: null, error: `WhatsApp: ${json?.error?.message ?? `HTTP ${res.status}`}` }
    }
    return { messageId: json?.messages?.[0]?.id ?? null, error: null }
  } catch (e) {
    return { messageId: null, error: `WhatsApp request failed: ${e instanceof Error ? e.message : String(e)}` }
  }
}

async function sendSms(phone: string, body: string): Promise<ProviderResult> {
  // Stub: replace with MSG91 / Twilio / D7Networks call.
  console.log('[Notify/SMS stub]', { phone, body: body.slice(0, 160) })
  return { messageId: `sms_${Date.now()}`, error: null }
}

// ── Core notify function ──────────────────────────────────────────────────────

interface NotifyInput {
  patientId: string
  channel: NotificationChannel
  templateKey: string
  params: string[]
  refType: NotificationRefType
  refId: string | null
  actorId: string
}

interface NotifyResult {
  success: boolean
  notificationId?: string
  error?: string
  fallback?: boolean
}

export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const supabase = await createClient()

  // 1. Fetch patient + consent
  const { data: patient } = await supabase
    .from('patients')
    .select('id, phone, tenant_id, notify_whatsapp_consent, notify_sms_consent')
    .eq('id', input.patientId)
    .single()

  if (!patient) return { success: false, error: 'Patient not found' }

  // 2. Consent check
  const hasConsent = input.channel === 'whatsapp'
    ? patient.notify_whatsapp_consent
    : patient.notify_sms_consent

  // If no primary consent, try fallback to SMS
  let channel = input.channel
  let fallback = false
  if (!hasConsent) {
    if (input.channel === 'whatsapp' && patient.notify_sms_consent) {
      channel = 'sms'
      fallback = true
    } else {
      return { success: false, error: `Patient has not opted in for ${input.channel} notifications` }
    }
  }

  // 3. Resolve template
  const { data: tpl } = await supabase
    .from('notification_templates')
    .select('*')
    .eq('key', input.templateKey)
    .eq('channel', channel)
    .eq('is_active', true)
    .maybeSingle()

  if (!tpl) {
    // Try the other channel's template as fallback
    const { data: altTpl } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('key', input.templateKey)
      .eq('is_active', true)
      .maybeSingle()
    if (!altTpl) return { success: false, error: `No active template for key "${input.templateKey}"` }
  }

  const template = tpl

  // 4. Insert queued notification
  const notifId = crypto.randomUUID()
  await supabase.from('notifications').insert({
    id: notifId,
    tenant_id: (patient as Record<string, unknown>).tenant_id,
    patient_id: input.patientId,
    channel,
    template_key: input.templateKey,
    recipient_phone: patient.phone,
    ref_type: input.refType,
    ref_id: input.refId,
    status: 'queued',
    sent_by: input.actorId,
  })

  // 5. Send
  let result: ProviderResult
  if (channel === 'whatsapp') {
    // Meta template name: explicit provider_template_name override, else the
    // template key itself (tenants name their approved Meta templates to match).
    const metaTemplate = template?.provider_template_name || input.templateKey
    result = await sendWhatsApp(patient.phone, metaTemplate, input.params)
  } else {
    // Build SMS body from body_preview with substitutions
    const body = (template?.body_preview ?? input.params.join(' — ')).replace(
      /\{\{(\d+)\}\}/g, (_m: string, i: string) => input.params[parseInt(i) - 1] ?? ''
    )
    result = await sendSms(patient.phone, body)
  }

  // 6. Update status
  const status = result.error ? 'failed' : 'sent'
  await supabase.from('notifications').update({
    status,
    provider_message_id: result.messageId,
    error: result.error,
  }).eq('id', notifId)

  // 7. WhatsApp failure → auto-fallback to SMS
  if (result.error && channel === 'whatsapp' && patient.notify_sms_consent) {
    return notify({ ...input, channel: 'sms' })
  }

  await logAudit(input.actorId, 'send', 'notification', notifId, {
    templateKey: input.templateKey, channel, status, fallback,
  })

  return {
    success: !result.error,
    notificationId: notifId,
    error: result.error ?? undefined,
    fallback,
  }
}
