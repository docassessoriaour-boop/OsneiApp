import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export function useDb<T>(table: string) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<any>(null)

  const fetchData = useCallback(async () => {
    let timeoutId: any
    try {
      setLoading(true)
      setError(null)
      console.log(`[useDb] Fetching data for table: ${table}...`)

      const controller = new AbortController()
      
      const fetchPromise = supabase
        .from(table)
        .select('*')
        .order('created_at', { ascending: false })
        .abortSignal(controller.signal)

      const timeoutPromise = new Promise<{data: null, error: any}>((resolve, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort()
          resolve({ data: null, error: new Error('Timeout na requisição') })
        }, 10000)
      })

      const { data: result, error: fetchError } = await Promise.race([
        fetchPromise,
        timeoutPromise
      ])

      if (fetchError) {
        console.error(`[useDb] Error fetching ${table}:`, fetchError)
        setError(fetchError)
        setData([])
        
        // Se houver erro de JWT expirado ou token inválido, podemos forçar o refresh ou logout
        if (fetchError?.message?.toLowerCase().includes('jwt') || fetchError?.code === 'PGRST301') {
          supabase.auth.getSession().then(({ data }) => {
            if (!data.session) {
              window.location.href = '/' // Force redirect se a sessão realmente morreu
            }
          })
        }
      } else {
        console.log(`[useDb] Successfully fetched ${result?.length || 0} rows from ${table}`)
        setData(result as T[])
      }
    } catch (e: any) {
      console.error(`[useDb] Exception in ${table}:`, e)
      setError(e)
      setData([])
      
      // Se for timeout, podemos tentar verificar a sessão
      if (e.message === 'Timeout na requisição') {
         supabase.auth.getSession().then(({ data }) => {
            if (!data.session) {
              window.location.href = '/' 
            }
         }).catch(() => {})
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      setLoading(false)
    }
  }, [table])

  useEffect(() => {
    fetchData()
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
