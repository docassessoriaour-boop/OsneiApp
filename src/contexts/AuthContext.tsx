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

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Error fetching profile:', error)
        setProfile(null)
      } else {
        setProfile(data as Profile)
      }
    } catch (error) {
      console.error('Auth check error:', error)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    // The single source of truth for auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth event:', event, session?.user?.id)
      
      const currentUser = session?.user ?? null
      
      // Update user state
      setUser(currentUser)

      if (currentUser) {
        // If we have a user but no profile yet, or the user changed
        if (!profile || profile.id !== currentUser.id) {
          setLoading(true)
          await fetchProfile(currentUser.id)
        } else {
          setLoading(false)
        }
      } else {
        // No user session
        setProfile(null)
        setLoading(false)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [profile])

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
