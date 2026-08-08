// Shared (non-server) referral helpers. Kept out of the 'use server' action
// module so the constant + link builder can be imported by client components too.

export const DEFAULT_COMMISSION_PCT = 10   // recurring % on referred tenants' net subscription fee

const SITE = 'https://www.uyirly.com'

export function referralLink(code: string): string {
  return `${SITE}/signup?ref=${encodeURIComponent(code)}`
}
