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

// ── Cache do profile em sessionStorage para evitar flash branco ao recarregar ──
const PROFILE_CACHE_KEY = 'gom-profile-cache-v1'

function getCachedProfile(): Profile | null {
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY)
    return raw ? (JSON.parse(raw) as Profile) : null
  } catch {
    return null
  }
}

function setCachedProfile(p: Profile | null) {
  try {
    if (p) {
      sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p))
    } else {
      sessionStorage.removeItem(PROFILE_CACHE_KEY)
    }
  } catch {}
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  // Inicia com o cache para não piscar enquanto getSession() resolve
  const [profile, setProfile] = useState<Profile | null>(() => getCachedProfile())
  // Sempre começa como true – só vira false quando getSession() resolver
  const [loading, setLoading] = useState(true)

  const profileFetchedRef = React.useRef(false)
  const lastUserIdRef = React.useRef<string | null>(null)

  // ── Busca o perfil no banco com retry ──────────────────────────────────────
  const fetchProfile = async (userId: string, retries = 3): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        if (retries > 0) {
          await new Promise(r => setTimeout(r, 800))
          return fetchProfile(userId, retries - 1)
        }
        console.error('[Auth] Failed to fetch profile after retries:', error)
        return
      }

      if (data) {
        const p = data as Profile
        setProfile(p)
        setCachedProfile(p)
        profileFetchedRef.current = true
        lastUserIdRef.current = userId
      }
    } catch (err) {
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 800))
        return fetchProfile(userId, retries - 1)
      }
      console.error('[Auth] Exception fetching profile:', err)
    }
  }

  useEffect(() => {
    let mounted = true

    // Fallback de segurança: forçar carregamento para false após 8 segundos
    // Evita que o app fique travado em tela branca se houver erro silencioso de rede ou do supabase
    const fallbackTimer = setTimeout(() => {
      if (mounted) setLoading(false)
    }, 8000)

    // ── 1. Inicialização: lê sessão ativa do Supabase ──────────────────────
    const initialize = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!mounted) return

        if (session?.user) {
          setUser(session.user)

          // Verifica se o cache já é do mesmo usuário para evitar rebusca
          const cached = getCachedProfile()
          if (cached && cached.id === session.user.id) {
            setProfile(cached)
            profileFetchedRef.current = true
            lastUserIdRef.current = session.user.id
          } else {
            await fetchProfile(session.user.id)
            
            // Fallback: Se não encontrou no banco, usa os metadados da sessão!
            // Isso evita que o usuário fique com perfil nulo se o banco/RLS falhar.
            if (!profileFetchedRef.current) {
               setProfile({
                 id: session.user.id,
                 full_name: session.user.user_metadata?.full_name || 'Usuário',
                 email: session.user.email || '',
                 role: session.user.user_metadata?.role || 'user',
                 created_at: session.user.created_at || new Date().toISOString()
               })
            }
          }
        } else {
          // Sem sessão ativa: limpa tudo
          setUser(null)
          setProfile(null)
          setCachedProfile(null)
        }
      } catch (err) {
        console.error('[Auth] Initialization error:', err)
      } finally {
        clearTimeout(fallbackTimer)
        if (mounted) setLoading(false)
      }
    }

    initialize()

    // ── 2. Escuta mudanças de estado (login, refresh de token, logout) ─────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return
        console.log('[Auth] Event:', event, 'User:', session?.user?.id)

        if (event === 'SIGNED_OUT') {
          setUser(null)
          setProfile(null)
          setCachedProfile(null)
          profileFetchedRef.current = false
          lastUserIdRef.current = null
          clearTimeout(fallbackTimer)
          setLoading(false)
          return
        }

        if (
          event === 'INITIAL_SESSION' ||
          event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED'
        ) {
          const currentUser = session?.user ?? null
          setUser(currentUser)

          if (currentUser) {
            // Só rebusca profile se ainda não temos o do usuário atual
            const alreadyLoaded =
              profileFetchedRef.current &&
              lastUserIdRef.current === currentUser.id

            if (!alreadyLoaded) {
              await fetchProfile(currentUser.id)
              
              if (!profileFetchedRef.current) {
                 setProfile({
                   id: currentUser.id,
                   full_name: currentUser.user_metadata?.full_name || 'Usuário',
                   email: currentUser.email || '',
                   role: currentUser.user_metadata?.role || 'user',
                   created_at: currentUser.created_at || new Date().toISOString()
                 })
              }
            }
          }
          clearTimeout(fallbackTimer)
          setLoading(false)
        }
      }
    )

    return () => {
      mounted = false
      clearTimeout(fallbackTimer)
      subscription.unsubscribe()
    }
  }, [])

  const isAdmin = profile?.role === 'admin'
  const isManager = profile?.role === 'manager' || isAdmin

  const value: AuthContextType = {
    user,
    profile,
    loading,
    isAdmin,
    isManager,
    signOut: async () => {
      // Limpa estado local PRIMEIRO para dar feedback instantâneo na UI
      setCachedProfile(null)
      profileFetchedRef.current = false
      lastUserIdRef.current = null
      setUser(null)
      setProfile(null)
      setLoading(false)
      
      try {
        await supabase.auth.signOut()
      } catch (err) {
        console.error('[Auth] Error signing out:', err)
      }
    },
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
