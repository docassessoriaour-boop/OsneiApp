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

      // Add a 30-second timeout to the request
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Database request timeout')), 30000)
      })

      const requestPromise = supabase
        .from(table)
        .select('*')
        .order('created_at', { ascending: false })

      const { data: result, error: fetchError } = await Promise.race([
        requestPromise,
        timeoutPromise.then(() => ({ data: null, error: { message: 'Timeout' } }))
      ]) as any

      if (fetchError) {
        console.error(`[useDb] Error fetching ${table}:`, fetchError)
        setError(fetchError)
        // Set empty data on error so the app doesn't crash but shows 0
        setData([])
      } else {
        console.log(`[useDb] Successfully fetched ${result?.length || 0} rows from ${table}`)
        setData(result as T[])
      }
    } catch (e: any) {
      console.error(`[useDb] Exception in ${table}:`, e)
      setError(e)
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
