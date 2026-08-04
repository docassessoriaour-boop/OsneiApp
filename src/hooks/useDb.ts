import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

function applyCompanyScope(query: any, profile: ReturnType<typeof useAuth>['profile']) {
  if (!profile?.company_id) return query
  return query.eq('company_id', profile.company_id)
}

function getMissingColumn(error: any) {
  const message = String(error?.message || '')
  return message.match(/Could not find the '([^']+)' column/)?.[1] || null
}

function omitColumn<TPayload>(payload: TPayload, column: string): TPayload {
  if (Array.isArray(payload)) {
    return payload.map(item => omitColumn(item, column)) as TPayload
  }
  if (!payload || typeof payload !== 'object') return payload

  const { [column]: _removed, ...rest } = payload as Record<string, unknown>
  return rest as TPayload
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

    let cleanedPayload = payload
    let result: any[] | null = null

    const maxAttempts = Math.max(1, Object.keys(cleanedPayload as Record<string, unknown>).length + 1)

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await supabase
        .from(table)
        .insert(cleanedPayload as any)
        .select()

      if (!response.error) {
        result = response.data
        break
      }

      const missingColumn = getMissingColumn(response.error)
      if (!missingColumn) throw response.error

      cleanedPayload = omitColumn(cleanedPayload, missingColumn)
    }

    if (!result) throw new Error(`Nao foi possivel salvar em ${table}.`)
    if (result && result.length > 0) {
      setData(prev => [result[0] as T, ...prev])
      return result[0]
    }
    // Caso o RLS não retorne a linha inserida
    return cleanedPayload as T
  }

  const update = async (id: string | number, item: Partial<T>) => {
    let cleanedItem = item

    const maxAttempts = Math.max(1, Object.keys(cleanedItem as Record<string, unknown>).length + 1)

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let query = supabase
        .from(table)
        .update(cleanedItem as any)
        .eq('id', id)

      if (profile?.company_id && table !== 'companies') {
        query = applyCompanyScope(query, profile)
      }

      const { error } = await query
      if (!error) {
        setData(prev => prev.map(i => ((i as any).id === id ? { ...i, ...cleanedItem } : i)))
        return
      }

      const missingColumn = getMissingColumn(error)
      if (!missingColumn) throw error

      cleanedItem = omitColumn(cleanedItem, missingColumn)
    }

    throw new Error(`Nao foi possivel atualizar ${table}.`)
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
