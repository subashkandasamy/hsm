// npm run e2e:accounts
// Makes sure the 8 test staff accounts exist on the test hospital, gives each a
// fresh password, and writes them into e2e/.env.e2e (git-ignored). Uses the
// service key from the app's .env.local at run time only — it is never copied.
import fs from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { ROOT, ROLES, E, assertSafeTarget, type Role } from '../lib/env'

const NAMES: Record<Role, string> = {
  admin: 'E2E Admin', doctor: 'Dr. E2E Priya Varman', nurse: 'E2E Sister Kala', receptionist: 'E2E Mani (Front desk)',
  lab_tech: 'E2E Arul (Lab)', pharmacist: 'E2E Bala (Pharmacy)', hr: 'E2E Geetha (HR)', accountant: 'E2E Ravi (Accounts)',
}
const emailOf = (role: Role) => `e2e.${role.replace('_', '')}@example.com`

function readEnv(file: string) {
  if (!fs.existsSync(file)) return {} as Record<string, string>
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
}

async function main() {
  assertSafeTarget()
  const app = readEnv(path.join(ROOT, '..', '.env.local'))
  if (!app.NEXT_PUBLIC_SUPABASE_URL || !app.SUPABASE_SERVICE_ROLE_KEY) throw new Error('.env.local needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  const svc = createClient(app.NEXT_PUBLIC_SUPABASE_URL, app.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: tenant } = await svc.from('tenants').select('id, slug').eq('slug', E.tenant).single()
  if (!tenant || tenant.slug !== E.tenant || /karur/i.test(tenant.slug)) throw new Error(`tenant ${E.tenant} not found (or not allowed)`)

  const only = process.argv.slice(2) as Role[]
  const out: Record<string, string> = {}
  for (const role of ROLES) {
    if (only.length && !only.includes(role)) continue
    const email = emailOf(role); const name = NAMES[role]
    const password = `E2e-${randomBytes(9).toString('base64url')}`
    const { data: existing } = await svc.from('profiles').select('id, tenant_id').eq('tenant_id', tenant.id).eq('full_name', name).maybeSingle()
    let id = existing?.id as string | undefined
    if (!id) {
      const list = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 })
      id = list.data.users.find((u) => u.email === email)?.id
    }
    if (id) {
      const { error } = await svc.auth.admin.updateUserById(id, { password, email_confirm: true })
      if (error) throw error
    } else {
      const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } })
      if (error) throw error
      id = data.user.id
    }
    const { error: pErr } = await svc.from('profiles').upsert({ id, tenant_id: tenant.id, full_name: name, role, is_active: true, must_change_password: false, temp_password_expires_at: null }, { onConflict: 'id' })
    if (pErr) throw pErr
    const k = role.toUpperCase()
    out[`E2E_${k}_EMAIL`] = email; out[`E2E_${k}_PASSWORD`] = password; out[`E2E_${k}_NAME`] = name
    console.log(`${role.padEnd(13)} ${email} ready`)
  }
  const file = path.join(ROOT, '.env.e2e')
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n') : fs.readFileSync(path.join(ROOT, '.env.e2e.example'), 'utf8').split('\n')
  const seen = new Set<string>()
  const next = lines.map((l) => { const k = l.split('=')[0].trim(); if (k in out) { seen.add(k); return `${k}=${out[k]}` } return l })
  for (const [k, v] of Object.entries(out)) if (!seen.has(k)) next.push(`${k}=${v}`)
  fs.writeFileSync(file, next.join('\n'), { mode: 0o600 })
  console.log(`Passwords written to e2e/.env.e2e (not committed).`)
}
main().catch((e) => { console.error('ERROR', e.message ?? e); process.exit(1) })
