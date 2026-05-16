import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export function useDb<T>(table: string) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<any>(null)

  const fetchData = useCallback(async () => {
    let timeoutId: any
    let isTimeout = false
    try {
      setLoading(true)
      setError(null)
      console.log(`[useDb] Fetching data for table: ${table}...`)

      // We'll use an AbortController for timeout if fetch supports it, or just a flag
      const controller = new AbortController()
      timeoutId = setTimeout(() => {
        isTimeout = true
        controller.abort()
      }, 10000) // 10 second timeout

      const { data: result, error: fetchError } = await supabase
        .from(table)
        .select('*')
        .order('created_at', { ascending: false })
        .abortSignal(controller.signal)

      if (fetchError) {
        console.error(`[useDb] Error fetching ${table}:`, fetchError)
        setError(fetchError)
        setData([])
      } else {
        console.log(`[useDb] Successfully fetched ${result?.length || 0} rows from ${table}`)
        setData(result as T[])
      }
    } catch (e: any) {
      if (isTimeout || e.name === 'AbortError') {
        console.error(`[useDb] Timeout fetching ${table}`)
        setError({ message: 'Timeout na requisição' })
      } else {
        console.error(`[useDb] Exception in ${table}:`, e)
        setError(e)
      }
      setData([])
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
    setData(prev => [result[0] as T, ...prev])
    return result[0]
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
