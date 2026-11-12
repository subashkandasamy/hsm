// An unknown emergency patient is registered with a placeholder phone
// ("PROV-61A702E3", emergency.ts) because patients.phone is required. It is an
// internal key, not a number — never show or print it (BUG-060).
export function realPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  return phone.startsWith('PROV-') ? null : phone
}
