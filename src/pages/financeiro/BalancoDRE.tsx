import { useState, useMemo } from 'react'
import { useDb } from '@/hooks/useDb'
import { formatCurrency } from '@/lib/utils'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF, formatCurrencyPDF } from '@/lib/pdf'
import type { Bill, Income, BankAccount, TransactionCategory, BankTransaction } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, TrendingUp, TrendingDown, Scale, BarChart3, Printer } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/PageHeader'
export default function BalancoDRE() {
  const { data: bills } = useDb<Bill>('bills')
  const { data: incomes } = useDb<Income>('incomes')
  const { data: accounts } = useDb<BankAccount>('bank_accounts')
  const { data: categories } = useDb<TransactionCategory>('transaction_categories')
  const { data: transactions } = useDb<BankTransaction>('bank_transactions')
  
  const [clinic] = useClinic()
  const [currentTab, setCurrentTab] = useState('dre')

  // DRE Calculations (Income Statement)
  const dre = useMemo(() => {
    const revenue = incomes.filter(i => i.status === 'recebido').reduce((s, i) => s + i.valor, 0)
    const expense = bills.filter(b => b.status === 'pago').reduce((s, b) => s + b.valor, 0)
    
    // Categorization
    const revenueByCategory: Record<string, number> = {}
    incomes.filter(i => i.status === 'recebido').forEach(i => {
      const cat = categories.find(c => c.id === i.category_id)?.nome || i.categoria || 'Outros'
      revenueByCategory[cat] = (revenueByCategory[cat] || 0) + i.valor
    })

    const expenseByCategory: Record<string, number> = {}
    bills.filter(b => b.status === 'pago').forEach(b => {
      const cat = categories.find(c => c.id === b.category_id)?.nome || b.categoria || 'Outros'
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + b.valor
    })

    return {
      revenue,
      expense,
      net: revenue - expense,
      revenueByCategory: Object.entries(revenueByCategory).sort((a,b) => b[1] - a[1]),
      expenseByCategory: Object.entries(expenseByCategory).sort((a,b) => b[1] - a[1])
    }
  }, [bills, incomes, categories])

  // Balance Sheet Calculations (Simplified)
  const balanceSheet = useMemo(() => {
    const assets = accounts.reduce((s, a) => s + a.saldo_atual, 0)
    const receivables = incomes.filter(i => i.status === 'pendente').reduce((s, i) => s + i.valor, 0)
    const liabilities = bills.filter(b => b.status === 'pendente').reduce((s, b) => s + b.valor, 0)

    return {
      cash: assets,
      receivables,
      totalAssets: assets + receivables,
      liabilities,
      netWorth: (assets + receivables) - liabilities
    }
  }, [accounts, incomes, bills])

  function printReport() {
    let content = ''
    if (currentTab === 'dre') {
      content = `
        <h2>DRE - Demonstração do Resultado</h2>
        <table class="report-table">
          <thead><tr><th>Descrição</th><th class="text-right">Valor</th></tr></thead>
          <tbody>
            <tr class="font-bold border-b"><td>RECEITA BRUTA OPERACIONAL</td><td class="text-right text-green">${formatCurrencyPDF(dre.revenue)}</td></tr>
            ${dre.revenueByCategory.map(([cat, val]) => `<tr><td style="padding-left: 20px;">${cat}</td><td class="text-right">${formatCurrencyPDF(val)}</td></tr>`).join('')}
            <tr class="font-bold border-b"><td>(-) DESPESAS OPERACIONAIS</td><td class="text-right text-red">${formatCurrencyPDF(dre.expense)}</td></tr>
             ${dre.expenseByCategory.map(([cat, val]) => `<tr><td style="padding-left: 20px;">${cat}</td><td class="text-right">${formatCurrencyPDF(val)}</td></tr>`).join('')}
            <tr class="font-bold text-lg" style="background: #f0f0f0;"><td>LUCRO/PREJUÍZO LÍQUIDO</td><td class="text-right ${dre.net >= 0 ? 'text-green' : 'text-red'}">${formatCurrencyPDF(dre.net)}</td></tr>
          </tbody>
        </table>
      `
    } else {
      content = `
        <h2>Balanço Patrimonial (Simplificado)</h2>
        <div style="display: flex; gap: 40px;">
          <div style="flex: 1;">
            <h3>ATIVO (O que a empresa tem)</h3>
            <table>
              <tr><td>Disponibilidades (Bancos/Caixa)</td><td class="text-right">${formatCurrencyPDF(balanceSheet.cash)}</td></tr>
              <tr><td>Contas a Receber</td><td class="text-right">${formatCurrencyPDF(balanceSheet.receivables)}</td></tr>
              <tr class="font-bold border-t"><td>TOTAL DO ATIVO</td><td class="text-right">${formatCurrencyPDF(balanceSheet.totalAssets)}</td></tr>
            </table>
          </div>
          <div style="flex: 1;">
            <h3>PASSIVO (O que a empresa deve)</h3>
            <table>
              <tr><td>Contas a Pagar</td><td class="text-right text-red">${formatCurrencyPDF(balanceSheet.liabilities)}</td></tr>
              <tr class="font-bold border-t"><td>TOTAL DO PASSIVO</td><td class="text-right text-red">${formatCurrencyPDF(balanceSheet.liabilities)}</td></tr>
              <tr class="font-bold" style="background: #eee;"><td>PATRIMÔNIO LÍQUIDO</td><td class="text-right">${formatCurrencyPDF(balanceSheet.netWorth)}</td></tr>
            </table>
          </div>
        </div>
      `
    }
    printPDF(currentTab === 'dre' ? 'DRE - Demonstrativo' : 'Balanço Patrimonial', content, clinic)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Relatórios Contábeis" description="DRE e Balanço Patrimonial para tomada de decisão" />
        <Button onClick={printReport} variant="outline" className="gap-2">
          <Printer className="h-4 w-4" /> Exportar PDF
        </Button>
      </div>

      <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
        <TabsList className="grid w-64 grid-cols-2">
          <TabsTrigger value="dre" className="gap-2"><BarChart3 className="h-4 w-4" /> DRE</TabsTrigger>
          <TabsTrigger value="balanco" className="gap-2"><Scale className="h-4 w-4" /> Balanço</TabsTrigger>
        </TabsList>

        <TabsContent value="dre" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-green-100 text-green-700 rounded-lg"><TrendingUp className="h-5 w-5" /></div>
                <span className="text-sm font-medium text-muted-foreground">Receita Operacional</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(dre.revenue)}</p>
            </Card>
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-red-100 text-red-700 rounded-lg"><TrendingDown className="h-5 w-5" /></div>
                <span className="text-sm font-medium text-muted-foreground">Despesa Operacional</span>
              </div>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(dre.expense)}</p>
            </Card>
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-lg"><BarChart3 className="h-5 w-5" /></div>
                <span className="text-sm font-medium text-muted-foreground">Resultado Líquido</span>
              </div>
              <p className={`text-2xl font-bold ${dre.net >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatCurrency(dre.net)}</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="font-bold mb-4 flex items-center gap-2 text-green-700">
                <TrendingUp className="h-5 w-5" /> Detalhamento de Receitas
              </h3>
              <div className="space-y-2">
                {dre.revenueByCategory.map(([cat, val]) => (
                  <div key={cat} className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm">{cat}</span>
                    <span className="font-medium">{formatCurrency(val)}</span>
                  </div>
                ))}
                {dre.revenueByCategory.length === 0 && <p className="text-sm text-muted-foreground italic">Nenhum dado encontrado.</p>}
              </div>
            </Card>
            <Card className="p-6">
              <h3 className="font-bold mb-4 flex items-center gap-2 text-red-700">
                <TrendingDown className="h-5 w-5" /> Detalhamento de Despesas
              </h3>
              <div className="space-y-2">
                {dre.expenseByCategory.map(([cat, val]) => (
                  <div key={cat} className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm">{cat}</span>
                    <span className="font-medium">{formatCurrency(val)}</span>
                  </div>
                ))}
                {dre.expenseByCategory.length === 0 && <p className="text-sm text-muted-foreground italic">Nenhum dado encontrado.</p>}
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="balanco" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="text-lg font-bold flex items-center gap-2 border-b pb-2">
                <TrendingUp className="h-5 w-5 text-green-600" /> ATIVO
              </h3>
              <Card className="p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-sm">Disponibilidades</p>
                    <p className="text-xs text-muted-foreground">Caixa e Bancos</p>
                  </div>
                  <span className="font-bold">{formatCurrency(balanceSheet.cash)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-sm">Contas a Receber</p>
                    <p className="text-xs text-muted-foreground">Faturas e mensalidades pendentes</p>
                  </div>
                  <span className="font-bold">{formatCurrency(balanceSheet.receivables)}</span>
                </div>
                <div className="pt-4 border-t-2 flex justify-between items-center">
                  <span className="font-bold text-lg">TOTAL DO ATIVO</span>
                  <span className="font-bold text-lg text-green-600">{formatCurrency(balanceSheet.totalAssets)}</span>
                </div>
              </Card>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-bold flex items-center gap-2 border-b pb-2">
                <TrendingDown className="h-5 w-5 text-red-600" /> PASSIVO
              </h3>
              <Card className="p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-sm">Contas a Pagar</p>
                    <p className="text-xs text-muted-foreground">Fornecedores e obrigações pendentes</p>
                  </div>
                  <span className="font-bold text-red-600">{formatCurrency(balanceSheet.liabilities)}</span>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <div>
                    <p className="font-semibold text-sm">Salários a Pagar</p>
                    <p className="text-xs text-muted-foreground">Provisão de folha</p>
                  </div>
                  <span className="font-bold text-red-400">R$ 0,00</span>
                </div>
                <div className="pt-4 border-t-2 flex justify-between items-center">
                  <span className="font-bold text-lg">TOTAL DO PASSIVO</span>
                  <span className="font-bold text-lg text-red-600">{formatCurrency(balanceSheet.liabilities)}</span>
                </div>
              </Card>

              <Card className="p-6 bg-muted/30 border-dashed border-2">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-bold">PATRIMÔNIO LÍQUIDO</p>
                    <p className="text-xs text-muted-foreground">Capital próprio / Reservas acumuladas</p>
                  </div>
                  <span className={`text-xl font-bold ${balanceSheet.netWorth >= 0 ? 'text-primary' : 'text-red-700'}`}>
                    {formatCurrency(balanceSheet.netWorth)}
                  </span>
                </div>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
