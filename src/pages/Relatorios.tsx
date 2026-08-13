import { useState, useMemo, useEffect } from 'react'
import { useDb } from '@/hooks/useDb'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF, formatDatePDF } from '@/lib/pdf'
import { printSanitaryFolderReport, sanitaryDocuments } from '@/lib/sanitaryDocuments'
import type { 
  Employee, Patient, Bill, Income, Product, 
  BankTransaction, BankAccount, TransactionCategory, Payroll, Contract
} from '@/lib/types'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { 
  Users, Heart, CreditCard, HandCoins, 
  Package, FileText, Printer, Filter, 
  BarChart3, Landmark, PieChart, TrendingUp 
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'

type ReportType = 'geral' | 'contasPagar' | 'contasReceber' | 'bancario' | 'fluxoCaixa' | 'custoPaciente' | 'contratos' | 'aniversariantes' | 'mapaCategoria' | 'pastaSanitaria'
type ViewMode = 'sintetico' | 'analitico'

export default function Relatorios() {
  const { data: bills, reload: r1 } = useDb<Bill>('bills')
  const { data: incomes, reload: r2 } = useDb<Income>('incomes')
  const { data: bankTxs, reload: r3 } = useDb<BankTransaction>('bank_transactions')
  const { data: bankAccounts, reload: r4 } = useDb<BankAccount>('bank_accounts')
  const { data: categories, reload: r5 } = useDb<TransactionCategory>('transaction_categories')
  const { data: payrolls, reload: r6 } = useDb<Payroll>('payrolls')
  const { data: patients, reload: r7 } = useDb<Patient>('patients')
  const { data: employees, reload: r8 } = useDb<Employee>('employees')
  const { data: contracts, reload: r9 } = useDb<Contract>('contracts')
  
  const reloadAll = () => {
    r1(); r2(); r3(); r4(); r5(); r6(); r7(); r8(); r9();
  }
  
  const [clinic] = useClinic()

  // Filters
  const [reportType, setReportType] = useState<ReportType>('geral')
  const [viewMode, setViewMode] = useState<ViewMode>('sintetico')
  const [dateStart, setDateStart] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
  const [dateEnd, setDateEnd] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10))
  const [selectedBank, setSelectedBank] = useState('')
  const [selectedCat, setSelectedCat] = useState('')
  const [estMonthlyCost, setEstMonthlyCost] = useState(20000)
  const [patientSort, setPatientSort] = useState<'nome' | 'pct_asc' | 'pct_desc'>('nome')

  useEffect(() => {
    if (employees.length > 0) {
      const activeSalaries = employees.filter(e => e.status === 'ativo').reduce((s, e) => s + (e.salario || 0), 0)
      // Estimativa base: Folha + 30% (impostos/custos fixos)
      setEstMonthlyCost(Math.round(activeSalaries * 1.3))
    }
  }, [employees])

  // Report logic
  const filteredData = useMemo(() => {
    const filterByDate = (d: string) => (!dateStart || d >= dateStart) && (!dateEnd || d <= dateEnd)
    
    const filterByCategory = (catId?: string) => {
      if (!selectedCat) return true
      if (selectedCat === 'sem-categoria') return !catId || catId === ''
      return catId === selectedCat
    }

    const fBills = bills.filter(b => 
      filterByDate(b.vencimento) && filterByCategory(b.category_id)
    )
    
    const fIncomes = incomes.filter(i => 
      filterByDate(i.vencimento) && filterByCategory(i.category_id)
    )

    const fBankTxs = bankTxs.filter(t => 
      filterByDate(t.data) && 
      (!selectedBank || t.bank_account_id === selectedBank) &&
      filterByCategory(t.category_id)
    )

    const fPayrolls = payrolls.filter(p => {
      // Payrolls usually have mesReferencia (YYYY-MM) or periods
      const refDate = p.periodoFim || (p.mesReferencia + '-01')
      return filterByDate(refDate)
    })

    const fContracts = contracts.filter(c => 
      filterByDate(c.dataFim) || filterByDate(c.dataInicio)
    )

    const activePatients = patients.filter(p => p.status === 'ativo')

    return { bills: fBills, incomes: fIncomes, transactions: fBankTxs, payrolls: fPayrolls, patients: activePatients, contratos: fContracts }
  }, [bills, incomes, bankTxs, payrolls, patients, contracts, dateStart, dateEnd, selectedBank, selectedCat])

  const totals = useMemo(() => {
    const pagar = filteredData.bills.reduce((s, b) => s + b.valor, 0)
    const pagarEfetuado = filteredData.bills.filter(b => b.status === 'pago').reduce((s, b) => s + b.valor, 0)
    const receber = filteredData.incomes.reduce((s, i) => s + i.valor, 0)
    const receberEfetuado = filteredData.incomes.filter(i => i.status === 'recebido').reduce((s, i) => s + i.valor, 0)
    const bankIn = filteredData.transactions.filter(t => t.tipo === 'credito').reduce((s, t) => s + t.valor, 0)
    const bankOut = filteredData.transactions.filter(t => t.tipo === 'debito').reduce((s, t) => s + t.valor, 0)
    const totalFolha = filteredData.payrolls.reduce((s, p) => s + p.salarioLiquido, 0)
    
    const totalExpenses = bankOut
    const patientCount = filteredData.patients.length || 1
    const avgCostPerPatient = totalExpenses / patientCount

    // Grouping by category for Synthetic View
    const categoryBreakdown = {
      bills: {} as Record<string, number>,
      incomes: {} as Record<string, number>
    }

    if (reportType === 'contasPagar' || reportType === 'geral') {
      filteredData.bills.forEach(b => {
        const catName = categories.find(c => c.id === b.category_id)?.nome || b.categoria || 'Não Categorizado'
        categoryBreakdown.bills[catName] = (categoryBreakdown.bills[catName] || 0) + b.valor
      })
    }

    if (reportType === 'contasReceber' || reportType === 'geral') {
      filteredData.incomes.forEach(i => {
        const catName = categories.find(c => c.id === i.category_id)?.nome || i.categoria || 'Não Categorizado'
        categoryBreakdown.incomes[catName] = (categoryBreakdown.incomes[catName] || 0) + i.valor
      })
    }

    // Usar transações bancárias apenas para o relatório 'Bancário'
    if (reportType === 'bancario') {
      filteredData.transactions.forEach(t => {
        const catName = categories.find(c => c.id === t.category_id)?.nome || t.categoria || 'Não Categorizado'
        if (t.tipo === 'debito') {
          categoryBreakdown.bills[catName] = (categoryBreakdown.bills[catName] || 0) + t.valor
        } else {
          categoryBreakdown.incomes[catName] = (categoryBreakdown.incomes[catName] || 0) + t.valor
        }
      })
    }

    return { 
      pagar, pagarEfetuado, receber, receberEfetuado, 
      bankIn, bankOut, totalFolha, totalExpenses, 
      patientCount, avgCostPerPatient,
      categoryBreakdown
    }
  }, [filteredData, categories, reportType])

  const projectionData = useMemo(() => {
    if (reportType !== 'fluxoCaixa') return []
    
    const data = []
    const now = new Date()
    const initialBankBalance = bankAccounts.reduce((s, a) => s + (a.saldo_atual || 0), 0)
    let cumulative = initialBankBalance

    for (let i = 0; i < 12; i++) {
      const current = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const year = current.getFullYear()
      const monthNum = current.getMonth() + 1
      const monthStr = `${year}-${String(monthNum).padStart(2, '0')}`
      
      const label = current.toLocaleString('pt-BR', { month: 'short' }).toUpperCase() + '/' + String(year).slice(-2)
      
      const monthIn = incomes.filter(inc => (inc.vencimento || '').startsWith(monthStr)).reduce((s, inc) => s + (inc.valor || 0), 0)
      
      // Se houver contas reais para o mês futuro, usamos elas, senão usamos a média
      const realBills = bills.filter(b => (b.vencimento || '').startsWith(monthStr)).reduce((s, b) => s + (b.valor || 0), 0)
      const realPayroll = payrolls.filter(p => p.mesReferencia === monthStr).reduce((s, p) => s + (p.salarioLiquido || 0), 0)
      
      const monthOut = (realBills + realPayroll) || estMonthlyCost
      
      const balance = monthIn - monthOut
      cumulative += balance
      
      data.push({
        label: label,
        monthStr,
        in: monthIn,
        out: monthOut,
        balance,
        cumulative
      })
    }
    return data
  }, [reportType, incomes, bills, payrolls, bankAccounts, estMonthlyCost])

  // ── Mapa Comparativo Mês a Mês ─────────────────────────────────────────────
  const mapaData = useMemo(() => {
    if (reportType !== 'mapaCategoria') return { months: [], categories: [], grid: {}, monthTotals: {}, categoryTotals: {} }

    // Last 12 months (regardless of date filter)
    const now = new Date()
    const months: { key: string; label: string }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '') + '/' + String(d.getFullYear()).slice(-2)
      months.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1) })
    }

    const grid: Record<string, Record<string, number>> = {} // grid[category][monthKey]
    const categoryTotals: Record<string, number> = {}
    const monthTotals: Record<string, number> = {}

    bills.forEach(b => {
      if (!b.vencimento) return
      const monthKey = b.vencimento.slice(0, 7)
      if (!months.find(m => m.key === monthKey)) return
      const catName = categories.find(c => c.id === b.category_id)?.nome || b.categoria || 'Não Categorizado'

      if (!grid[catName]) grid[catName] = {}
      grid[catName][monthKey] = (grid[catName][monthKey] || 0) + b.valor
      categoryTotals[catName] = (categoryTotals[catName] || 0) + b.valor
      monthTotals[monthKey] = (monthTotals[monthKey] || 0) + b.valor
    })

    // Sort categories by total descending
    const categoryList = Object.keys(categoryTotals).sort((a, b) => categoryTotals[b] - categoryTotals[a])
    const grandTotal = Object.values(categoryTotals).reduce((s, v) => s + v, 0)

    return { months, categories: categoryList, grid, monthTotals, categoryTotals, grandTotal }
  }, [reportType, bills, categories])

  const sortedPatients = useMemo(() => {
    const list = filteredData.patients.map(p => {
      const contract = contracts.find(c => (c.pacienteId || (c as any).paciente_id) === p.id && c.status === 'ativo')
      const mensalidade = contract?.valor || 0
      const pct = mensalidade > 0 ? (totals.avgCostPerPatient / mensalidade) * 100 : 0
      return { ...p, pct, mensalidade }
    })

    if (patientSort === 'pct_asc') {
      return list.sort((a, b) => a.pct - b.pct)
    }
    if (patientSort === 'pct_desc') {
      return list.sort((a, b) => b.pct - a.pct)
    }
    return list.sort((a, b) => a.nome.localeCompare(b.nome))
  }, [filteredData.patients, contracts, totals.avgCostPerPatient, patientSort])

  function printReport() {
    if (reportType === 'pastaSanitaria') {
      printSanitaryFolderReport(sanitaryDocuments, clinic)
      return
    }

    let html = `
      <h2 style="text-align:center; text-transform:uppercase; margin-bottom: 20px;">Relatório de ${reportType.toUpperCase()} (${viewMode.toUpperCase()})</h2>
      <div style="font-size: 12px; margin-bottom: 20px; border-bottom: 2px solid #eee; padding-bottom: 10px;">
        <p>Período: <strong>${formatDatePDF(dateStart)}</strong> até <strong>${formatDatePDF(dateEnd)}</strong></p>
        <p>Tipo de Relatório: <strong>${reportType.toUpperCase()}</strong> | Modo: <strong>${viewMode.toUpperCase()}</strong></p>
      </div>
    `

    if (reportType === 'geral' || reportType === 'fluxoCaixa') {
      html += `
        <div class="section">
          <h3>Resumo Financeiro (Sintético)</h3>
          <table>
            <tr><td>Total Contas a Pagar</td><td class="text-right text-red">${formatCurrency(totals.pagar)}</td></tr>
            <tr><td>Total Contas a Receber</td><td class="text-right text-green">${formatCurrency(totals.receber)}</td></tr>
            <tr class="font-bold"><td>Saldos em Banco (Movimentações)</td><td class="text-right">${formatCurrency(totals.bankIn - totals.bankOut)}</td></tr>
          </table>
        </div>
      `
    }

    if (viewMode === 'sintetico' && (reportType === 'geral' || reportType === 'contasPagar' || reportType === 'contasReceber' || reportType === 'bancario')) {
      if (Object.keys(totals.categoryBreakdown.bills).length > 0 && (reportType === 'geral' || reportType === 'contasPagar' || reportType === 'bancario')) {
        html += `
          <div class="section">
            <h3>Distribuição por Categoria (Saídas)</h3>
            <table>
              <thead><tr><th>Categoria</th><th class="text-right">Valor</th><th class="text-right">%</th></tr></thead>
              <tbody>
                ${(()=>{
                   const tBills = Object.values(totals.categoryBreakdown.bills).reduce((s, v) => s + v, 0) || 1;
                   return Object.entries(totals.categoryBreakdown.bills).sort((a,b) => b[1] - a[1]).map(([cat, val]) => `
                     <tr><td>${cat}</td><td class="text-right">${formatCurrency(val)}</td><td class="text-right">${((val/tBills)*100).toFixed(1)}%</td></tr>
                   `).join('')
                })()}
              </tbody>
            </table>
          </div>
        `
      }
      if (Object.keys(totals.categoryBreakdown.incomes).length > 0 && (reportType === 'geral' || reportType === 'contasReceber' || reportType === 'bancario')) {
        html += `
          <div class="section" style="margin-top: 20px;">
            <h3>Distribuição por Categoria (Entradas)</h3>
            <table>
              <thead><tr><th>Categoria</th><th class="text-right">Valor</th><th class="text-right">%</th></tr></thead>
              <tbody>
                ${(()=>{
                   const tIncomes = Object.values(totals.categoryBreakdown.incomes).reduce((s, v) => s + v, 0) || 1;
                   return Object.entries(totals.categoryBreakdown.incomes).sort((a,b) => b[1] - a[1]).map(([cat, val]) => `
                     <tr><td>${cat}</td><td class="text-right">${formatCurrency(val)}</td><td class="text-right">${((val/tIncomes)*100).toFixed(1)}%</td></tr>
                   `).join('')
                })()}
              </tbody>
            </table>
          </div>
        `
      }
    }

    if (reportType === 'contratos') {
      html += `
        <div class="section">
          <h3>Relatório de Contratos</h3>
          <table>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Início</th>
                <th>Vencimento</th>
                <th class="text-right">Valor</th>
                <th class="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              ${filteredData.contratos.map(c => `
                <tr>
                  <td>${c.pacienteNome || (c as any).paciente_nome || '---'}</td>
                  <td>${formatDatePDF(c.dataInicio || (c as any).data_inicio)}</td>
                  <td>${formatDatePDF(c.dataFim || (c as any).data_fim)}</td>
                  <td class="text-right">${formatCurrency(c.valor)}</td>
                  <td class="text-center">${c.status.toUpperCase()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="margin-top: 20px; font-size: 11px; text-align: right; color: #666;">
            <p><strong>Total de Contratos Ativos:</strong> ${filteredData.contratos.filter(c => c.status === 'ativo').length}</p>
            <p><strong>Valor Mensal Ativo:</strong> ${formatCurrencyPDF(filteredData.contratos.filter(c => c.status === 'ativo').reduce((s,c) => s+c.valor, 0))}</p>
          </div>
        </div>
      `
    }

    if (reportType === 'custoPaciente') {
      html += `
        <div class="section">
          <h3>Custo Efetivo por Paciente</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
              <p style="margin:0; font-size:12px; color:#64748b; text-transform:uppercase;">Despesas Totais (Contas + Folha)</p>
              <p style="margin:5px 0 0; font-size:20px; font-weight:bold; color:#ef4444;">${formatCurrency(totals.totalExpenses)}</p>
            </div>
            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
              <p style="margin:0; font-size:12px; color:#64748b; text-transform:uppercase;">Pacientes Ativos</p>
              <p style="margin:5px 0 0; font-size:20px; font-weight:bold; color:#3b82f6;">${totals.patientCount}</p>
            </div>
          </div>
          
          <div style="background: #eff6ff; padding: 20px; border-radius: 8px; border: 1px solid #bfdbfe; text-align: center; margin-bottom: 30px;">
            <p style="margin:0; font-size:14px; color:#1e40af; font-weight:600; text-transform:uppercase;">Custo Médio Efetivo por Paciente</p>
            <p style="margin:10px 0 0; font-size:32px; font-weight:800; color:#1d4ed8;">${formatCurrency(totals.avgCostPerPatient)}</p>
          </div>

          <h3>Listagem de Pacientes e Eficiência</h3>
          <table>
            <thead>
              <tr>
                <th>Paciente</th>
                <th class="text-right">Mensalidade</th>
                <th class="text-right">Custo Médio</th>
                <th class="text-right">Margem (R$)</th>
                <th class="text-right">% Custo</th>
              </tr>
            </thead>
            <tbody>
              ${sortedPatients.map(p => {
                const diff = p.mensalidade - totals.avgCostPerPatient
                return `
                  <tr>
                    <td>${p.nome}</td>
                    <td class="text-right">${formatCurrency(p.mensalidade)}</td>
                    <td class="text-right">${formatCurrency(totals.avgCostPerPatient)}</td>
                    <td class="text-right ${diff >= 0 ? 'text-green' : 'text-red'}">${formatCurrency(diff)}</td>
                    <td class="text-right">${p.pct.toFixed(1)}%</td>
                  </tr>
                `
              }).join('')}
            </tbody>
            <tfoot>
              <tr style="font-weight:bold; background:#f1f5f9;">
                <td>MÉDIA POR PACIENTE</td>
                <td class="text-right">${formatCurrency(filteredData.patients.reduce((s,p) => s + (contracts.find(c => (c.pacienteId || (c as any).paciente_id) === p.id && c.status === 'ativo')?.valor || 0), 0) / (totals.patientCount || 1))}</td>
                <td class="text-right">${formatCurrency(totals.avgCostPerPatient)}</td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      `
    }

    if (viewMode === 'analitico') {
      if (reportType === 'geral' || reportType === 'contasPagar') {
        html += `<h3>Detalhamento: Contas a Pagar</h3>
          <table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th class="text-right">%</th><th>Status</th></tr></thead><tbody>
          ${filteredData.bills.map(b => `<tr><td>${formatDatePDF(b.vencimento)}</td><td>${b.descricao}</td><td>${b.categoria || '—'}</td><td class="text-right">${formatCurrency(b.valor)}</td><td class="text-right">${((b.valor/(totals.pagar||1))*100).toFixed(1)}%</td><td>${b.status}</td></tr>`).join('')}
          </tbody></table>`
      }
      if (reportType === 'geral' || reportType === 'contasReceber') {
        html += `<h3 style="margin-top:20px;">Detalhamento: Contas a Receber</h3>
          <table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th class="text-right">%</th><th>Status</th></tr></thead><tbody>
          ${filteredData.incomes.map(i => `<tr><td>${formatDatePDF(i.vencimento)}</td><td>${i.descricao}</td><td>${i.categoria || '—'}</td><td class="text-right">${formatCurrency(i.valor)}</td><td class="text-right">${((i.valor/(totals.receber||1))*100).toFixed(1)}%</td><td>${i.status}</td></tr>`).join('')}
          </tbody></table>`
      }
      if (reportType === 'geral' || reportType === 'bancario') {
        html += `<h3 style="margin-top:20px;">Detalhamento: Movimentação Bancária</h3>
          <table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="text-right">Valor</th><th>Tipo</th></tr></thead><tbody>
          ${filteredData.transactions.sort((a,b)=>b.data.localeCompare(a.data)).map(t => `<tr><td>${formatDatePDF(t.data)}</td><td>${t.descricao}</td><td>${t.categoria || 'Não Categorizado'}</td><td class="text-right">${formatCurrency(t.valor)}</td><td>${t.tipo.toUpperCase()}</td></tr>`).join('')}
          </tbody></table>`
      }
    }

    if (reportType === 'aniversariantes') {
      const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      const people = [
        ...patients.filter(p => p.status === 'ativo').map(p => ({ nome: p.nome, data: p.data_nascimento, tipo: 'Paciente' })),
        ...employees.filter(e => e.status === 'ativo').map(e => ({ nome: e.nome, data: e.data_nascimento, tipo: e.is_pro_labore ? 'Sócio' : 'Funcionário' }))
      ].filter(p => p.data);

      const grouped = months.map((m, idx) => ({
        month: m,
        people: people.filter(p => {
          const d = new Date(p.data!);
          return d.getUTCMonth() === idx;
        }).sort((a, b) => new Date(a.data!).getUTCDate() - new Date(b.data!).getUTCDate())
      }));

      html = `
        <h1 style="text-align:center; text-transform:uppercase; margin-bottom: 20px; font-size: 18pt;">Calendário de Aniversariantes</h1>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; width: 100%;">
          ${grouped.map(g => `
            <div style="border: 1px solid #000; height: 180px; display: flex; flex-direction: column; page-break-inside: avoid;">
              <div style="background: #eee; padding: 4px; font-weight: bold; text-align: center; border-bottom: 1px solid #000; font-size: 11pt;">
                ${g.month.toUpperCase()}
              </div>
              <div style="padding: 5px; flex: 1; overflow: hidden;">
                <table style="font-size: 8.5pt; margin: 0; border: none; width: 100%; border-collapse: collapse;">
                  <tbody>
                    ${g.people.length === 0 ? '<tr><td style="text-align:center; color:#999; padding-top: 20px; border:none;">Nenhum</td></tr>' : 
                      g.people.map(p => {
                        const d = new Date(p.data!);
                        return `<tr style="border:none;">
                          <td style="width: 20px; font-weight: bold; border:none; padding: 1px;">${d.getUTCDate().toString().padStart(2, '0')}</td>
                          <td style="border:none; padding: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;">${p.nome.split(' ').slice(0,2).join(' ')}</td>
                          <td style="width: 30px; text-align: right; color: #666; font-size: 7pt; border:none; padding: 1px;">${p.tipo === 'Paciente' ? 'Pac.' : 'Func.'}</td>
                        </tr>`
                      }).join('')
                    }
                  </tbody>
                </table>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    const isBirthdayReport = reportType === 'aniversariantes';
    printPDF(isBirthdayReport ? '' : `Relatório ${reportType}`, html, isBirthdayReport ? undefined : clinic)
  }

  function xmlEscape(value: unknown) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function downloadExcelXml() {
    const rows: Array<Array<string | number>> = [
      ['Relatório', reportType],
      ['Modo', viewMode],
      ['Período', `${dateStart || 'início'} até ${dateEnd || 'fim'}`],
      [],
    ]

    if (reportType === 'geral' || reportType === 'contasPagar') {
      rows.push(['Contas a Pagar'], ['Vencimento', 'Descrição', 'Categoria', 'Valor', 'Status'])
      filteredData.bills.forEach(b => rows.push([b.vencimento, b.descricao, b.categoria || '', b.valor, b.status]))
      rows.push(['Total', '', '', totals.pagar, ''], [])
    }

    if (reportType === 'geral' || reportType === 'contasReceber') {
      rows.push(['Contas a Receber'], ['Vencimento', 'Descrição', 'Categoria', 'Valor', 'Status'])
      filteredData.incomes.forEach(i => rows.push([i.vencimento, i.descricao, i.categoria || '', i.valor, i.status]))
      rows.push(['Total', '', '', totals.receber, ''], [])
    }

    if (reportType === 'bancario' || reportType === 'geral') {
      rows.push(['Movimentação Bancária'], ['Data', 'Descrição', 'Categoria', 'Valor', 'Tipo'])
      filteredData.transactions.forEach(t => rows.push([t.data, t.descricao, t.categoria || '', t.valor, t.tipo]))
      rows.push(['Entradas', '', '', totals.bankIn, ''], ['Saídas', '', '', totals.bankOut, ''], [])
    }

    if (reportType === 'contratos') {
      rows.push(['Contratos'], ['Paciente', 'Início', 'Vencimento', 'Valor', 'Status'])
      filteredData.contratos.forEach(c => rows.push([c.pacienteNome || (c as any).paciente_nome || '', c.dataInicio || (c as any).data_inicio || '', c.dataFim || (c as any).data_fim || '', c.valor, c.status]))
    }

    if (reportType === 'pastaSanitaria') {
      rows.push(['Controle de Documentos da Pasta Sanitaria'])
      rows.push(['Codigo', 'Documento', 'Exigencia', 'Base normativa', 'Periodicidade', 'Responsavel', 'Status'])
      sanitaryDocuments.forEach(doc => rows.push([doc.code, doc.title, doc.requirement, doc.legalBasis, doc.periodicity, doc.responsible, doc.status]))
      rows.push([], ['POPs disponiveis no sistema'], ['Codigo', 'Titulo', 'Base normativa'])
      sanitaryDocuments.filter(doc => doc.isPop).forEach(doc => rows.push([doc.code, doc.title, doc.legalBasis]))
    }

    const sheetRows = rows.map(row => `
      <Row>${row.map(cell => {
        const isNumber = typeof cell === 'number'
        return `<Cell><Data ss:Type="${isNumber ? 'Number' : 'String'}">${xmlEscape(cell)}</Data></Cell>`
      }).join('')}</Row>
    `).join('')

    const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Relatorio">
    <Table>${sheetRows}</Table>
  </Worksheet>
</Workbook>`
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `relatorio-${reportType}-${new Date().toISOString().slice(0, 10)}.xls`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Centro de Relatórios</h1>
          <p className="text-muted-foreground">Analise os dados financeiros e operacionais com filtros avançados</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reloadAll} className="gap-2">
            <Filter className="h-4 w-4" /> Atualizar Dados
          </Button>
          <Button onClick={printReport} className="gap-2">
            <Printer className="h-4 w-4" /> Exportar para PDF
          </Button>
          <Button variant="outline" onClick={downloadExcelXml} className="gap-2">
            <FileText className="h-4 w-4" /> Exportar Excel XML
          </Button>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4 text-primary">
          <Filter className="h-5 w-5" />
          <h2 className="font-semibold text-lg">Parâmetros de Filtro</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Relatório</Label>
            <Select value={reportType} onChange={e => setReportType(e.target.value as any)}>
              <option value="geral">Geral Financeiro</option>
              <option value="contasPagar">Contas a Pagar</option>
              <option value="contasReceber">Contas a Receber</option>
              <option value="bancario">Movimentação Bancária</option>
              <option value="fluxoCaixa">Fluxo de Caixa</option>
              <option value="mapaCategoria">Mapa Comparativo — Contas a Pagar</option>
              <option value="custoPaciente">Custo Efetivo por Paciente</option>
              <option value="contratos">Contratos de Pacientes</option>
              <option value="aniversariantes">Calendário de Aniversariantes</option>
              <option value="pastaSanitaria">Pasta Sanitária / POPs</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Detalhamento</Label>
            <Select value={viewMode} onChange={e => setViewMode(e.target.value as any)}>
              <option value="sintetico">Sintético (Resumido)</option>
              <option value="analitico">Analítico (Detalhado)</option>
            </Select>
          </div>
          <div className="space-y-1">
             <Label className="text-xs">Início</Label>
             <Input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} />
          </div>
          <div className="space-y-1">
             <Label className="text-xs">Fim</Label>
             <Input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4 mt-2">
             <Button variant="outline" size="sm" onClick={() => {
               const now = new Date()
               setDateStart(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10))
               setDateEnd(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10))
             }}>Mês Atual</Button>
             <Button variant="outline" size="sm" onClick={() => {
               const now = new Date()
               setDateStart(new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10))
               setDateEnd(new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10))
             }}>Mês Anterior</Button>
             <Button variant="ghost" size="sm" onClick={() => {
               setDateStart('')
               setDateEnd('')
             }}>Limpar Período</Button>
          </div>
          <div className="space-y-1">
             <Label className="text-xs">Banco (Opcional)</Label>
             <Select value={selectedBank} onChange={e => setSelectedBank(e.target.value)}>
                <option value="">Todos os Bancos</option>
                {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
             </Select>
          </div>
          <div className="space-y-1">
             <Label className="text-xs">Categoria (Opcional)</Label>
             <Select value={selectedCat} onChange={e => setSelectedCat(e.target.value)}>
                <option value="">Todas as Categorias</option>
                <option value="sem-categoria">Sem Categoria</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
             </Select>
          </div>
          {reportType === 'custoPaciente' && (
            <div className="space-y-1">
               <Label className="text-xs">Ordenação %</Label>
               <Select value={patientSort} onChange={e => setPatientSort(e.target.value as any)}>
                 <option value="nome">Nome (A-Z)</option>
                 <option value="pct_asc">Crescente %</option>
                 <option value="pct_desc">Decrescente %</option>
               </Select>
            </div>
          )}
        </div>
      </Card>

      {reportType === 'pastaSanitaria' && (
        <Card className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-lg">Controle de Documentos da Pasta Sanitaria</h3>
              </div>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Relatorio com documentos exigidos para ILPI e POPs vinculados. Inclui expressamente POP 07 - Admissao e Triagem de Residentes e POP 08 - Administracao e Guarda de Medicamentos.
              </p>
            </div>
            <Button onClick={() => printSanitaryFolderReport(sanitaryDocuments, clinic)} className="gap-2">
              <Printer className="h-4 w-4" />
              PDF da Pasta Sanitaria
            </Button>
          </div>

          <div className="mt-6 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3 text-left">Codigo</th>
                  <th className="p-3 text-left">Documento</th>
                  <th className="p-3 text-left">Base normativa</th>
                  <th className="p-3 text-left">Periodicidade</th>
                  <th className="p-3 text-left">Responsavel</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sanitaryDocuments.map(doc => (
                  <tr key={doc.id}>
                    <td className="p-3 font-black text-primary">{doc.code}</td>
                    <td className="p-3">
                      <span className="font-semibold">{doc.title}</span>
                      {doc.isPop && <Badge className="ml-2" variant="success">POP</Badge>}
                    </td>
                    <td className="p-3">{doc.legalBasis}</td>
                    <td className="p-3">{doc.periodicity}</td>
                    <td className="p-3">{doc.responsible}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {reportType !== 'pastaSanitaria' && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
        <Card className="p-6 border-l-4 border-l-green-600">
           <HandCoins className="h-6 w-6 text-green-600 mx-auto mb-2" />
           <p className="text-sm text-muted-foreground uppercase font-semibold">Total Receber</p>
           <p className="text-2xl font-bold text-green-700 mt-1">{formatCurrency(totals.receber)}</p>
           <p className="text-xs mt-2 text-muted-foreground">Efetuado: {formatCurrency(totals.receberEfetuado)}</p>
        </Card>
        <Card className="p-6 border-l-4 border-l-red-600">
           <CreditCard className="h-6 w-6 text-red-600 mx-auto mb-2" />
           <p className="text-sm text-muted-foreground uppercase font-semibold">Total Pagar</p>
           <p className="text-2xl font-bold text-red-700 mt-1">{formatCurrency(totals.pagar)}</p>
           <p className="text-xs mt-2 text-muted-foreground">Efetuado: {formatCurrency(totals.pagarEfetuado)}</p>
        </Card>
        <Card className="p-6 border-l-4 border-l-blue-600">
           <Landmark className="h-6 w-6 text-blue-600 mx-auto mb-2" />
           <p className="text-sm text-muted-foreground uppercase font-semibold">Movim. Bancária</p>
           <p className="text-2xl font-bold text-blue-700 mt-1">{formatCurrency(totals.bankIn - totals.bankOut)}</p>
           <p className="text-xs mt-2 text-muted-foreground">Entradas: {formatCurrency(totals.bankIn)} • Saídas: {formatCurrency(totals.bankOut)}</p>
        </Card>
      </div>
      )}

      {viewMode === 'sintetico' && (reportType === 'geral' || reportType === 'contasPagar' || reportType === 'contasReceber' || reportType === 'bancario') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {reportType === 'geral' || reportType === 'contasPagar' || reportType === 'bancario' ? (
            <Card className="p-4 flex flex-col">
              <h3 className="font-bold text-lg mb-4 text-red-700">
                Resumo por Categoria ({reportType === 'bancario' || reportType === 'geral' ? 'Saídas' : 'Contas a Pagar'})
              </h3>
              <div className="space-y-4 flex-1">
                {Object.entries(totals.categoryBreakdown.bills)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, val]) => {
                    const denominator = (reportType === 'bancario') ? totals.bankOut : totals.pagar;
                    const pct = denominator > 0 ? (val / denominator) * 100 : 0;
                    return (
                      <div key={cat}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{cat}</span>
                          <span className="font-bold">{formatCurrency(val)} ({pct.toFixed(1)}%)</span>
                        </div>
                        <div className="h-2 w-full bg-red-100 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500" style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    )
                  })}
                {Object.keys(totals.categoryBreakdown.bills).length === 0 && (
                  <p className="text-muted-foreground text-sm text-center py-4">Nenhum dado para exibir</p>
                )}
              </div>
            </Card>
          ) : null}

          {reportType === 'geral' || reportType === 'contasReceber' || reportType === 'bancario' ? (
            <Card className="p-4 flex flex-col">
              <h3 className="font-bold text-lg mb-4 text-green-700">
                Resumo por Categoria ({reportType === 'bancario' || reportType === 'geral' ? 'Entradas' : 'Contas a Receber'})
              </h3>
              <div className="space-y-4 flex-1">
                {Object.entries(totals.categoryBreakdown.incomes)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, val]) => {
                    const denominator = (reportType === 'bancario') ? totals.bankIn : totals.receber;
                    const pct = denominator > 0 ? (val / denominator) * 100 : 0;
                    return (
                      <div key={cat}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{cat}</span>
                          <span className="font-bold">{formatCurrency(val)} ({pct.toFixed(1)}%)</span>
                        </div>
                        <div className="h-2 w-full bg-green-100 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500" style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    )
                  })}
                {Object.keys(totals.categoryBreakdown.incomes).length === 0 && (
                  <p className="text-muted-foreground text-sm text-center py-4">Nenhum dado para exibir</p>
                )}
              </div>
            </Card>
          ) : null}
        </div>
      )}
      
      {viewMode === 'analitico' && (
        <Card className="p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <PieChart className="h-5 w-5" /> Detalhamento das Movimentações
          </h3>
          <div className="space-y-6">
            {(reportType === 'geral' || reportType === 'contasPagar') && filteredData.bills.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-red-600 uppercase">Contas a Pagar</h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2 text-left">Vencimento</th>
                        <th className="p-2 text-left">Descrição</th>
                        <th className="p-2 text-right">Valor</th>
                        <th className="p-2 text-right">% Relativa</th>
                        <th className="p-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredData.bills.map(b => (
                        <tr key={b.id} className="border-t">
                          <td className="p-2">{formatDate(b.vencimento)}</td>
                          <td className="p-2">{b.descricao}</td>
                          <td className="p-2 text-right font-medium">{formatCurrency(b.valor)}</td>
                          <td className="p-2 text-right text-xs text-muted-foreground">
                            {((b.valor / (totals.pagar || 1)) * 100).toFixed(1)}%
                          </td>
                          <td className="p-2 text-center"><Badge variant={b.status === 'pago' ? 'success' : 'warning'}>{b.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(reportType === 'geral' || reportType === 'contasReceber') && filteredData.incomes.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-green-600 uppercase">Contas a Receber</h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2 text-left">Vencimento</th>
                        <th className="p-2 text-left">Descrição</th>
                        <th className="p-2 text-right">Valor</th>
                        <th className="p-2 text-right">% Relativa</th>
                        <th className="p-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredData.incomes.map(i => (
                        <tr key={i.id} className="border-t">
                          <td className="p-2">{formatDate(i.vencimento)}</td>
                          <td className="p-2">{i.descricao}</td>
                          <td className="p-2 text-right font-medium">{formatCurrency(i.valor)}</td>
                          <td className="p-2 text-right text-xs text-muted-foreground">
                            {((i.valor / (totals.receber || 1)) * 100).toFixed(1)}%
                          </td>
                          <td className="p-2 text-center"><Badge variant={i.status === 'recebido' ? 'success' : 'warning'}>{i.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(reportType === 'geral' || reportType === 'bancario') && filteredData.transactions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-blue-600 uppercase">Movimentação Bancária</h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2 text-left">Data</th>
                        <th className="p-2 text-left">Descrição</th>
                        <th className="p-2 text-left">Categoria</th>
                        <th className="p-2 text-right">Valor</th>
                        <th className="p-2 text-center">Tipo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredData.transactions.sort((a,b) => b.data.localeCompare(a.data)).map(t => (
                        <tr key={t.id} className="border-t">
                          <td className="p-2">{formatDate(t.data)}</td>
                          <td className="p-2">{t.descricao}</td>
                          <td className="p-2">{t.categoria || 'Não Categorizado'}</td>
                          <td className="p-2 text-right font-medium">{formatCurrency(t.valor)}</td>
                          <td className="p-2 text-center">
                            <Badge variant={t.tipo === 'credito' ? 'success' : 'destructive'}>
                              {t.tipo.toUpperCase()}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {reportType === 'fluxoCaixa' && (
        <Card className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h3 className="font-bold text-lg">Projeção de Fluxo de Caixa (12 Meses)</h3>
            </div>
            <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-lg border">
              <Label className="text-xs font-bold whitespace-nowrap">Média de Custo Mensal (R$):</Label>
              <input 
                type="number" 
                value={estMonthlyCost} 
                onChange={e => setEstMonthlyCost(Number(e.target.value))}
                className="w-32 h-8 bg-background border rounded px-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card className="p-4 bg-primary/5 border-primary/20">
               <p className="text-[10px] text-muted-foreground uppercase font-black">Saldo Atual Bancos</p>
               <p className="text-xl font-bold">{formatCurrency(bankAccounts.reduce((s,a) => s + (a.saldo_atual || 0), 0))}</p>
            </Card>
            <Card className="p-4 bg-green-50 border-green-200">
               <p className="text-[10px] text-green-700 uppercase font-black">Média Entradas (Mensalidades)</p>
               <p className="text-xl font-bold text-green-700">{formatCurrency(projectionData.reduce((s,d) => s + d.in, 0) / (projectionData.length || 1))}</p>
            </Card>
            <Card className="p-4 bg-red-50 border-red-200">
               <p className="text-[10px] text-red-700 uppercase font-black">Custo Médio Projetado</p>
               <p className="text-xl font-bold text-red-700">{formatCurrency(estMonthlyCost)}</p>
            </Card>
            <Card className={`p-4 ${projectionData[11]?.cumulative >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-destructive/10 border-destructive/20'}`}>
               <p className="text-[10px] text-muted-foreground uppercase font-black">Projeção Final (1 Ano)</p>
               <p className={`text-xl font-bold ${projectionData[11]?.cumulative >= 0 ? 'text-blue-700' : 'text-destructive'}`}>
                 {formatCurrency(projectionData[11]?.cumulative || 0)}
               </p>
            </Card>
          </div>

          <div className="border rounded-xl overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[120px]">Mês/Ano</TableHead>
                  <TableHead className="text-right">Entradas Esperadas</TableHead>
                  <TableHead className="text-right">Saídas Projetadas</TableHead>
                  <TableHead className="text-right">Resultado Mensal</TableHead>
                  <TableHead className="text-right font-bold text-primary">Saldo Acumulado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectionData.map((d, idx) => (
                  <TableRow key={d.monthStr} className={idx === 0 ? 'bg-primary/5 font-medium' : ''}>
                    <td className="p-3 font-semibold uppercase">{d.label}</td>
                    <td className="p-3 text-right text-green-600 font-medium">{formatCurrency(d.in)}</td>
                    <td className="p-3 text-right text-red-600">{formatCurrency(d.out)}</td>
                    <td className={`p-3 text-right font-bold ${d.balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {d.balance >= 0 ? '+' : ''}{formatCurrency(d.balance)}
                    </td>
                    <td className={`p-3 text-right font-black ${d.cumulative >= 0 ? 'text-blue-700' : 'text-destructive'}`}>
                      {formatCurrency(d.cumulative)}
                    </td>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 p-4 bg-muted/30 rounded-lg text-xs text-muted-foreground flex gap-2">
             <Heart className="h-4 w-4 shrink-0" />
             <p>Nota: A projeção utiliza o saldo atual das contas bancárias como ponto de partida. As saídas consideram as contas a pagar reais registradas ou a média mensal estipulada caso não existam lançamentos para o mês.</p>
          </div>
        </Card>
      )}

      {reportType === 'custoPaciente' && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
             <Users className="h-5 w-5 text-primary" />
             <h3 className="font-bold text-lg">Análise de Custo por Paciente</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="p-4 bg-muted/30 rounded-lg border">
              <p className="text-xs text-muted-foreground uppercase font-bold">Total Despesas</p>
              <p className="text-xl font-bold mt-1">{formatCurrency(totals.totalExpenses)}</p>
              <p className="text-[10px] text-muted-foreground">Baseado na Mov. Bancária</p>
            </div>
            <div className="p-4 bg-muted/30 rounded-lg border">
              <p className="text-xs text-muted-foreground uppercase font-bold">Pacientes Ativos</p>
              <p className="text-xl font-bold mt-1">{totals.patientCount}</p>
              <p className="text-[10px] text-muted-foreground">Base atualizada</p>
            </div>
            <div className="p-4 bg-primary/10 rounded-lg border border-primary/20 md:col-span-2">
              <p className="text-xs text-primary uppercase font-bold">Custo Médio p/ Paciente</p>
              <p className="text-2xl font-black text-primary mt-1">{formatCurrency(totals.avgCostPerPatient)}</p>
              <p className="text-[10px] text-primary/70 italic">Calculado com base nas saídas do período</p>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3 text-left">Paciente</th>
                  <th className="p-3 text-right">Mensalidade</th>
                  <th className="p-3 text-right">Custo Médio</th>
                  <th className="p-3 text-right">Diferença</th>
                  <th className="p-3 text-right">% Custo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedPatients.map(p => {
                  const diff = p.mensalidade - totals.avgCostPerPatient
                  
                  return (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium">{p.nome}</td>
                      <td className="p-3 text-right font-semibold text-green-700">{formatCurrency(p.mensalidade)}</td>
                      <td className="p-3 text-right text-red-600">{formatCurrency(totals.avgCostPerPatient)}</td>
                      <td className={`p-3 text-right font-bold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(diff)}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <Badge variant={p.pct > 80 ? 'destructive' : p.pct > 50 ? 'warning' : 'success'}>
                          {p.pct.toFixed(1)}%
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-muted/50 font-bold border-t">
                <tr>
                  <td className="p-3">TOTAL (Média)</td>
                  <td className="p-3 text-right text-green-700">
                    {formatCurrency(filteredData.patients.reduce((s,p) => s + (contracts.find(c => (c.pacienteId || (c as any).paciente_id) === p.id && c.status === 'ativo')?.valor || 0), 0))}
                  </td>
                  <td className="p-3 text-right text-red-700">{formatCurrency(totals.totalExpenses)}</td>
                  <td className="p-3" colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {reportType === 'contratos' && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
             <FileText className="h-5 w-5 text-primary" />
             <h3 className="font-bold text-lg">Relatório de Contratos</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="p-4 bg-muted/30 rounded-lg border text-center">
              <p className="text-xs text-muted-foreground uppercase font-bold">Total Listado</p>
              <p className="text-xl font-bold mt-1">{filteredData.contratos.length}</p>
            </div>
            <div className="p-4 bg-muted/30 rounded-lg border text-center">
              <p className="text-xs text-muted-foreground uppercase font-bold">Contratos Ativos</p>
              <p className="text-xl font-bold mt-1 text-green-700">{filteredData.contratos.filter(c => c.status === 'ativo').length}</p>
            </div>
            <div className="p-4 bg-muted/30 rounded-lg border text-center">
              <p className="text-xs text-muted-foreground uppercase font-bold">Valor Total (Ativos)</p>
              <p className="text-xl font-bold mt-1 text-primary">{formatCurrency(filteredData.contratos.filter(c => c.status === 'ativo').reduce((s,c) => s+c.valor, 0))}</p>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3 text-left">Paciente</th>
                  <th className="p-3 text-left">Data Início</th>
                  <th className="p-3 text-left">Vencimento</th>
                  <th className="p-3 text-right">Valor</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredData.contratos.length === 0 ? (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nenhum contrato encontrado no período</td></tr>
                ) : (
                  filteredData.contratos.map(c => (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium">{c.pacienteNome || (c as any).paciente_nome || '---'}</td>
                      <td className="p-3">{formatDate(c.dataInicio || (c as any).data_inicio)}</td>
                      <td className="p-3">{formatDate(c.dataFim || (c as any).data_fim)}</td>
                      <td className="p-3 text-right font-semibold text-primary">{formatCurrency(c.valor)}</td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <Badge variant={c.status === 'ativo' ? 'success' : c.status === 'cancelado' ? 'destructive' : 'warning'}>
                          {c.status.toUpperCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {reportType === 'mapaCategoria' && (() => {
        const { months, categories: cats, grid, monthTotals, categoryTotals, grandTotal = 0 } = mapaData
        // Max value in any cell for heat intensity
        const maxCell = Math.max(
          ...cats.flatMap(cat => months.map(m => grid[cat]?.[m.key] || 0)),
          1
        )
        const heatColor = (val: number) => {
          if (val === 0) return 'transparent'
          const intensity = Math.round((val / maxCell) * 100)
          if (intensity > 80) return 'rgba(239,68,68,0.85)'
          if (intensity > 60) return 'rgba(239,68,68,0.60)'
          if (intensity > 40) return 'rgba(239,68,68,0.38)'
          if (intensity > 20) return 'rgba(239,68,68,0.20)'
          return 'rgba(239,68,68,0.09)'
        }
        const textColor = (val: number) => {
          const intensity = Math.round((val / maxCell) * 100)
          return intensity > 60 ? '#fff' : 'inherit'
        }
        return (
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-5 w-5 text-red-600" />
              <h3 className="font-bold text-lg">Mapa Comparativo — Contas a Pagar por Categoria</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">Últimos 12 meses • Intensidade de cor indica volume de gastos</p>

            {/* Summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="p-3 bg-red-50 rounded-lg border border-red-100 text-center">
                <p className="text-[10px] text-red-600 uppercase font-black">Total 12 meses</p>
                <p className="text-lg font-bold text-red-700 mt-1">{formatCurrency(grandTotal)}</p>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg border text-center">
                <p className="text-[10px] text-muted-foreground uppercase font-black">Categorias</p>
                <p className="text-lg font-bold mt-1">{cats.length}</p>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg border text-center">
                <p className="text-[10px] text-muted-foreground uppercase font-black">Média Mensal</p>
                <p className="text-lg font-bold mt-1">{formatCurrency(grandTotal / 12)}</p>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg border text-center">
                <p className="text-[10px] text-muted-foreground uppercase font-black">Maior Mês</p>
                <p className="text-lg font-bold text-red-700 mt-1">
                  {formatCurrency(Math.max(...Object.values(monthTotals), 0))}
                </p>
              </div>
            </div>

            {cats.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">Nenhuma conta a pagar registrada nos últimos 12 meses.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border shadow-sm">
                <table className="w-full text-xs border-collapse" style={{ minWidth: `${180 + months.length * 90}px` }}>
                  <thead>
                    <tr className="bg-muted/60">
                      <th className="p-2 text-left font-bold sticky left-0 bg-muted/60 z-10 min-w-[160px] border-b border-r">
                        Categoria
                      </th>
                      {months.map(m => (
                        <th key={m.key} className="p-2 text-center font-semibold border-b border-r whitespace-nowrap">
                          {m.label}
                        </th>
                      ))}
                      <th className="p-2 text-right font-bold border-b bg-muted/40 whitespace-nowrap">Total</th>
                      <th className="p-2 text-right font-bold border-b bg-muted/40 whitespace-nowrap">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cats.map((cat, rowIdx) => (
                      <tr key={cat} className={rowIdx % 2 === 0 ? 'bg-white dark:bg-background' : 'bg-muted/20'}>
                        <td className="p-2 font-medium sticky left-0 z-10 border-r truncate max-w-[160px]"
                          style={{ background: rowIdx % 2 === 0 ? 'var(--background, #fff)' : 'rgba(0,0,0,0.02)' }}
                          title={cat}>
                          {cat}
                        </td>
                        {months.map(m => {
                          const val = grid[cat]?.[m.key] || 0
                          return (
                            <td key={m.key}
                              className="p-2 text-right border-r font-medium tabular-nums"
                              style={{ background: heatColor(val), color: textColor(val) }}
                              title={val > 0 ? formatCurrency(val) : '—'}>
                              {val > 0 ? formatCurrency(val).replace('R$\u00a0', 'R$') : <span className="text-muted-foreground/40">—</span>}
                            </td>
                          )
                        })}
                        <td className="p-2 text-right font-bold tabular-nums text-red-700">
                          {formatCurrency(categoryTotals[cat])}
                        </td>
                        <td className="p-2 text-right tabular-nums text-muted-foreground">
                          {grandTotal > 0 ? ((categoryTotals[cat] / grandTotal) * 100).toFixed(1) : '0.0'}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/50 font-bold border-t-2">
                      <td className="p-2 sticky left-0 z-10 bg-muted/50 border-r">TOTAL MENSAL</td>
                      {months.map(m => (
                        <td key={m.key} className="p-2 text-right border-r tabular-nums text-red-700">
                          {monthTotals[m.key] ? formatCurrency(monthTotals[m.key]) : <span className="text-muted-foreground/40">—</span>}
                        </td>
                      ))}
                      <td className="p-2 text-right text-red-700 tabular-nums">{formatCurrency(grandTotal)}</td>
                      <td className="p-2 text-right">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Category bar chart */}
            {cats.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-bold text-muted-foreground uppercase mb-3">Distribuição por Categoria (12 meses)</h4>
                <div className="space-y-2">
                  {cats.slice(0, 10).map(cat => {
                    const pct = grandTotal > 0 ? (categoryTotals[cat] / grandTotal) * 100 : 0
                    return (
                      <div key={cat}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium truncate max-w-[200px]" title={cat}>{cat}</span>
                          <span className="font-bold text-red-700 ml-4 whitespace-nowrap">
                            {formatCurrency(categoryTotals[cat])} ({pct.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="h-2 w-full bg-red-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #f87171, #dc2626)' }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </Card>
        )
      })()}

      {reportType === 'aniversariantes' && (
        <Card className="p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h3 className="font-bold text-lg">Calendário de Aniversariantes</h3>
            </div>
            <p className="text-sm text-muted-foreground italic">Pacientes e Funcionários organizados por mês</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"].map((month, idx) => {
              const people = [
                ...patients.filter(p => p.status === 'ativo').map(p => ({ nome: p.nome, data: p.data_nascimento, tipo: 'Paciente' })),
                ...employees.filter(e => e.status === 'ativo').map(e => ({ nome: e.nome, data: e.data_nascimento, tipo: 'Funcionário' }))
              ].filter(p => p.data && new Date(p.data).getUTCMonth() === idx)
              .sort((a, b) => new Date(a.data!).getUTCDate() - new Date(b.data!).getUTCDate());

              return (
                <div key={month} className="border rounded-lg overflow-hidden flex flex-col h-full bg-card shadow-sm hover:shadow-md transition-shadow">
                  <div className="bg-primary/10 p-2 text-center font-bold text-primary border-b border-primary/20">
                    {month.toUpperCase()}
                  </div>
                  <div className="p-3 flex-1">
                    {people.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground text-center py-4 italic">Nenhum aniversariante</p>
                    ) : (
                      <ul className="space-y-2">
                        {people.map((p, i) => {
                          const day = new Date(p.data!).getUTCDate();
                          return (
                            <li key={i} className="text-[11px] flex justify-between items-center gap-2">
                              <span className="font-bold w-5">{day.toString().padStart(2, '0')}</span>
                              <span className="flex-1 truncate" title={p.nome}>{p.nome}</span>
                              <Badge variant="outline" className="text-[9px] px-1 h-3.5 font-normal scale-90 origin-right">
                                {p.tipo === 'Paciente' ? 'Pac.' : 'Func.'}
                              </Badge>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
