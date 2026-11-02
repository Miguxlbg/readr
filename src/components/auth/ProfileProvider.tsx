'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { getCurrentProfile } from '@/lib/data'
import { AUTH_EVENT } from '@/lib/auth-client'
import type { UserProfile } from '@/lib/types'

interface ProfileContextValue { profile: UserProfile | null; loading: boolean; error: string }
const ProfileContext = createContext<ProfileContextValue>({ profile: null, loading: true, error: '' })

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<ProfileContextValue>({ profile: null, loading: true, error: '' })
  useEffect(() => {
    let active = true
    const load = () => getCurrentProfile()
      .then((profile) => { if (active) setValue({ profile, loading: false, error: '' }) })
      .catch((cause) => { if (active) setValue({ profile: null, loading: false, error: cause instanceof Error ? cause.message : 'Não foi possível carregar o perfil.' }) })
    load()
    // signIn/signUp/exclusão disparam este evento; sem Supabase não há onAuthStateChange
    window.addEventListener(AUTH_EVENT, load)
    return () => { active = false; window.removeEventListener(AUTH_EVENT, load) }
  }, [])
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() { return useContext(ProfileContext) }
