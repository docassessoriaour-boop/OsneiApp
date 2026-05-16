import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export type UserRole = 'admin' | 'manager' | 'user'

export interface Profile {
  id: string
  full_name: string | null
  email: string | null
  role: UserRole
  created_at: string
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  isAdmin: boolean
  isManager: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const initialized = React.useRef(false)

  const fetchProfile = async (userId: string, retries = 2) => {
    try {
      console.log('[Auth] Fetching profile for:', userId, 'retries left:', retries)
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .abortSignal(controller.signal)
        .single()
        
      clearTimeout(timeoutId)

      if (error) {
        if (error.code === 'PGRST116') {
          console.warn('[Auth] No profile found for user')
          setProfile(null)
        } else {
          console.error('[Auth] Error fetching profile:', error)
          if (retries > 0) {
            console.log('[Auth] Retrying profile fetch...')
            return fetchProfile(userId, retries - 1)
          }
          setProfile(null)
        }
      } else {
        console.log('[Auth] Profile loaded successfully', data)
        setProfile(data as Profile)
      }
    } catch (error: any) {
      console.error('[Auth] Unexpected error in fetchProfile:', error)
      if (error.name === 'AbortError' && retries > 0) {
        console.log('[Auth] Timeout, retrying profile fetch...')
        return fetchProfile(userId, retries - 1)
      }
      setProfile(null)
    } finally {
      if (retries === 0 || profile !== undefined) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    let mounted = true

    const initializeAuth = async () => {
      if (initialized.current) return
      
      try {
        // Initial session check
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!mounted) return

        if (session?.user) {
          setUser(session.user)
          await fetchProfile(session.user.id)
        } else {
          setLoading(false)
        }
        
        initialized.current = true
      } catch (error) {
        console.error('[Auth] Initialization error:', error)
        if (mounted) setLoading(false)
      }
    }

    initializeAuth()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return
      console.log('[Auth] Event:', event, 'User:', session?.user?.id)
      
      const currentUser = session?.user ?? null
      setUser(currentUser)

      if (currentUser) {
        // Only fetch profile if not already initialized or if it's a fresh sign in
        if (event === 'SIGNED_IN') {
          await fetchProfile(currentUser.id)
        } else if (event === 'SIGNED_OUT') {
          setProfile(null)
          setLoading(false)
        } else if (!profile && initialized.current) {
          // Fallback if profile is missing for some reason
          await fetchProfile(currentUser.id)
        }
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    // Safety timeout: force loading to false after 8 seconds
    const timeout = setTimeout(() => {
      if (mounted && loading) {
        console.warn('[Auth] Loading timeout reached, forcing render')
        setLoading(false)
      }
    }, 8000)

    return () => {
      mounted = false
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const isAdmin = profile?.role === 'admin'
  const isManager = profile?.role === 'manager' || isAdmin

  const value = {
    user,
    profile,
    loading,
    isAdmin,
    isManager,
    signOut: async () => {
      setLoading(true)
      await supabase.auth.signOut()
      setUser(null)
      setProfile(null)
      setLoading(false)
    }
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
