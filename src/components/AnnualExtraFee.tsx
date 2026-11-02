import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type AnnualFee = { year: number; minimum_wage: number; amount: number; due_date: string; generated: number }

export function AnnualExtraFee({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ loading: boolean; fee?: AnnualFee; error?: string }>({ loading: true })

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    setState({ loading: true })
    async function ensureFee() {
      try {
        const { data, error } = await supabase.rpc('ensure_annual_extra_fees').abortSignal(controller.signal)
        if (error) throw error
        if (!cancelled) setState({ loading: false, fee: data as AnnualFee })
      } catch (error) {
        const detail = error as { code?: string; message?: string }
        const message = detail.code === 'PGRST202'
          ? 'A cobrança automática da taxa extra anual ainda precisa ser ativada pela administração.'
          : detail.code === 'P0001' && detail.message?.startsWith('Salário mínimo de ')
            ? detail.message
            : 'Não foi possível verificar a taxa extra anual. Tente novamente.'
        if (!cancelled) setState({ loading: false, error: message })
      } finally {
        window.clearTimeout(timeout)
      }
    }
    if (profile?.company_id) void ensureFee()
    else setState({ loading: false })
    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [profile?.company_id, attempt])

  return (
    <>
      <div className="mb-6 rounded-lg border bg-muted/30 p-4 text-sm" role="status">
        <p className="font-semibold">Taxa extra anual — cláusula 2.3</p>
        {state.loading ? <p>Verificando lançamentos anuais dos pacientes ativos...</p> : state.error ? (
          <div className="flex items-center justify-between gap-4">
            <p>{state.error}</p>
            <Button variant="outline" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</Button>
          </div>
        ) : state.fee ? (
          <p>{state.fee.year}: {formatCurrency(state.fee.amount)} por paciente ativo (½ do salário mínimo de {formatCurrency(state.fee.minimum_wage)}), com vencimento em {formatDate(state.fee.due_date)}. Lançamento automático em faturamento e contas a receber, uma vez por ano.</p>
        ) : <p>Aguardando identificação da empresa.</p>}
      </div>
      {!state.loading && children}
    </>
  )
}
