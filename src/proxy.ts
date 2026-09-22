import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { solutionSlugs } from '@/lib/solutions/registry'

// Public marketing/solution landing pages (buyer-intent SEO pages) — kept in one
// place so every page added to the SOLUTIONS registry is automatically reachable
// without login, the same way /guides and /pricing are.
const MARKETING_SOLUTION_PATHS = solutionSlugs().map((s) => `/${s}`)

// ── Tenant cache (in-process, 1-min TTL) ──────────────────────────────────────
interface CachedTenant {
  id: string; name: string; slug: string; status: string; plan: string
  trial_ends_at: string | null; override_access_until: string | null
  current_period_end: string | null; cachedAt: number
}
const tenantCache = new Map<string, CachedTenant>()
const CACHE_TTL_MS = 60 * 1000

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
  const { data: tenantData } = await supabase
    .from('tenants')
    .select('id, name, slug, status, plan, trial_ends_at, override_access_until')
    .eq('slug', slug)
    .single()

  if (!tenantData) return null

  const { data: subData } = await supabase
    .from('subscriptions')
    .select('current_period_end')
    .eq('tenant_id', tenantData.id)
    .maybeSingle()

  const entry: CachedTenant = {
    ...tenantData,
    current_period_end: subData?.current_period_end ?? null,
    cachedAt: Date.now(),
  }
  tenantCache.set(slug, entry)
  return entry
}

function computeIsReadOnly(tenant: CachedTenant): boolean {
  const now = new Date()

  // Admin override — full access regardless of subscription state
  if (tenant.override_access_until && new Date(tenant.override_access_until) > now) return false

  // Hard-suspended — handled separately (hard block, not read-only)
  if (tenant.status === 'suspended') return false

  // Trial expired
  if (tenant.status === 'trial' && tenant.trial_ends_at && new Date(tenant.trial_ends_at) <= now) return true

  // Paid subscription cancelled and grace period over
  if (tenant.status === 'cancelled') {
    const periodEnd = tenant.current_period_end ? new Date(tenant.current_period_end) : null
    if (periodEnd && periodEnd <= now) return true
  }

  return false
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
    '/native-entry', '/find-hospital',
    // Public marketing / legal pages
    '/terms', '/privacy', '/security', '/guides', '/solutions', '/tools',
    // Crawler files. The apex already serves these, but on bare localhost and on
    // tenant subdomains they were redirected to /login — which makes a local
    // check of the sitemap silently lie about what search engines will see.
    '/sitemap.xml', '/robots.txt',
    // External-partner portal (self-authenticated via partner session cookie)
    '/partner',
    // Commercial solution landing pages (SEO)
    ...MARKETING_SOLUTION_PATHS,
  ]
  const isPublicPath = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))

  // ── Machine-to-machine API endpoints ───────────────────────────────────────
  // Cron (Bearer secret) and payment webhooks (HMAC signature) authenticate
  // themselves inside the route handler. They have no session cookie, so they
  // must skip the cookie-based auth redirect entirely — otherwise the request
  // is bounced to /login before it ever reaches the handler.
  if (pathname.startsWith('/api/cron/') || pathname.startsWith('/api/webhooks/')) {
    return NextResponse.next()
  }

  // Public tool APIs (e.g. the drug-schedule lookup on the marketing site) query
  // only the global drug catalogue — no auth, no tenant, no session cookie.
  if (pathname.startsWith('/api/tools/')) {
    return NextResponse.next()
  }

  // ── If Supabase is not configured, gate all non-public traffic ─────────────
  if (!isValidUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    if (isPublicPath) return NextResponse.next()
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  const isBareLocalhost = hostWithoutPort === 'localhost'
  const isLocalhostSubdomain = !isBareLocalhost && hostWithoutPort.endsWith('.localhost')
  const isProductionSubdomain = hostWithoutPort.endsWith(`.${rootDomain}`)

  if (!isBareLocalhost) {
    // ── Apex and www: marketing site only — block all tenant app paths ────────
    if (hostWithoutPort === rootDomain || hostWithoutPort === `www.${rootDomain}`) {
      // These paths belong to tenant subdomains, not the apex domain.
      // A tenant user who somehow lands here after login gets redirected to home.
      const TENANT_APP_PREFIXES = [
        '/dashboard', '/patients', '/appointments', '/opd', '/ipd',
        '/wards', '/emergency', '/lab', '/radiology', '/pharmacy',
        '/ot', '/blood', '/insurance', '/inventory', '/staff',
        '/billing', '/account', '/reports', '/dental',
      ]
      const isTenantPath = TENANT_APP_PREFIXES.some(
        p => pathname === p || pathname.startsWith(p + '/')
      )
      if (isTenantPath) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
      }
      return NextResponse.next()
    }

    // ── app.uyirly.com: Capacitor native app entry point ─────────────────────
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

      // ── Patient portal host (my.uyirly.com / my.localhost) ────────────────
      // Not a tenant — the universal patient portal. Rewrite to /portal/*;
      // the portal pages verify the patient session themselves (custom cookie).
      if (slug === 'my') {
        const url = request.nextUrl.clone()
        if (!pathname.startsWith('/portal')) {
          url.pathname = '/portal' + (pathname === '/' ? '' : pathname)
        }
        return NextResponse.rewrite(url)
      }

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

      // ── Platform admin panel is NOT served from tenant subdomains ─────────
      // It lives on the apex (uyirly.com/platform-admin) or the admin/platform
      // subdomains. Redirect any tenant-subdomain hit to the apex so the panel
      // never renders under a tenant's context. (Access is still gated by the
      // platform_admins table on the page itself.)
      if (pathname === '/platform-admin' || pathname.startsWith('/platform-admin/')) {
        const url = request.nextUrl.clone()
        url.hostname = isLocalhostSubdomain ? 'localhost' : rootDomain
        return NextResponse.redirect(url)
      }

      // ── Inject tenant context headers (built before async work) ──────────
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('x-pathname', pathname)

      let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

      // Capture any cookies Supabase writes during token refresh so we can
      // re-apply them after stamping tenant headers (which creates a new response).
      // Without this, refreshed session cookies are silently discarded, causing
      // ERR_TOO_MANY_REDIRECTS on the very next request.
      let refreshedCookies: { name: string; value: string; options: Record<string, unknown> }[] = []

      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() { return request.cookies.getAll() },
            setAll(cookiesToSet) {
              refreshedCookies = cookiesToSet as typeof refreshedCookies
              cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
              supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
              cookiesToSet.forEach(({ name, value, options }) =>
                supabaseResponse.cookies.set(name, value, options)
              )
            },
          },
        }
      )

      // ── Resolve tenant + validate session IN PARALLEL ─────────────────────
      // getSession() validates JWT locally — zero network round-trip.
      // Cross-tenant DB check removed: Supabase RLS (tenant_id on every table)
      // already prevents data leakage at the DB level.
      const [tenant, { data: { session } }] = await Promise.all([
        resolveTenant(slug),
        supabase.auth.getSession(),
      ])
      const user = session?.user ?? null

      if (!tenant) {
        const url = request.nextUrl.clone()
        url.pathname = '/tenant-not-found'
        return NextResponse.rewrite(url)
      }

      // ── Suspended — hard block ────────────────────────────────────────────
      if (tenant.status === 'suspended') {
        const url = request.nextUrl.clone()
        url.pathname = '/tenant-suspended'
        return NextResponse.rewrite(url)
      }

      // ── Compute read-only mode ────────────────────────────────────────────
      // Expired trial or lapsed subscription → all pages accessible but
      // no writes allowed. The header is always stamped so server actions
      // can read it without a second DB query.
      const isReadOnly = computeIsReadOnly(tenant)

      // ── Plan-based route gating ───────────────────────────────────────────
      const GROWTH_ONLY_ROUTES = [
        '/ipd', '/wards', '/emergency', '/lab', '/radiology',
        '/ot', '/blood', '/insurance', '/inventory',
        // Configures the IPD daily auto-bill only — nothing on it applies without IPD.
        '/settings/ipd-billing',
        // /staff is accessible on starter with per-role limits
      ]
      if (tenant.plan === 'starter' && tenant.status !== 'trial') {
        const isGrowthRoute = GROWTH_ONLY_ROUTES.some(
          r => pathname === r || pathname.startsWith(r + '/')
        )
        if (isGrowthRoute) {
          const upgradeUrl = request.nextUrl.clone()
          upgradeUrl.pathname = '/account/subscription'
          upgradeUrl.searchParams.set('upgrade', '1')
          return NextResponse.redirect(upgradeUrl)
        }
      }

      // ── Stamp tenant into headers for server components ───────────────────
      requestHeaders.set('x-tenant-id',       tenant.id)
      requestHeaders.set('x-tenant-slug',     tenant.slug)
      requestHeaders.set('x-tenant-name',     tenant.name)
      requestHeaders.set('x-tenant-status',   tenant.status)
      requestHeaders.set('x-tenant-plan',     tenant.plan)
      requestHeaders.set('x-tenant-readonly', isReadOnly ? '1' : '0')
      supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

      // Re-apply any cookies Supabase wrote during token refresh — the line
      // above creates a fresh response so we must copy them across manually.
      refreshedCookies.forEach(({ name, value, options }) =>
        supabaseResponse.cookies.set(name, value, options)
      )

      // ── Auth guards ───────────────────────────────────────────────────────
      if (!user && !isPublicPath) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
      }

      if (user && pathname === '/') {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        url.search = ''
        return NextResponse.redirect(url)
      }

      // Don't bounce a signed-in user back to /dashboard when the login page was
      // reached to clear a stale session (wrong tenant, deactivated account, or
      // an expired temp password) — those pages sign the user out on mount.
      const loginStateParams = ['wrongtenant', 'deactivated', 'tempexpired']
      const loginHasState = loginStateParams.some(p => request.nextUrl.searchParams.get(p))
      if (user && pathname === '/login' && !loginHasState) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        url.search = ''
        return NextResponse.redirect(url)
      }

      return supabaseResponse
    }
  }

  // ── Local dev or unrecognised hostname ─────────────────────────────────────
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

  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  const localLoginHasState = ['wrongtenant', 'deactivated', 'tempexpired']
    .some(p => request.nextUrl.searchParams.get(p))
  if (user && pathname === '/login' && !localLoginHasState) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
}
