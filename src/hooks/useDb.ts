import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { NOVO_HORIZONTE_CNPJ_DIGITS } from '@/lib/companies'

function shouldIncludeLegacyCompanyRows(profile: ReturnType<typeof useAuth>['profile']) {
  return profile?.company?.cnpj_digits === NOVO_HORIZONTE_CNPJ_DIGITS
}

function applyCompanyScope(query: any, profile: ReturnType<typeof useAuth>['profile']) {
  if (!profile?.company_id) return query

  if (shouldIncludeLegacyCompanyRows(profile)) {
    return query.or(`company_id.eq.${profile.company_id},company_id.is.null`)
  }

  return query.eq('company_id', profile.company_id)
}

export function useDb<T>(table: string) {
  const { profile } = useAuth()
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<any>(null)
  const hasFetchedOnce = useRef(false)

  const fetchData = useCallback(async () => {
    let isMounted = true
    try {
      if (!profile?.company_id && table !== 'companies') {
        setData([])
        setLoading(false)
        return
      }

      // Stale-while-revalidate: só mostra spinner na primeira busca.
      // Em refetches mantém os dados antigos visíveis até a nova resposta.
      if (!hasFetchedOnce.current) {
        setLoading(true)
      }
      setError(null)
      console.log(`[useDb] Fetching data for table: ${table}...`)

      const controller = new AbortController()
      
      let query = supabase
        .from(table)
        .select('*')
        .order('created_at', { ascending: false })
        .abortSignal(controller.signal)

      if (profile?.company_id && table !== 'companies') {
        query = applyCompanyScope(query, profile)
      }

      const fetchPromise = query

      let timeoutId: any
      const timeoutPromise = new Promise<{data: null, error: any}>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort()
          reject(new Error('Timeout'))
        }, 10000)
      })

      const { data: result, error: fetchError } = await Promise.race([
        fetchPromise,
        timeoutPromise
      ]) as any
      
      clearTimeout(timeoutId)

      if (!isMounted) return

      if (fetchError) {
        console.error(`[useDb] Error fetching ${table}:`, fetchError)
        setError(fetchError)
        // Só zera os dados se nunca tivemos sucesso. Se já tínhamos dados,
        // mantém na tela em vez de mostrar vazio durante uma falha transitória.
        if (!hasFetchedOnce.current) {
          setData([])
        }

        if (fetchError?.message?.toLowerCase().includes('jwt') || fetchError?.code === 'PGRST301') {
          supabase.auth.signOut().finally(() => {
            window.location.href = '/'
          })
        }
      } else {
        console.log(`[useDb] Successfully fetched ${result?.length || 0} rows from ${table}`)
        setData((result || []) as T[])
        hasFetchedOnce.current = true
      }
    } catch (e: any) {
      if (!isMounted) return
      console.error(`[useDb] Exception in ${table}:`, e)
      setError(e)
      if (!hasFetchedOnce.current) {
        setData([])
      }

      if (e.name === 'AbortError' || e.message?.includes('Timeout')) {
         supabase.auth.getSession().then(({ data }) => {
            if (!data.session) {
              window.location.href = '/' 
            }
         }).catch(() => {})
      }
    } finally {
      if (isMounted) {
        setLoading(false)
      }
    }
    
    return () => { isMounted = false }
  }, [table, profile?.company_id, profile?.company?.cnpj_digits])

  useEffect(() => {
    const cleanup = fetchData()
    return () => {
      cleanup.then(fn => fn?.())
    }
  }, [fetchData])



  const insert = async (item: Partial<T>) => {
    const payload =
      profile?.company_id && table !== 'companies'
        ? { ...(item as any), company_id: profile.company_id }
        : item

    const { data: result, error } = await supabase
      .from(table)
      .insert(payload as any)
      .select()
    if (error) throw error
    if (result && result.length > 0) {
      setData(prev => [result[0] as T, ...prev])
      return result[0]
    }
    // Caso o RLS não retorne a linha inserida
    return payload as T
  }

  const update = async (id: string | number, item: Partial<T>) => {
    let query = supabase
      .from(table)
      .update(item as any)
      .eq('id', id)

    if (profile?.company_id && table !== 'companies') {
      query = applyCompanyScope(query, profile)
    }

    const { error } = await query
    if (error) throw error
    setData(prev => prev.map(i => ((i as any).id === id ? { ...i, ...item } : i)))
  }

  const remove = async (id: string | number) => {
    let query = supabase
      .from(table)
      .delete()
      .eq('id', id)

    if (profile?.company_id && table !== 'companies') {
      query = applyCompanyScope(query, profile)
    }

    const { error } = await query
    if (error) throw error
    setData(prev => prev.filter(i => ((i as any).id !== id)))
  }

  return { data, loading, error, reload: fetchData, insert, update, remove }
}
