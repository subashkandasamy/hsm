import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hashLoginToken, setPartnerSession } from '@/lib/partnerAuth'

// Consumes a one-time magic-link token, starts the partner session, redirects.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? ''
  const fail = () => NextResponse.redirect(new URL('/partner/login?error=link', request.url))
  if (!token) return fail()

  const svc = createServiceClient()
  const { data: row } = await svc.from('partner_login_tokens')
    .select('id, partner_id, expires_at, consumed_at')
    .eq('token_hash', hashLoginToken(token))
    .maybeSingle()

  if (!row || row.consumed_at || new Date(row.expires_at as string) < new Date()) return fail()

  await svc.from('partner_login_tokens').update({ consumed_at: new Date().toISOString() }).eq('id', row.id)
  await setPartnerSession(row.partner_id as string)

  return NextResponse.redirect(new URL('/partner', request.url))
}
