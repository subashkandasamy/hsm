// Read-only view of the database, for checking the values the screens stored.
// The suite never writes through this; every record comes from the screens.
import fs from 'fs'
import path from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ROOT } from './env'

let client: SupabaseClient | null = null
export function reader(): SupabaseClient {
  if (client) return client
  const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '..', '.env.local'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
  client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  return client
}

/** Every row of a query, 1,000 at a time. */
export async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error?: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let f = 0; ; f += 1000) {
    const { data, error } = await q(f, f + 999)
    // A wrong column name must stop the check, not read as "no rows".
    if (error) throw new Error(`database read failed: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}
