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
  const profileFetched = React.useRef(false)
  const lastUserId = React.useRef<string | null>(null)

  const fetchProfile = async (userId: string, retries = 2) => {
    try {
      console.log('[Auth] Fetching profile for:', userId, 'retries left:', retries)
      
      const controller = new AbortController()
      
      const fetchPromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .abortSignal(controller.signal)
        .single()
        
      const timeoutPromise = new Promise<{data: null, error: any}>((_, reject) => {
        const timeoutId = setTimeout(() => {
          controller.abort()
          reject(new Error('Timeout na requisição de perfil'))
        }, 8000)
        ;(controller as any).timeoutId = timeoutId
      })

      const { data, error } = await Promise.race([
        fetchPromise,
        timeoutPromise
      ])
      
      if ((controller as any).timeoutId) {
        clearTimeout((controller as any).timeoutId)
      }

      if (error) {
        if (error.code === 'PGRST116') {
          console.warn('[Auth] PGRST116 (no rows). Mantendo perfil anterior se houver.')
          if (retries > 0) {
            console.log('[Auth] Retrying profile fetch due to PGRST116...')
            await new Promise(r => setTimeout(r, 1000)) // Wait 1s for token refresh
            return fetchProfile(userId, retries - 1)
          } else if (!profileFetched.current) {
            setProfile(null)
          }
        } else {
          console.error('[Auth] Error fetching profile:', error)
          if (retries > 0) {
            console.log('[Auth] Retrying profile fetch...')
            await new Promise(r => setTimeout(r, 500))
            return fetchProfile(userId, retries - 1)
          }
        }
      } else {
        console.log('[Auth] Profile loaded successfully', data)
        setProfile(data as Profile)
        profileFetched.current = true
      }
    } catch (error: any) {
      console.error('[Auth] Unexpected error in fetchProfile:', error)
      if ((error.name === 'AbortError' || error.message === 'Timeout na requisição de perfil') && retries > 0) {
        console.log('[Auth] Timeout, retrying profile fetch...')
        return fetchProfile(userId, retries - 1)
      }
    } finally {
      // Só libera o loading quando esgotamos retries OU temos perfil válido.
      // A condição antiga (profile !== undefined) era SEMPRE verdadeira
      // (o state inicia como null, nunca undefined), fazendo o spinner
      // sumir durante retries em curso.
      if (retries === 0 || profileFetched.current) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    let mounted = true

    const initializeAuth = async () => {
      if (initialized.current) return
      
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!mounted) return

        if (session?.user) {
          setUser(session.user)
          lastUserId.current = session.user.id
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return
      console.log('[Auth] Event:', event, 'User:', session?.user?.id)
      
      const currentUser = session?.user ?? null
      setUser(currentUser)

      if (currentUser) {
        if (event === 'SIGNED_IN') {
          // Supabase re-emite SIGNED_IN ao voltar de aba/inatividade mesmo
          // sem novo login. Se já temos perfil deste mesmo usuário, não
          // refaz o fetch — evita saturar a conexão e timeout em cascata
          // nas demais queries da página.
          const sameUserAlreadyLoaded =
            profileFetched.current && lastUserId.current === currentUser.id
          if (!sameUserAlreadyLoaded) {
            lastUserId.current = currentUser.id
            await fetchProfile(currentUser.id)
          } else {
            setLoading(false)
          }
        } else if (event === 'TOKEN_REFRESHED') {
          // Sessão renovada. Se ainda não temos o profile (falhou no initial load), tenta buscar agora.
          if (!profileFetched.current) {
             lastUserId.current = currentUser.id
             await fetchProfile(currentUser.id)
          } else {
             setLoading(false)
          }
        } else if (event === 'SIGNED_OUT') {
          setProfile(null)
          profileFetched.current = false
          lastUserId.current = null
          setLoading(false)
        } else if (!profileFetched.current && initialized.current) {
          await fetchProfile(currentUser.id)
        }
      } else {
        setProfile(null)
        profileFetched.current = false
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
      try {
        await supabase.auth.signOut()
      } catch (error) {
        console.error('[Auth] Error signing out:', error)
      } finally {
        setUser(null)
        setProfile(null)
        setLoading(false)
      }
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
