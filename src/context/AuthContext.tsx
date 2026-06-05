'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

interface AuthContextValue {
  profile: Profile | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({ profile: null, loading: true })

export function AuthProvider({ children, initialProfile }: { children: ReactNode; initialProfile: Profile | null }) {
  const [profile, setProfile] = useState<Profile | null>(initialProfile)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_OUT') {
        setProfile(null)
      }
    })
    setLoading(false)
    return () => subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={{ profile, loading }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
