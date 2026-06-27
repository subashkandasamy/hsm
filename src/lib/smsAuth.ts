// Dedicated SMS sender for authentication codes.
// Kept intentionally separate from src/lib/notify (patient communications)
// because security codes have different consent rules, criticality,
// and should never be routed through the patient-notification pipeline.

export async function sendAuthSms(phone: string, code: string): Promise<void> {
  const body = `Your Uyirly login code is ${code}. Valid for 5 minutes. Do not share this code with anyone.`

  const authKey = process.env.MSG91_AUTH_KEY
  const templateId = process.env.MSG91_OTP_TEMPLATE_ID

  if (!authKey || !templateId) {
    // Dev fallback: log to console when provider not configured
    const maskedPhone = phone.length > 4
      ? phone.slice(0, -4).replace(/\d/g, '*') + phone.slice(-4)
      : '****'
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`  [SMS STUB] OTP for ${maskedPhone}`)
    console.log(`  CODE: ${code}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    return
  }

  // Strip any non-digit characters except leading +; MSG91 expects 91XXXXXXXXXX
  const mobile = phone.replace(/[^\d]/g, '')

  const res = await fetch('https://api.msg91.com/api/v5/otp', {
    method: 'POST',
    headers: {
      authkey: authKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      template_id: templateId,
      mobile,
      otp: code,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MSG91 error ${res.status}: ${text}`)
  }
}

export function maskPhone(phone: string): string {
  if (phone.length <= 4) return '****'
  return phone.slice(0, -4).replace(/\d/g, '*') + phone.slice(-4)
}
