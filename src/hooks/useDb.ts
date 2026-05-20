import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export function useDb<T>(table: string) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<any>(null)
  const hasFetchedOnce = useRef(false)

  const fetchData = useCallback(async () => {
    let isMounted = true
    try {
      // Stale-while-revalidate: só mostra spinner na primeira busca.
      // Em refetches mantém os dados antigos visíveis até a nova resposta.
      if (!hasFetchedOnce.current) {
        setLoading(true)
      }
      setError(null)
      console.log(`[useDb] Fetching data for table: ${table}...`)

      const controller = new AbortController()
      
      const timeoutId = setTimeout(() => {
        controller.abort()
      }, 10000)

      const { data: result, error: fetchError } = await supabase
        .from(table)
        .select('*')
        .order('created_at', { ascending: false })
        .abortSignal(controller.signal)

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
          supabase.auth.getSession().then(({ data }) => {
            if (!data.session) {
              window.location.href = '/'
            }
          })
        }
      } else {
        console.log(`[useDb] Successfully fetched ${result?.length || 0} rows from ${table}`)
        setData(result as T[])
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
  }, [table])

  useEffect(() => {
    const cleanup = fetchData()
    return () => {
      cleanup.then(fn => fn?.())
    }
  }, [fetchData])



  const insert = async (item: Partial<T>) => {
    const { data: result, error } = await supabase
      .from(table)
      .insert(item as any)
      .select()
    if (error) throw error
    if (result && result.length > 0) {
      setData(prev => [result[0] as T, ...prev])
      return result[0]
    }
    // Caso o RLS não retorne a linha inserida
    return item as T
  }

  const update = async (id: string | number, item: Partial<T>) => {
    const { error } = await supabase
      .from(table)
      .update(item as any)
      .eq('id', id)
    if (error) throw error
    setData(prev => prev.map(i => ((i as any).id === id ? { ...i, ...item } : i)))
  }

  const remove = async (id: string | number) => {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id)
    if (error) throw error
    setData(prev => prev.filter(i => ((i as any).id !== id)))
  }

  return { data, loading, error, reload: fetchData, insert, update, remove }
}
