'use server'

import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import {
  normalizePhone, setPatientSession, clearPatientSession, getPatientSession,
} from '@/lib/patientAuth'

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

// Deliver the OTP over WhatsApp. Until an approved WhatsApp Authentication
// template + live number are wired, this returns false and the caller falls
// back to a dev code so the flow is fully testable now.
async function sendOtpViaWhatsApp(phone: string, code: string): Promise<boolean> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const template = process.env.WHATSAPP_OTP_TEMPLATE // e.g. 'patient_login_otp' (auth category)
  if (!phoneNumberId || !token || !template) return false
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0'
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || 'en_US'
  try {
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: template,
          language: { code: lang },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: code }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
          ],
        },
      }),
    })
    return res.ok
  } catch { return false }
}

// ── Step 1: request an OTP for a phone ────────────────────────────────────────
export async function requestPatientOtp(
  phoneRaw: string,
): Promise<{ success: true; devCode?: string } | { success: false; error: string }> {
  const phone = normalizePhone(phoneRaw)
  if (!phone) return { success: false, error: 'Enter a valid mobile number' }

  const svc = createServiceClient()
  // Rate limit: max 5 codes per phone per 15 minutes.
  const since = new Date(Date.now() - 15 * 60000).toISOString()
  const { count } = await svc
    .from('patient_otp_codes')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone).gte('created_at', since)
  if ((count ?? 0) >= 5) return { success: false, error: 'Too many requests. Please try again in a few minutes.' }

  const code = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(Date.now() + 5 * 60000).toISOString()
  const { error } = await svc.from('patient_otp_codes').insert({ phone, code_hash: hashCode(code), expires_at: expiresAt })
  if (error) return { success: false, error: error.message }

  const sent = await sendOtpViaWhatsApp(phone, code)
  if (sent) return { success: true }
  // WhatsApp not live yet → expose the code outside production so we can test.
  if (process.env.NODE_ENV !== 'production') return { success: true, devCode: code }
  return { success: true }
}

// ── Step 2: verify the OTP, create/find the account, start a session ──────────
export async function verifyPatientOtp(
  phoneRaw: string, code: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const phone = normalizePhone(phoneRaw)
  if (!phone) return { success: false, error: 'Invalid mobile number' }

  const svc = createServiceClient()
  const { data: otp } = await svc
    .from('patient_otp_codes')
    .select('id, code_hash, attempts')
    .eq('phone', phone).is('consumed_at', null)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  if (!otp) return { success: false, error: 'Code expired — please request a new one' }
  if ((otp.attempts as number) >= 5) return { success: false, error: 'Too many attempts — request a new code' }
  if (hashCode(code) !== otp.code_hash) {
    await svc.from('patient_otp_codes').update({ attempts: (otp.attempts as number) + 1 }).eq('id', otp.id as string)
    return { success: false, error: 'Incorrect code' }
  }
  await svc.from('patient_otp_codes').update({ consumed_at: new Date().toISOString() }).eq('id', otp.id as string)

  // Find or create the universal patient account for this phone.
  const { data: existing } = await svc.from('patient_accounts').select('id').eq('phone', phone).maybeSingle()
  let accountId: string
  if (existing) {
    accountId = existing.id as string
    await svc.from('patient_accounts').update({ last_login_at: new Date().toISOString() }).eq('id', accountId)
  } else {
    const last10 = phone.slice(-10)
    const { data: match } = await svc.from('patients').select('full_name').ilike('phone', `%${last10}%`).limit(1).maybeSingle()
    const { data: created, error: cErr } = await svc
      .from('patient_accounts')
      .insert({ phone, full_name: (match?.full_name as string) ?? null })
      .select('id').single()
    if (cErr || !created) return { success: false, error: cErr?.message ?? 'Could not create account' }
    accountId = created.id as string
  }

  await setPatientSession(accountId, phone)
  return { success: true }
}

export async function signOutPatient(): Promise<void> {
  await clearPatientSession()
}

// ── "My hospitals" — every hospital where this phone has a patient record ────
export interface MyHospital {
  tenant_id: string
  hospital: string
  patient_id: string
  patient_name: string
  uhid: string
}

export async function getMyHospitals(): Promise<MyHospital[]> {
  const session = await getPatientSession()
  if (!session) return []
  const svc = createServiceClient()
  const last10 = session.phone.slice(-10)
  const { data } = await svc
    .from('patients')
    .select('id, full_name, uhid, phone, tenant_id, tenant:tenants(name)')
    .ilike('phone', `%${last10}%`)

  return ((data ?? []) as Array<Record<string, unknown>>)
    // Exact normalised match (ilike is a loose prefilter).
    .filter((p) => normalizePhone(p.phone as string) === session.phone)
    .map((p) => ({
      tenant_id: p.tenant_id as string,
      hospital: (p.tenant as { name?: string } | null)?.name ?? 'Hospital',
      patient_id: p.id as string,
      patient_name: p.full_name as string,
      uhid: p.uhid as string,
    }))
}

export async function getPatientMe(): Promise<{ accountId: string; phone: string } | null> {
  return getPatientSession()
}
