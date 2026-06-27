import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { verifySessionCookie, SESSION_COOKIE, SESSION_MAX_MS } from '@/lib/sessionCookie'

// ── Tenant cache (in-process, 5-min TTL) ──────────────────────────────────────
interface CachedTenant {
  id: string; name: string; slug: string; status: string; plan: string
  sms_2fa_enabled: boolean
  cachedAt: number
}
const tenantCache = new Map<string, CachedTenant>()
const CACHE_TTL_MS = 5 * 60 * 1000

const RESERVED_SLUGS = new Set([
  'admin', 'app', 'api', 'www', 'platform', 'static', 'assets', 'default',
])

async function resolveTenant(slug: string): Promise<CachedTenant | null> {
  const cached = tenantCache.get(slug)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
  // Attempt to fetch including sms_2fa_enabled (added in migration 0017).
  // If the column doesn't exist yet the query returns an error — fall back to
  // the base select and treat 2FA as disabled (consistent with initiate2FA()).
  let baseData: { id: string; name: string; slug: string; status: string; plan: string } | null = null
  let sms2faEnabled = false

  const { data: fullData, error: fullErr } = await supabase
    .from('tenants')
    .select('id, name, slug, status, plan, sms_2fa_enabled')
    .eq('slug', slug)
    .single()

  if (fullData) {
    baseData = fullData
    sms2faEnabled = (fullData as unknown as { sms_2fa_enabled?: boolean }).sms_2fa_enabled ?? false
  } else if (fullErr) {
    // Column may not exist yet — retry without it
    const { data: fallback } = await supabase
      .from('tenants')
      .select('id, name, slug, status, plan')
      .eq('slug', slug)
      .single()
    baseData = fallback
  }

  if (!baseData) return null
  const entry: CachedTenant = { ...baseData, sms_2fa_enabled: sms2faEnabled, cachedAt: Date.now() }
  tenantCache.set(slug, entry)
  return entry
}

function isValidUrl(s: string | undefined): boolean {
  if (!s) return false
  try { new URL(s); return true } catch { return false }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hostname = request.headers.get('host') ?? ''
  const hostWithoutPort = hostname.replace(/:\d+$/, '')
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'uyirly.com'

  // Public paths — no auth needed
  const PUBLIC_PATHS = [
    '/login', '/signup', '/tenant-not-found', '/tenant-suspended',
    '/auth/callback', '/forgot-password', '/reset-password',
    '/native-entry',  // Capacitor first-launch screen — public, no tenant context
  ]
  const isPublicPath = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))

  // Auth-only paths that don't require completed 2FA
  const TWO_FA_EXEMPT = ['/verify-otp', '/add-phone']
  const isTwoFAExempt = TWO_FA_EXEMPT.some(p => pathname === p || pathname.startsWith(p + '/'))

  // ── If Supabase is not configured, gate all non-public traffic ─────────────
  if (!isValidUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    if (isPublicPath) return NextResponse.next()
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Bare localhost (no subdomain) → skip tenant resolution AND 2FA gate
  const isBareLocalhost = hostWithoutPort === 'localhost'

  // Subdomain on localhost (e.g. citygeneral.localhost) OR production subdomain
  const isLocalhostSubdomain = !isBareLocalhost && hostWithoutPort.endsWith('.localhost')
  const isProductionSubdomain = hostWithoutPort.endsWith(`.${rootDomain}`)

  if (!isBareLocalhost) {
    // ── Apex and www: serve marketing site, no tenant resolution ────────────
    if (hostWithoutPort === rootDomain || hostWithoutPort === `www.${rootDomain}`) {
      return NextResponse.next()
    }

    // ── app.uyirly.com: Capacitor native app entry point ─────────────────────
    // The native WebView loads from https://app.uyirly.com/native-entry.
    // Serve it as-is — no tenant context needed.
    if (hostWithoutPort === `app.${rootDomain}`) {
      if (!isPublicPath) {
        const url = request.nextUrl.clone()
        url.pathname = '/native-entry'
        return NextResponse.rewrite(url)
      }
      return NextResponse.next()
    }

    if (isLocalhostSubdomain || isProductionSubdomain) {
      const slug = isLocalhostSubdomain
        ? hostWithoutPort.replace('.localhost', '')
        : hostWithoutPort.replace(`.${rootDomain}`, '')

      // ── Reserved slugs ────────────────────────────────────────────────────
      if (RESERVED_SLUGS.has(slug)) {
        if (slug === 'admin' || slug === 'platform') {
          const url = request.nextUrl.clone()
          url.pathname = `/platform-admin${pathname === '/' ? '' : pathname}`
          return NextResponse.rewrite(url)
        }
        const url = request.nextUrl.clone()
        url.pathname = '/tenant-not-found'
        return NextResponse.rewrite(url)
      }

      // ── Resolve tenant ────────────────────────────────────────────────────
      const tenant = await resolveTenant(slug)
      if (!tenant) {
        const url = request.nextUrl.clone()
        url.pathname = '/tenant-not-found'
        return NextResponse.rewrite(url)
      }

      // ── Suspended / cancelled ─────────────────────────────────────────────
      if (tenant.status === 'suspended' || tenant.status === 'cancelled') {
        const url = request.nextUrl.clone()
        url.pathname = '/tenant-suspended'
        return NextResponse.rewrite(url)
      }

      // ── Inject tenant context headers + Supabase auth ─────────────────────
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('x-tenant-id',       tenant.id)
      requestHeaders.set('x-tenant-slug',     tenant.slug)
      requestHeaders.set('x-tenant-name',     tenant.name)
      requestHeaders.set('x-tenant-status',   tenant.status)
      requestHeaders.set('x-tenant-plan',     tenant.plan)
      // Let server actions read 2FA setting without an extra DB round-trip
      requestHeaders.set('x-tenant-2fa',      tenant.sms_2fa_enabled ? '1' : '0')

      let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() { return request.cookies.getAll() },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
              supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
              cookiesToSet.forEach(({ name, value, options }) =>
                supabaseResponse.cookies.set(name, value, options)
              )
            },
          },
        }
      )

      const { data: { user } } = await supabase.auth.getUser()

      // ── Unauthenticated: redirect to login ────────────────────────────────
      if (!user && !isPublicPath) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
      }

      // ── Authenticated at root → send to dashboard ─────────────────────────
      if (user && pathname === '/') {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        url.search = ''
        return NextResponse.redirect(url)
      }

      // ── Cross-tenant session defense ──────────────────────────────────────
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('id', user.id)
          .single()

        if (profile && profile.tenant_id !== tenant.id) {
          await supabase.auth.signOut()
          const url = request.nextUrl.clone()
          url.pathname = '/login'
          url.search = ''
          return NextResponse.redirect(url)
        }
      }

      // ── 2FA + session expiry gate (tenant subdomains only) ────────────────
      if (user && !isPublicPath) {
        const la = request.cookies.get(SESSION_COOKIE)?.value
        const loginAt = await verifySessionCookie(la, user.id)

        if (loginAt !== null && Date.now() - loginAt > SESSION_MAX_MS) {
          // Session exceeded 24 hours — force sign-out
          await supabase.auth.signOut()
          const url = request.nextUrl.clone()
          url.pathname = '/login'
          url.search = '?expired=1'
          const resp = NextResponse.redirect(url)
          resp.cookies.delete(SESSION_COOKIE)
          await logSessionExpiry(user.id)
          return resp
        }

        if (loginAt === null && !isTwoFAExempt) {
          // If 2FA is disabled for this tenant, let them through without OTP
          if (!tenant.sms_2fa_enabled) {
            return supabaseResponse
          }
          // Authenticated but no valid 2FA cookie → must complete 2FA
          const url = request.nextUrl.clone()
          url.pathname = '/verify-otp'
          url.search = ''
          return NextResponse.redirect(url)
        }

        // Fully authenticated: redirect away from 2FA-only pages
        if (loginAt !== null && isTwoFAExempt) {
          const url = request.nextUrl.clone()
          url.pathname = '/dashboard'
          url.search = ''
          return NextResponse.redirect(url)
        }
      }

      // Redirect logged-in users away from /login
      if (user && pathname === '/login') {
        const la = request.cookies.get(SESSION_COOKIE)?.value
        const loginAt = await verifySessionCookie(la, user.id)
        const url = request.nextUrl.clone()
        // 2FA disabled: always go to dashboard; 2FA enabled: cookie check decides
        url.pathname = (loginAt !== null || !tenant.sms_2fa_enabled) ? '/dashboard' : '/verify-otp'
        url.search = ''
        return NextResponse.redirect(url)
      }

      return supabaseResponse
    }
  }

  // ── Local dev or unrecognised hostname: standard Supabase auth gate ────────
  const isMarketingPath = pathname === '/' || pathname.startsWith('/pricing')
  if (isPublicPath || isMarketingPath) return NextResponse.next()

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

// Fire-and-forget audit log for session expiry (no tenant RLS context in middleware)
async function logSessionExpiry(userId: string): Promise<void> {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } }
    )
    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', userId)
      .single()
    if (!profile?.tenant_id) return

    await supabase.from('audit_logs').insert({
      id: crypto.randomUUID(),
      tenant_id: profile.tenant_id,
      actor_id: userId,
      action: 'session_expired',
      entity: 'auth',
      entity_id: userId,
      meta: { expired_at: new Date().toISOString() },
    })
  } catch {
    // Non-fatal — middleware must not crash
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
}
