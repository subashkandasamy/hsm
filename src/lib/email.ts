import { Resend } from 'resend'

const API_KEY = process.env.RESEND_API_KEY
// Must be a verified sender on your Resend domain (SPF/DKIM configured).
const FROM = process.env.EMAIL_FROM ?? 'Uyirly <noreply@mail.uyirly.com>'
// Replies go to a real, monitored mailbox (not the no-reply sender).
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? 'support@uyirly.com'

// Single shared client (null when not configured — e.g. local dev).
const resend = API_KEY ? new Resend(API_KEY) : null

interface WelcomeEmailParams {
  to:           string
  hospitalName: string
  loginUrl:     string  // e.g. https://city-general.uyirly.com/login
  username:     string  // the admin's login email
}

const T  = '#0D9488'
const S9 = '#0F172A'
const S6 = '#475569'
const S4 = '#94A3B8'
const S2 = '#E2E8F0'

function welcomeHtml({ hospitalName, loginUrl, username }: Omit<WelcomeEmailParams, 'to'>): string {
  return `
<div style="background:#f8fafc;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid ${S2};border-radius:16px;overflow:hidden;">
    <div style="padding:28px 32px;border-bottom:1px solid ${S2};">
      <span style="font-size:18px;font-weight:700;color:${S9};">Uyirly</span>
    </div>
    <div style="padding:32px;">
      <h1 style="margin:0 0 12px;font-size:22px;color:${S9};">Welcome to Uyirly, ${hospitalName}!</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${S6};">
        Your hospital workspace is ready. Bookmark your login page below — this is where you
        and your team will sign in from now on.
      </p>

      <div style="background:#f0fdfa;border:1px solid #ccfbf1;border-radius:12px;padding:16px 20px;margin:0 0 24px;">
        <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:${S4};">Your login page</p>
        <a href="${loginUrl}" style="font-size:15px;font-weight:600;color:${T};text-decoration:none;word-break:break-all;">${loginUrl}</a>
        <p style="margin:14px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:${S4};">Your username</p>
        <span style="font-size:15px;color:${S9};">${username}</span>
      </div>

      <a href="${loginUrl}" style="display:inline-block;background:${T};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:12px;">
        Go to your dashboard
      </a>

      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${S4};">
        Tip: always sign in from your hospital's web address above — not the main uyirly.com site.
        Your 30-day free trial has started; no credit card is required.
      </p>
    </div>
    <div style="padding:20px 32px;border-top:1px solid ${S2};">
      <p style="margin:0;font-size:12px;color:${S4};">Need help? Reply to this email or contact support@uyirly.com</p>
    </div>
  </div>
</div>`.trim()
}

/**
 * Sends the post-signup welcome email with the hospital's subdomain login URL
 * and username. Best-effort: never throws — signup must not fail if email does.
 */
export async function sendWelcomeEmail(params: WelcomeEmailParams): Promise<void> {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping welcome email')
    return
  }
  try {
    await resend.emails.send({
      from:    FROM,
      to:      params.to,
      replyTo: REPLY_TO,
      subject: `Welcome to Uyirly — your ${params.hospitalName} login`,
      html:    welcomeHtml(params),
    })
  } catch (err) {
    console.error('[email] Failed to send welcome email:', err)
  }
}

export async function sendPartnerLoginEmail(to: string, loginLink: string): Promise<void> {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — partner login link (dev):', loginLink)
    return
  }
  try {
    await resend.emails.send({
      from: FROM, to, replyTo: REPLY_TO,
      subject: 'Your Uyirly partner sign-in link',
      html: `
<div style="background:#f8fafc;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid ${S2};border-radius:16px;overflow:hidden;">
    <div style="padding:28px 32px;border-bottom:1px solid ${S2};"><span style="font-size:18px;font-weight:700;color:${S9};">Uyirly Partners</span></div>
    <div style="padding:32px;">
      <h1 style="margin:0 0 12px;font-size:20px;color:${S9};">Sign in to your partner dashboard</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${S6};">Click the button below to sign in and view your referrals and earnings. This link expires in 30 minutes.</p>
      <a href="${loginLink}" style="display:inline-block;background:${T};color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:12px;">Sign in</a>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${S4};">If you didn't request this, you can ignore this email.</p>
    </div>
  </div>
</div>`.trim(),
    })
  } catch (err) {
    console.error('[email] Failed to send partner login email:', err)
  }
}

export async function sendPartnerWelcomeEmail(to: string, name: string, referralLink: string, pct: number): Promise<void> {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — partner referral link (dev):', referralLink)
    return
  }
  try {
    await resend.emails.send({
      from: FROM, to, replyTo: REPLY_TO,
      subject: 'You’re approved — your Uyirly referral link',
      html: `
<div style="background:#f8fafc;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid ${S2};border-radius:16px;overflow:hidden;">
    <div style="padding:28px 32px;border-bottom:1px solid ${S2};"><span style="font-size:18px;font-weight:700;color:${S9};">Uyirly Partners</span></div>
    <div style="padding:32px;">
      <h1 style="margin:0 0 12px;font-size:20px;color:${S9};">Welcome aboard, ${name}!</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${S6};">Your partner account is approved. Share your referral link with hospitals and clinics — you earn <strong>${pct}%</strong> of their subscription every month, for as long as they stay.</p>
      <div style="background:#f0fdfa;border:1px solid #ccfbf1;border-radius:12px;padding:16px 20px;margin:0 0 24px;">
        <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:${S4};">Your referral link</p>
        <a href="${referralLink}" style="font-size:15px;font-weight:600;color:${T};text-decoration:none;word-break:break-all;">${referralLink}</a>
      </div>
      <a href="https://www.uyirly.com/partner/login" style="display:inline-block;background:${T};color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:12px;">Open your partner dashboard</a>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${S4};">Sign in any time at uyirly.com/partner/login with this email to track your referrals and earnings.</p>
    </div>
  </div>
</div>`.trim(),
    })
  } catch (err) {
    console.error('[email] Failed to send partner welcome email:', err)
  }
}
