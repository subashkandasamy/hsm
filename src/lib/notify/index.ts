import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import type { NotificationChannel, NotificationRefType } from '@/lib/types'

// ── Provider interface ────────────────────────────────────────────────────────
// Swap this implementation for any BSP (Gupshup, Interakt, AiSensy, Twilio,
// MSG91) by replacing sendWhatsApp / sendSms without touching callers.

interface ProviderResult { messageId: string | null; error: string | null }

async function sendWhatsApp(
  phone: string,
  templateName: string | null,
  params: string[]
): Promise<ProviderResult> {
  // Stub: replace the body of this function with real BSP HTTP call.
  // The provider_template_name from notification_templates must be pre-approved
  // by Meta / the BSP before this will actually deliver messages.
  console.log('[Notify/WhatsApp stub]', { phone, templateName, params })
  if (!templateName) return { messageId: null, error: 'Template not configured for WhatsApp' }
  // Simulate success for development
  return { messageId: `wa_${Date.now()}`, error: null }
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
    .select('id, phone, notify_whatsapp_consent, notify_sms_consent')
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
    result = await sendWhatsApp(patient.phone, template?.provider_template_name ?? null, input.params)
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
