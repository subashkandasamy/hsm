/**
 * The rules behind opening scans from outside the hospital (build item #14).
 *
 *   npm run verify:tunnel
 *
 * Offline: Cloudflare is replaced by a recorder, so this checks what we would
 * ask Cloudflare for, in what order, and what we do with the answers — never
 * a real account. Three things:
 *
 *   1. chooseViewerRoute — inside the hospital gets the local link, outside
 *      gets the tunnel only when it is switched on, reported up and fresh.
 *   2. provisionTunnel — the exact API calls, idempotent on retry, each step
 *      saved before the next can fail.
 *   3. hostnameFor — opaque, so DNS does not publish a customer list.
 */
import {
  chooseViewerRoute, chooseFileRoute, tunnelIsUp, TUNNEL_FRESH_MS, HOSPITAL_LINK_TTL, INTERNET_LINK_TTL,
  computerQuietSince, COMPUTER_QUIET_MS, type ConnectorReach,
} from '../src/lib/radiology/viewerRoute'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${name}${ok ? '' : `  ${detail}`}`)
  if (!ok) failed++
}

const NOW = Date.parse('2026-11-09T10:00:00Z')
const fresh = new Date(NOW - 30_000).toISOString()
const stale = new Date(NOW - TUNNEL_FRESH_MS - 1_000).toISOString()

const base: ConnectorReach = {
  lan_ip: '192.168.1.106', public_ip: '49.37.1.2',
  internet_access: true, tunnel_hostname: 'c-abc.files.test',
  tunnel_state: 'up', tunnel_state_at: fresh,
}

console.log('\n1. Which link')
{
  const r = chooseViewerRoute(base, '49.37.1.2', NOW)
  check('inside the hospital → local link even with the tunnel up',
    r?.where === 'hospital' && r.base === 'http://192.168.1.106:5152' && r.ttlSeconds === HOSPITAL_LINK_TTL, JSON.stringify(r))
}
{
  const r = chooseViewerRoute(base, '106.51.9.9', NOW)
  check('outside, tunnel up and fresh → internet link, 1 hour',
    r?.where === 'internet' && r.base === 'https://c-abc.files.test' && r.ttlSeconds === INTERNET_LINK_TTL, JSON.stringify(r))
}
{
  const r = chooseViewerRoute({ ...base, internet_access: false }, '106.51.9.9', NOW)
  check('outside, switched off → local link (as before the tunnel existed)', r?.where === 'hospital', JSON.stringify(r))
}
{
  const r = chooseViewerRoute({ ...base, tunnel_state_at: stale }, '106.51.9.9', NOW)
  check('outside, heartbeat stale → never trust the tunnel', r?.where === 'hospital', JSON.stringify(r))
}
for (const st of ['down', 'starting', 'missing', 'off', null]) {
  check(`tunnel state ${st} → not up`, !tunnelIsUp({ ...base, tunnel_state: st }, NOW))
}
check('no hostname → not up', !tunnelIsUp({ ...base, tunnel_hostname: null }, NOW))
{
  const r = chooseViewerRoute({ ...base, lan_ip: null }, '49.37.1.2', NOW)
  check('inside but no LAN address known → tunnel rather than nothing', r?.where === 'internet', JSON.stringify(r))
}
{
  const r = chooseViewerRoute({ ...base, public_ip: null }, '49.37.1.2', NOW)
  check('connector never sent a heartbeat (old version) → treated as outside', r?.where === 'internet', JSON.stringify(r))
}
check('nothing at all → null',
  chooseViewerRoute({ ...base, lan_ip: null, internet_access: false }, null, NOW) === null)
check('unknown request IP never matches a null public IP',
  chooseViewerRoute({ ...base, public_ip: null, internet_access: false }, null, NOW)?.where === 'hospital')

console.log('\n1b. Which link for a kept upload (document, declaration, report image)')
{
  const r = chooseFileRoute(base, {}, NOW)
  check('tunnel up → internet link even inside (pages must embed it)', r?.where === 'internet' && r.base === 'https://c-abc.files.test', JSON.stringify(r))
  const off = chooseFileRoute({ ...base, internet_access: false }, {}, NOW)
  check('tunnel off → local link for staff (opens in a new tab)', off?.where === 'hospital' && off.base === 'http://192.168.1.106:5152', JSON.stringify(off))
  check('tunnel off → nothing for the portal / printing', chooseFileRoute({ ...base, internet_access: false }, { embeddableOnly: true }, NOW) === null)
  check('tunnel stale → nothing for the portal', chooseFileRoute({ ...base, tunnel_state_at: stale }, { embeddableOnly: true }, NOW) === null)
  check('portal with tunnel up → internet link', chooseFileRoute(base, { embeddableOnly: true }, NOW)?.where === 'internet')
  check('no LAN address and no tunnel → nothing', chooseFileRoute({ ...base, lan_ip: null, internet_access: false }, {}, NOW) === null)
}

// ── Cloudflare, recorded ───────────────────────────────────────────────────
type Call = { method: string; path: string; body: unknown }
const calls: Call[] = []
let failOn: string | null = null
const realFetch = globalThis.fetch
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const u = new URL(String(url))
  const path = u.pathname.replace('/client/v4', '')
  const method = init?.method ?? 'GET'
  const body = init?.body ? JSON.parse(String(init.body)) : undefined
  calls.push({ method, path, body })
  const auth = (init?.headers as Record<string, string>)?.authorization
  if (auth !== 'Bearer test-token') return new Response('{}', { status: 403 })
  if (failOn && `${method} ${path}`.startsWith(failOn)) {
    return new Response(JSON.stringify({ success: false, errors: [{ code: 1000, message: 'boom' }] }), { status: 400 })
  }
  let result: unknown = {}
  if (method === 'POST' && path.endsWith('/cfd_tunnel')) result = { id: 'tun-1' }
  if (method === 'POST' && path.endsWith('/dns_records')) result = { id: 'dns-1' }
  if (method === 'GET' && path.endsWith('/token')) result = 'run-token-xyz'
  return new Response(JSON.stringify({ success: true, result, errors: [] }), { status: 200 })
}) as typeof fetch

async function main() {
  process.env.CLOUDFLARE_API_TOKEN = 'test-token'
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acc'
  process.env.CLOUDFLARE_ZONE_ID = 'zone'
  process.env.UYIRLY_FILES_DOMAIN = 'files.test.'
  const t = await import('../src/lib/cloudflare/tunnel')

  console.log('\n2. Hostname')
  const h = t.hostnameFor('3F2A9C1B-77aa-4b2e-9d10-aaaaaaaaaaaa', 'files.test')
  check('opaque, lower-case, from the connector id', h === 'c-3f2a9c1b77aa.files.test', h)
  check('carries no hospital name', !/karur|kmch|demo/i.test(h))

  console.log('\n3. Provisioning')
  const saved: unknown[] = []
  const r = await t.provisionTunnel(
    { connectorId: '3f2a9c1b-77aa-4b2e-9d10-aaaaaaaaaaaa', tunnelId: null, dnsRecordId: null },
    async (step) => { saved.push(step) },
  )
  const seq = calls.map((c) => `${c.method} ${c.path}`)
  check('create → configure → DNS, in that order', JSON.stringify(seq) === JSON.stringify([
    'POST /accounts/acc/cfd_tunnel',
    'PUT /accounts/acc/cfd_tunnel/tun-1/configurations',
    'POST /zones/zone/dns_records',
  ]), JSON.stringify(seq))
  check('tunnel is remotely managed', (calls[0].body as { config_src?: string }).config_src === 'cloudflare')
  const ingress = (calls[1].body as { config: { ingress: Array<{ hostname?: string; service: string }> } }).config.ingress
  check('ingress sends the hostname ONLY to the scan viewer on 5152',
    ingress[0].hostname === 'c-3f2a9c1b77aa.files.test' && ingress[0].service === 'http://localhost:5152', JSON.stringify(ingress))
  check('ingress ends with a 404 catch-all', ingress.at(-1)?.service === 'http_status:404' && !ingress.at(-1)?.hostname)
  check('status page (5151) is never routed', !JSON.stringify(ingress).includes('5151'))
  const dns = calls[2].body as { type: string; content: string; proxied: boolean }
  check('DNS is a proxied CNAME to <id>.cfargotunnel.com',
    dns.type === 'CNAME' && dns.content === 'tun-1.cfargotunnel.com' && dns.proxied === true, JSON.stringify(dns))
  check('result carries all three ids', r.tunnelId === 'tun-1' && r.dnsRecordId === 'dns-1' && r.hostname === h)
  check('tunnel id saved before the DNS step', JSON.stringify(saved[0]) === JSON.stringify({ tunnelId: 'tun-1' }), JSON.stringify(saved))

  calls.length = 0
  await t.provisionTunnel({ connectorId: '3f2a9c1b-77aa-4b2e-9d10-aaaaaaaaaaaa', tunnelId: 'tun-1', dnsRecordId: 'dns-1' })
  check('switching on again makes nothing new (only rewrites the ingress)',
    calls.length === 1 && calls[0].method === 'PUT', JSON.stringify(calls.map((c) => c.method + ' ' + c.path)))

  calls.length = 0
  failOn = 'POST /zones'
  const saved2: unknown[] = []
  let threw = false
  try {
    await t.provisionTunnel({ connectorId: '3f2a9c1b-77aa-4b2e-9d10-aaaaaaaaaaaa', tunnelId: null, dnsRecordId: null },
      async (s) => { saved2.push(s) })
  } catch (e) { threw = e instanceof t.CloudflareError && /boom/.test((e as Error).message) }
  failOn = null
  check('a DNS failure is reported in Cloudflare\'s words', threw)
  check('…and the half-made tunnel was saved, so a retry reuses it', JSON.stringify(saved2) === JSON.stringify([{ tunnelId: 'tun-1' }]))

  calls.length = 0
  const tok = await t.tunnelRunToken('tun-1')
  check('run token read from Cloudflare, not stored', tok === 'run-token-xyz' && calls[0].path === '/accounts/acc/cfd_tunnel/tun-1/token')

  calls.length = 0
  await t.removeTunnelHostname('dns-1')
  check('switching off deletes the DNS record', calls[0].method === 'DELETE' && calls[0].path === '/zones/zone/dns_records/dns-1')

  delete process.env.CLOUDFLARE_API_TOKEN
  check('no Cloudflare account configured → not available', t.tunnelsAvailable() === false)
  let refused = false
  try { await t.provisionTunnel({ connectorId: 'x', tunnelId: null, dnsRecordId: null }) } catch { refused = true }
  check('…and provisioning refuses rather than half-works', refused)

  globalThis.fetch = realFetch

  console.log('\nA computer that has stopped checking in (asleep / off)')
  check('checked in a minute ago → not quiet', computerQuietSince(new Date(NOW - 60_000).toISOString(), NOW) === null)
  const slept = new Date(NOW - COMPUTER_QUIET_MS - 1_000).toISOString()
  check('silent past 3 minutes → quiet, since its last check-in', computerQuietSince(slept, NOW) === slept)
  check('never checked in → no claim either way', computerQuietSince(null, NOW) === null)

  console.log(failed ? `\n${failed} check(s) FAILED\n` : '\nAll checks passed\n')
  process.exit(failed ? 1 : 0)
}
void main()
