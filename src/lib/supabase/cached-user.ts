'use server'

import { cache } from 'react'
import { createClient } from './server'

/**
 * Returns the verified Supabase user for the current request.
 * React cache() deduplicates across the layout + page render tree
 * so only one network call is made to Supabase Auth per request.
 */
export const getCachedUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})
