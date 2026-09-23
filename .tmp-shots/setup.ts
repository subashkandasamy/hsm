import { createClient } from '@supabase/supabase-js'
import { createHash, randomUUID, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } })

async function main() {
  const { data: t } = await db.from('tenants').select('id').eq('slug', 'demo').single()
  const tenantId = t!.id as string

  // A connector, as the install wizard would create it.
  const token = randomBytes(24).toString('base64url')
  await db.from('connectors').delete().eq('tenant_id', tenantId)
  await db.from('connectors').insert({
    id: randomUUID(), tenant_id: tenantId, name: 'Lab PC', machine_name: 'LAB-PC-01',
    token_hash: createHash('sha256').update(token).digest('hex'),
    lan_ip: '192.168.1.42', listen_port: 5150, status: 'pending', version: '1.0.0',
  })

  // A library entry for the Mindray, mapping its codes to our analytes.
  const { data: analytes } = await db.from('lab_analytes').select('id, code')
  const aid = new Map((analytes ?? []).map(a => [a.code as string, a.id as string]))
  await db.from('device_library').delete().eq('fingerprint', 'BC-5130^Mindray')
  const libId = randomUUID()
  await db.from('device_library').insert({
    id: libId, fingerprint: 'BC-5130^Mindray', manufacturer: 'Mindray', model: 'BC-5130',
    protocol: 'astm', framing: 'framed', default_port: 5150,
    notes: 'Built from captured traffic; not yet confirmed against a physical machine',
  })
  const codes: Array<[string, string]> = [['WBC','WBC'],['HGB','HGB'],['PLT','PLT'],['RBC','RBC'],['HCT','HCT']]
  await db.from('device_library_codes').insert(codes.filter(([, c]) => aid.has(c)).map(([code, c]) => ({
    id: randomUUID(), device_library_id: libId, analyzer_code: code, analyte_id: aid.get(c),
  })))

  console.log('TOKEN=' + token)
}
main()
