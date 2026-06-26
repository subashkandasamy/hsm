import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Returns a Supabase client pointed at the read replica (if configured) or
 * falls back to the primary. Use this for dashboard KPI reads and CSV exports
 * only — never for transactional writes.
 *
 * Set SUPABASE_READ_REPLICA_URL + SUPABASE_READ_REPLICA_SERVICE_KEY in .env
 * when a Supabase read-replica add-on is enabled on the project.
 */
export function getReadClient() {
  const url = process.env.SUPABASE_READ_REPLICA_URL
             ?? process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_READ_REPLICA_SERVICE_KEY
             ?? process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
