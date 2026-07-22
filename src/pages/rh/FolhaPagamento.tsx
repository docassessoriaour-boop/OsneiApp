import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import { formatCurrency } from '@/lib/utils'
import type { Employee, Payroll, PayrollAdicional, ScheduleException, Bill, BankAccount } from '@/lib/types'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF, formatCurrencyPDF, formatDatePDF } from '@/lib/pdf'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchBar } from '@/components/shared/SearchBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogClose, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Pencil, Trash2, FileText, Plus, X, CalendarClock, Loader2, Banknote, Printer, CheckCircle2 } from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, differenceInCalendarDays, getDaysInMonth, subMonths } from 'date-fns'

const emptyAdicional: PayrollAdicional = { descricao: '', tipo: 'provento', valor: 0 }

type PayrollDateFilter = 'current' | 'previous' | 'period'

function monthBounds(month: string) {
  const date = parseISO(`${month}-01`)
  return {
    start: format(startOfMonth(date), 'yyyy-MM-dd'),
    end: format(endOfMonth(date), 'yyyy-MM-dd'),
  }
}

function payrollMatchesPeriod(p: Payroll, start: string, end: string) {
  const payrollStart = p.periodoInicio || (p.mesReferencia ? monthBounds(p.mesReferencia).start : '')
  const payrollEnd = p.periodoFim || (p.mesReferencia ? monthBounds(p.mesReferencia).end : payrollStart)

  if (!payrollStart || !payrollEnd) return false
  return payrollStart <= end && payrollEnd >= start
}

export default function FolhaPagamento() {
  const { data: rawEmployees } = useDb<Employee>('employees')
  // Normaliza: DB retorna data_admissao (snake_case), código usa dataAdmissao (camelCase)
  const employees = [...rawEmployees].map((e: any) => ({ ...e, dataAdmissao: e.dataAdmissao || e.data_admissao || '' })) as Employee[]
  employees.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
  const { data: rawPayrolls, loading, insert, update, remove } = useDb<Payroll>('payrolls')
  
  const payrolls = rawPayrolls.map((p: any) => ({
    ...p,
    funcionarioId: p.funcionarioId || p.funcionario_id,
    funcionarioNome: p.funcionarioNome || p.funcionario_nome,
    salarioBruto: p.salarioBruto ?? p.salario_bruto ?? 0,
    salarioLiquido: p.salarioLiquido ?? p.salario_liquido ?? 0,
    mesReferencia: p.mesReferencia || p.mes_referencia,
    periodoInicio: p.periodoInicio || p.periodo_inicio,
    periodoFim: p.periodoFim || p.periodo_fim,
  })) as Payroll[]
  const { data: exceptions } = useDb<ScheduleException>('schedule_exceptions')
  const { data: bills, insert: insertBill, update: updateBill } = useDb<Bill>('bills')
  const { data: bankAccounts } = useDb<BankAccount>('bank_accounts')
  const { insert: insertBankTx } = useDb<any>('bank_transactions')
  
  const [clinic] = useClinic()
  const [search, setSearch] = useState('')
  const currentMonth = format(new Date(), 'yyyy-MM')
  const previousMonth = format(subMonths(new Date(), 1), 'yyyy-MM')
  const currentMonthBounds = monthBounds(currentMonth)
  const [dateFilter, setDateFilter] = useState<PayrollDateFilter>('current')
  const [periodStart, setPeriodStart] = useState(currentMonthBounds.start)
  const [periodEnd, setPeriodEnd] = useState(currentMonthBounds.end)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [massDialogOpen, setMassDialogOpen] = useState(false)
  const [massMonth, setMassMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [generating, setGenerating] = useState(false)

  // --- Dialog Dar Baixa ---
  const [baixaOpen, setBaixaOpen] = useState(false)
  const [baixaPayroll, setBaixaPayroll] = useState<Payroll | null>(null)
  const [baixaForm, setBaixaForm] = useState({ dataPagamento: new Date().toISOString().slice(0, 10), bank_account_id: '' })
  const [baixaSaving, setBaixaSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    funcionarioId: '',
    salarioBruto: 0,
    descontos: 0,
    mesReferencia: new Date().toISOString().slice(0, 7),
    status: 'pendente' as Payroll['status'],
    periodoInicio: '',
    periodoFim: '',
    tipo_periodo: 'mes' as 'mes' | 'periodo' | '13_salario',
    observacoes: '',
  })
  const [adicionais, setAdicionais] = useState<PayrollAdicional[]>([])

  const activeFilterBounds = dateFilter === 'previous'
    ? monthBounds(previousMonth)
    : dateFilter === 'period'
      ? { start: periodStart, end: periodEnd }
      : currentMonthBounds

  const filtered = payrolls.filter((p) => {
    const matchesSearch = (p.funcionarioNome || '').toLowerCase().includes((search || '').toLowerCase())
    const matchesDate = activeFilterBounds.start && activeFilterBounds.end
      ? payrollMatchesPeriod(p, activeFilterBounds.start, activeFilterBounds.end)
      : true

    return matchesSearch && matchesDate
  }).sort((a, b) => (a.funcionarioNome || '').localeCompare(b.funcionarioNome || ''))

  function countWorkedDays(employee: Employee | undefined, start: string, end: string) {
    if (!employee || !start || !end) return 0
    const periodStartDate = parseISO(start)
    const periodEndDate = parseISO(end)
    const periodDays = eachDayOfInterval({ start: periodStartDate, end: periodEndDate })

    return periodDays.reduce((total, day) => {
      const dateStr = format(day, 'yyyy-MM-dd')
      const exception = exceptions.find(ex => ex.employee_id === employee.id && ex.date === dateStr)

      if (exception) return total + (exception.is_working ? 1 : 0)
      if (employee.escala === '40h' || employee.escala === 'Mensalista') {
        const dow = getDay(day)
        return total + (dow >= 1 && dow <= 5 ? 1 : 0)
      }
      if (employee.escala === '12x36' && employee.dataAdmissao) {
        const diff = differenceInCalendarDays(day, parseISO(employee.dataAdmissao))
        return total + (diff % 2 === 0 ? 1 : 0)
      }

      return total
    }, 0)
  }

  function calculateEmployeeSalary(employee: Employee | undefined, multiplier: number, start: string, end: string, tipoPeriodo: typeof form.tipo_periodo) {
    const baseSalary = employee?.salario || 0
    if (employee?.salario_tipo === 'diaria' && tipoPeriodo !== '13_salario') {
      return Number((baseSalary * countWorkedDays(employee, start, end)).toFixed(2))
    }
    return Number((baseSalary * multiplier).toFixed(2))
  }

  function calculateVtValue(employee: Employee | undefined, multiplier: number, workedDays: number) {
    if (!employee?.tem_vt) return 0
    if (employee.vt_tipo === 'diaria') return Number(((employee.vt_valor || 0) * workedDays).toFixed(2))
    return Number(((employee.vt_valor || 0) * multiplier).toFixed(2))
  }

  // Computed totals
  const totalProventos = adicionais.filter(a => a.tipo === 'provento').reduce((s, a) => s + a.valor, 0)
  const totalDescontos = adicionais.filter(a => a.tipo === 'desconto').reduce((s, a) => s + a.valor, 0)
  const salarioLiquidoCalc = form.salarioBruto + totalProventos - form.descontos - totalDescontos

  async function handleSave() {
    const emp = employees.find(e => e.id === form.funcionarioId)
    if (!emp) return
    
    const payrollData = {
      funcionario_id: form.funcionarioId,
      funcionario_nome: emp.nome,
      cargo: emp.cargo,
      salario_bruto: form.salarioBruto,
      descontos: form.descontos + totalDescontos,
      salario_liquido: salarioLiquidoCalc,
      mes_referencia: form.mesReferencia,
      status: form.status,
      periodo_inicio: form.periodoInicio || null,
      periodo_fim: form.periodoFim || null,
      adicionais: adicionais.length > 0 ? adicionais : [],
      tipo_periodo: form.tipo_periodo,
      observacoes: form.observacoes || '',
    }

    try {
      if (editingId) {
        await update(editingId, payrollData as any)
      } else {
        const result = await insert(payrollData as any)
        
        // If pro-labore, generate a bill in Contas a Pagar
        if (emp.is_pro_labore) {
          await insertBill({
            descricao: `Pro-Labore - ${emp.nome} - ${form.mesReferencia}`,
            valor: salarioLiquidoCalc,
            vencimento: new Date().toISOString().slice(0, 10), // Default to today
            status: 'pendente',
            categoria: 'Pró-Labore'
          } as Omit<Bill, 'id'>)
        }
      }
      setDialogOpen(false)
    } catch {
      alert('Erro ao salvar folha')
    }
  }

  async function handleMassGenerate() {
    setGenerating(true)
    try {
      const activeEmployees = employees.filter(e => e.status === 'ativo')
      const targetMonth = parseISO(massMonth + '-01')
      const monthStart = startOfMonth(targetMonth)
      const monthEnd = endOfMonth(targetMonth)
      const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

      for (const emp of activeEmployees) {
        // Verifica se já existe folha para este mês
        const exists = payrolls.some(p => p.funcionarioId === emp.id && p.mesReferencia === massMonth)
        if (exists) continue

        // Cálculo de dias trabalhados via Escala
        let workedDays = 0
        let dobrasCount = 0
        days.forEach(day => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const exception = exceptions.find(ex => ex.employee_id === emp.id && ex.date === dateStr)
          
          let works = false
          let is_dobra = false

          if (exception) {
            works = exception.is_working
            is_dobra = !!exception.is_dobra
          } else if (emp.escala === '40h' || emp.escala === 'Mensalista') {
            const dow = getDay(day)
            works = dow >= 1 && dow <= 5
          } else if (emp.escala === '12x36' && emp.dataAdmissao) {
            const diff = differenceInCalendarDays(day, parseISO(emp.dataAdmissao))
            works = diff % 2 === 0
          }
          
          if (works) workedDays++
          if (is_dobra) dobrasCount++
        })

        if (workedDays > 0 || emp.escala === 'Mensalista' || emp.is_pro_labore) {
          let multiplier = 1

          const baseSalary = emp.salario_tipo === 'diaria'
            ? Number(((emp.salario || 0) * workedDays).toFixed(2))
            : Number(((emp.salario || 0) * multiplier).toFixed(2))
          const fixedDiscounts = emp.descontos_fixos || 0

          const payloadAdicionais: PayrollAdicional[] = []
          if (dobrasCount > 0) {
             payloadAdicionais.push({
                descricao: `Dobra de Turno (${dobrasCount}x)`,
                tipo: 'provento',
                valor: 0 
             })
          }
          if (emp.tem_vt) {
             payloadAdicionais.push({
                descricao: 'Vale Transporte',
                tipo: 'provento',
                valor: calculateVtValue(emp, multiplier, workedDays)
             })
          }
          if (emp.tem_insalubridade && emp.insalubridade_percentual) {
             payloadAdicionais.push({
                descricao: `Adicional Insalubridade (${emp.insalubridade_percentual}%)`,
                tipo: 'provento',
                valor: Number((baseSalary * (emp.insalubridade_percentual / 100)).toFixed(2))
             })
          }
          const totalProventosGerados = payloadAdicionais.filter(a => a.tipo === 'provento').reduce((s, a) => s + a.valor, 0)
          const totalDescontosGerados = payloadAdicionais.filter(a => a.tipo === 'desconto').reduce((s, a) => s + a.valor, 0)

          const payrollResult = await insert({
            funcionario_id: emp.id,
            funcionario_nome: emp.nome,
            cargo: emp.cargo,
            salario_bruto: baseSalary,
            descontos: fixedDiscounts,
            salario_liquido: baseSalary + totalProventosGerados - fixedDiscounts - totalDescontosGerados,
            mes_referencia: massMonth,
            status: 'pendente',
            periodo_inicio: format(monthStart, 'yyyy-MM-dd'),
            periodo_fim: format(monthEnd, 'yyyy-MM-dd'),
            observacoes: emp.is_pro_labore ? 'Retirada de Pró-Labore.' : `Gerado via escala: ${workedDays} turnos/dias identificados${emp.salario_tipo === 'diaria' ? ', salário calculado por diária' : ''}${emp.vt_tipo === 'diaria' ? ', VT por dia trabalhado' : ''}${dobrasCount > 0 ? `, incluindo ${dobrasCount} dobra(s)` : ''}.`,
            adicionais: payloadAdicionais
          } as any)

          // If pro-labore, generate a bill
          if (emp.is_pro_labore) {
            await insertBill({
              descricao: `Pro-Labore - ${emp.nome} - ${massMonth}`,
              valor: emp.salario || 0,
              vencimento: new Date().toISOString().slice(0, 10),
              status: 'pendente',
              categoria: 'Pró-Labore'
            } as Omit<Bill, 'id'>)
          }
        }
      }
      alert('Folhas geradas com sucesso para os funcionários escalados no mês.')
      setMassDialogOpen(false)
    } catch (e: unknown) {
      console.error(e)
      alert('Erro ao gerar folhas em massa')
    } finally {
      setGenerating(false)
    }
  }

  function openNew() {
    const firstEmp = employees.filter(e => e.status === 'ativo')[0]
    const start = format(startOfMonth(new Date()), 'yyyy-MM-dd')
    const end = format(endOfMonth(new Date()), 'yyyy-MM-dd')
    const workedDays = countWorkedDays(firstEmp, start, end)
    setForm({
      funcionarioId: firstEmp?.id || '',
      salarioBruto: firstEmp?.salario_tipo === 'diaria'
        ? Number(((firstEmp?.salario || 0) * workedDays).toFixed(2))
        : firstEmp?.salario || 0,
      descontos: firstEmp?.descontos_fixos || 0,
      mesReferencia: new Date().toISOString().slice(0, 7),
      status: 'pendente',
      periodoInicio: start,
      periodoFim: end,
      tipo_periodo: 'mes' as 'mes' | 'periodo' | '13_salario',
      observacoes: '',
    })
    
    const initialAdicionais: PayrollAdicional[] = []
    if (firstEmp) {
      if (firstEmp.tem_vt) {
        initialAdicionais.push({
          descricao: 'Vale Transporte',
          tipo: 'provento',
          valor: calculateVtValue(firstEmp, 1, workedDays)
        })
      }
      if (firstEmp.tem_insalubridade && firstEmp.insalubridade_percentual) {
        const salaryBase = firstEmp.salario_tipo === 'diaria'
          ? Number(((firstEmp.salario || 0) * workedDays).toFixed(2))
          : firstEmp.salario || 0
        const fullInsalubridade = salaryBase * (firstEmp.insalubridade_percentual / 100)
        initialAdicionais.push({
          descricao: `Adicional Insalubridade (${firstEmp.insalubridade_percentual}%)`,
          tipo: 'provento',
          valor: Number(fullInsalubridade.toFixed(2))
        })
      }
    }
    setAdicionais(initialAdicionais)
    setEditingId(null)
    setDialogOpen(true)
  }


  function openEdit(p: Payroll) {
    const descAdicionais = p.adicionais?.filter(a => a.tipo === 'desconto').reduce((s, a) => s + a.valor, 0) || 0
    setForm({
      funcionarioId: p.funcionarioId,
      salarioBruto: p.salarioBruto,
      descontos: p.descontos - descAdicionais,
      mesReferencia: p.mesReferencia,
      status: p.status,
      periodoInicio: p.periodoInicio || '',
      periodoFim: p.periodoFim || '',
      tipo_periodo: p.tipo_periodo || (p.periodoInicio && p.periodoFim ? 'periodo' : 'mes'),
      observacoes: p.observacoes || '',
    })
    setAdicionais(p.adicionais || [])
    setEditingId(p.id)
    setDialogOpen(true)
  }

  function addAdicional() {
    setAdicionais([...adicionais, { ...emptyAdicional }])
  }

  function removeAdicional(idx: number) {
    setAdicionais(adicionais.filter((_, i) => i !== idx))
  }

  function updateAdicional(idx: number, field: keyof PayrollAdicional, value: string | number) {
    setAdicionais(adicionais.map((a, i) => i === idx ? { ...a, [field]: value } : a))
  }

  function updatePeriodAndSalary(val: 'mes' | 'periodo' | '13_salario', start: string, end: string, month: string) {
    setForm(prev => {
      const emp = employees.find(e => e.id === prev.funcionarioId)
      let baseSalario = emp?.salario || 0
      let novoSalario = baseSalario
      let multiplier = 1
      let workedDays = countWorkedDays(emp, start, end)

      if (val === 'periodo' && start && end) {
        const dias = differenceInCalendarDays(parseISO(end), parseISO(start)) + 1
        if (dias > 0) {
          multiplier = dias / 30
          novoSalario = calculateEmployeeSalary(emp, multiplier, start, end, val)
        }
      } else if (val === '13_salario') {
        const year = parseInt(month.split('-')[0], 10) || new Date().getFullYear();
        const endCalculated = end ? parseISO(end) : parseISO(`${year}-12-31`);
        if (emp?.dataAdmissao) {
          const admissao = parseISO(emp.dataAdmissao);
          const anoAdmissao = admissao.getFullYear();
          if (anoAdmissao < year) {
            let meses = 0;
            for (let m = 0; m <= endCalculated.getMonth(); m++) {
               if (m === endCalculated.getMonth()) {
                 if (endCalculated.getDate() >= 15) meses++;
               } else {
                 meses++;
               }
            }
            multiplier = meses / 12;
          } else if (anoAdmissao > year) {
            multiplier = 0;
          } else {
            let meses = 0;
            for (let m = admissao.getMonth(); m <= endCalculated.getMonth(); m++) {
              if (m === admissao.getMonth() && m === endCalculated.getMonth()) {
                 const diasTrabalhados = endCalculated.getDate() - admissao.getDate() + 1;
                 if (diasTrabalhados >= 15) meses++;
              } else if (m === admissao.getMonth()) {
                const daysInMonth = getDaysInMonth(admissao);
                const diasTrabalhados = daysInMonth - admissao.getDate() + 1;
                if (diasTrabalhados >= 15) meses++;
              } else if (m === endCalculated.getMonth()) {
                if (endCalculated.getDate() >= 15) meses++;
              } else {
                meses++;
              }
            }
            multiplier = meses / 12;
          }
        }
        novoSalario = calculateEmployeeSalary(emp, multiplier, start, end, val);
      } else {
        novoSalario = calculateEmployeeSalary(emp, multiplier, start, end, val)
      }

      setAdicionais(prevAdics => {
        let updated = prevAdics.map(a => {
          if (a.descricao === 'Vale Transporte' && emp?.tem_vt) {
            return { ...a, valor: calculateVtValue(emp, multiplier, workedDays) }
          }
          if (a.descricao.startsWith('Adicional Insalubridade') && emp?.tem_insalubridade) {
            return { ...a, valor: Number((novoSalario * (emp.insalubridade_percentual / 100)).toFixed(2)) }
          }
          return a
        })
        if (val === '13_salario') {
          updated = updated.filter(a => a.descricao !== 'Vale Transporte');
        }
        return updated;
      })

      return { ...prev, tipo_periodo: val, periodoInicio: start, periodoFim: end, mesReferencia: month, salarioBruto: novoSalario }
    })
  }

  // PDF Pay Receipt
  function printReceipt(p: Payroll) {
    const emp = employees.find(e => e.id === p.funcionarioId)
    const periodo = p.periodoInicio && p.periodoFim
      ? `${formatDatePDF(p.periodoInicio)} a ${formatDatePDF(p.periodoFim)}`
      : p.mesReferencia

    let rows = `
      <tr><td>${p.tipo_periodo === '13_salario' ? '13º Salário' : 'Salário Base'}</td><td class="text-right">${formatCurrencyPDF(p.salarioBruto)}</td></tr>
    `
    if (p.adicionais) {
      for (const a of p.adicionais) {
        rows += `<tr><td>${a.descricao} (${a.tipo === 'provento' ? 'Provento' : 'Desconto'})</td>
          <td class="text-right ${a.tipo === 'provento' ? 'text-green' : 'text-red'}">${a.tipo === 'provento' ? '+' : '-'}${formatCurrencyPDF(a.valor)}</td></tr>`
      }
    }
    rows += `<tr><td>Descontos Gerais</td><td class="text-right text-red">-${formatCurrencyPDF(p.descontos - (p.adicionais?.filter(a => a.tipo === 'desconto').reduce((s, a) => s + a.valor, 0) || 0))}</td></tr>`

    const html = `
      <div style="margin-bottom:16px;">
        <p><strong>Funcionário:</strong> ${p.funcionarioNome}</p>
        <p><strong>CPF:</strong> ${emp?.cpf || '—'}</p>
        <p><strong>Cargo:</strong> ${p.cargo}</p>
        <p><strong>Período:</strong> ${periodo}</p>
      </div>
      <table>
        <thead><tr><th>Descrição</th><th class="text-right">Valor</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="divider"></div>
      <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:700;">
        <span>Salário Líquido</span>
        <span>${formatCurrencyPDF(p.salarioLiquido)}</span>
      </div>
      ${p.observacoes ? `<div style="margin-top:16px;padding:10px;background:#f9f9f9;border-radius:6px;"><strong>Observações:</strong><br/>${p.observacoes}</div>` : ''}
      <div class="signature">
        <div class="signature-line"><hr/><span>Empregador</span></div>
        <div class="signature-line"><hr/><span>Funcionário</span></div>
      </div>
    `
    printPDF(`Recibo de Pagamento — ${p.funcionarioNome}`, html, clinic)
  }

  function printRelatorio() {
    const rows = filtered.map(p => {
      const periodo = p.periodoInicio && p.periodoFim
        ? `${formatDatePDF(p.periodoInicio)} a ${formatDatePDF(p.periodoFim)}`
        : p.mesReferencia
      return `
        <tr>
          <td>${p.funcionarioNome}</td>
          <td>${p.cargo}</td>
          <td>${periodo}</td>
          <td class="text-right">${formatCurrencyPDF(p.salarioBruto)}</td>
          <td class="text-right text-red">${formatCurrencyPDF(p.descontos)}</td>
          <td class="text-right font-bold">${formatCurrencyPDF(p.salarioLiquido)}</td>
          <td class="text-center">${p.status === 'pago' ? 'Pago' : 'Pendente'}</td>
        </tr>
      `
    }).join('')

    const totalBruto = filtered.reduce((acc, p) => acc + p.salarioBruto, 0)
    const totalDescontos = filtered.reduce((acc, p) => acc + p.descontos, 0)
    const totalLiquido = filtered.reduce((acc, p) => acc + p.salarioLiquido, 0)

    const html = `
      <table style="font-size: 9pt;">
        <thead>
          <tr>
            <th>Funcionário</th>
            <th>Cargo</th>
            <th>Período</th>
            <th class="text-right">Sal. Bruto</th>
            <th class="text-right">Descontos</th>
            <th class="text-right">Sal. Líquido</th>
            <th class="text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length > 0 ? rows : '<tr><td colspan="7" class="text-center">Nenhum registro encontrado</td></tr>'}
        </tbody>
      </table>
      <div class="divider"></div>
      <div style="display:flex; justify-content:flex-end; gap: 40px; font-size:12pt; font-weight:700; margin-top: 10px;">
        <span>Bruto: ${formatCurrencyPDF(totalBruto)}</span>
        <span class="text-red">Descontos: ${formatCurrencyPDF(totalDescontos)}</span>
        <span class="text-green">Total Líquido: ${formatCurrencyPDF(totalLiquido)}</span>
      </div>
    `
    printPDF('Relatório de Folha de Pagamento', html, clinic)
  }

  // Abre dialog de dar baixa — confronta bill existente
  function openDarBaixa(p: Payroll) {
    setBaixaPayroll(p)
    setBaixaForm({ dataPagamento: new Date().toISOString().slice(0, 10), bank_account_id: bankAccounts[0]?.id || '' })
    setBaixaOpen(true)
  }

  // Dar baixa: confronta, cria ou paga bill, atualiza folha — sem duplicar
  async function handleDarBaixa() {
    if (!baixaPayroll) return
    if (!baixaForm.bank_account_id) { alert('Selecione a conta bancária para lançar o pagamento.'); return }
    setBaixaSaving(true)
    try {
      const p = baixaPayroll
      // 1. Confronta: existe bill vinculada a esta folha?
      const existingBill = bills.find(b => (b as any).payroll_id === p.id)

      if (existingBill && existingBill.status === 'pago') {
        // Já pago em Contas a Pagar → apenas marca a folha como paga
        await update(p.id, { status: 'pago' } as any)
        alert(`✅ Pagamento já registrado em Contas a Pagar (${formatCurrency(existingBill.valor)}). Folha marcada como Paga.`)
      } else if (existingBill && existingBill.status !== 'pago') {
        // Bill existe mas ainda pendente → baixa a conta + marca folha
        const bt = await insertBankTx({
          data: baixaForm.dataPagamento,
          descricao: `Pagamento: ${existingBill.descricao}`,
          valor: existingBill.valor,
          tipo: 'debito',
          origem: 'manual',
          bank_account_id: baixaForm.bank_account_id,
          categoria: 'Folha de Pagamento'
        })
        await updateBill(existingBill.id, {
          ...existingBill,
          status: 'pago',
          payment_date: baixaForm.dataPagamento,
          bank_account_id: baixaForm.bank_account_id,
          bank_transaction_id: bt?.id || null
        } as any)
        await update(p.id, { status: 'pago' } as any)
        alert(`✅ Conta a Pagar baixada e Folha marcada como Paga!`)
      } else {
        // Nenhuma bill vinculada → cria já como paga + marca folha
        const descricao = `Folha de Pagamento - ${p.funcionarioNome} - ${p.mesReferencia}`
        const bt = await insertBankTx({
          data: baixaForm.dataPagamento,
          descricao: `Pagamento: ${descricao}`,
          valor: p.salarioLiquido,
          tipo: 'debito',
          origem: 'manual',
          bank_account_id: baixaForm.bank_account_id,
          categoria: 'Folha de Pagamento'
        })
        await insertBill({
          descricao,
          valor: p.salarioLiquido,
          vencimento: baixaForm.dataPagamento,
          status: 'pago',
          payment_date: baixaForm.dataPagamento,
          bank_account_id: baixaForm.bank_account_id,
          bank_transaction_id: bt?.id || null,
          categoria: 'Folha de Pagamento',
          payroll_id: p.id
        } as any)
        await update(p.id, { status: 'pago' } as any)
        alert(`✅ Pagamento lançado em Contas a Pagar e Folha marcada como Paga!`)
      }
      setBaixaOpen(false)
    } catch (err) {
      console.error(err)
      alert('Erro ao registrar pagamento.')
    } finally {
      setBaixaSaving(false)
    }
  }

  // Gerar Conta a Pagar (pendente) — com proteção anti-duplicata por payroll_id
  async function gerarContaPagar(p: Payroll) {
    // Verifica se já existe bill vinculada
    const existing = bills.find(b => (b as any).payroll_id === p.id)
    if (existing) {
      alert(`⚠️ Já existe uma Conta a Pagar para esta folha (Status: ${existing.status === 'pago' ? 'Paga' : 'Pendente'}). Use o botão ✅ Dar Baixa para registrar o pagamento.`)
      return
    }
    if (confirm(`Gerar Conta a Pagar (pendente) de ${formatCurrency(p.salarioLiquido)} para ${p.funcionarioNome}?`)) {
      try {
        await insertBill({
          descricao: `Folha de Pagamento - ${p.funcionarioNome} - ${p.mesReferencia}`,
          valor: p.salarioLiquido,
          vencimento: new Date().toISOString().slice(0, 10),
          status: 'pendente',
          categoria: 'Folha de Pagamento',
          payroll_id: p.id
        } as any)
        alert('Conta a Pagar gerada com sucesso!')
      } catch {
        alert('Erro ao gerar Conta a Pagar')
      }
    }
  }

  return (
    <div>
      <PageHeader
        title="Folha de Pagamento"
        description="Gerenciamento da folha de pagamento"
      >
        <div className="flex gap-2">
          <Button variant="outline" onClick={printRelatorio} className="gap-2 text-primary border-primary/20 bg-primary/5">
            <Printer className="h-4 w-4" /> Imprimir Relatório
          </Button>
          <Button variant="outline" onClick={() => setMassDialogOpen(true)} className="gap-2 text-primary border-primary/20 bg-primary/5">
            <CalendarClock className="h-4 w-4" /> Gerar via Escala
          </Button>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Folha
          </Button>
        </div>
      </PageHeader>

      <Card className="p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="w-full lg:max-w-md">
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar..." />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex h-10 rounded-md border border-input bg-background p-1">
              <button
                type="button"
                onClick={() => setDateFilter('current')}
                className={`rounded px-3 text-sm font-medium transition-colors ${dateFilter === 'current' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Mês atual
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('previous')}
                className={`rounded px-3 text-sm font-medium transition-colors ${dateFilter === 'previous' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Mês anterior
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('period')}
                className={`rounded px-3 text-sm font-medium transition-colors ${dateFilter === 'period' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Período
              </button>
            </div>
            {dateFilter === 'period' && (
              <div className="flex gap-2">
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="h-10 w-[150px]" />
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="h-10 w-[150px]" />
              </div>
            )}
          </div>
        </div>
        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionário</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Sal. Bruto</TableHead>
                <TableHead>Descontos</TableHead>
                <TableHead>Sal. Líquido</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8}><div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <EmptyState message="Nenhuma folha de pagamento" />
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {p.funcionarioNome}
                      {p.observacoes?.includes('via escala') && (
                        <div className="text-[10px] text-primary font-bold">Gerado p/ Escala</div>
                      )}
                      {employees.find(e => e.id === p.funcionarioId)?.is_pro_labore && (
                        <div className="text-[10px] text-emerald-600 font-bold uppercase">Pro-Labore</div>
                      )}
                    </TableCell>
                    <TableCell>{p.cargo}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.periodoInicio && p.periodoFim
                        ? `${formatDatePDF(p.periodoInicio)} — ${formatDatePDF(p.periodoFim)}`
                        : p.mesReferencia}
                    </TableCell>
                    <TableCell>{formatCurrency(p.salarioBruto)}</TableCell>
                    <TableCell className="text-red-600">{formatCurrency(p.descontos)}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(p.salarioLiquido)}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'pago' ? 'success' : 'warning'}>
                        {p.status === 'pago' ? 'Pago' : 'Pendente'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {p.status !== 'pago' && (
                          <Button variant="ghost" size="icon" title="Dar Baixa / Registrar Pagamento" onClick={() => openDarBaixa(p)}>
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" title="Gerar Conta a Pagar (Pendente)" onClick={() => gerarContaPagar(p)}>
                          <Banknote className="h-4 w-4 text-emerald-600" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Gerar Recibo PDF" onClick={() => printReceipt(p)}>
                          <FileText className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(p.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader>
          <DialogTitle>{editingId ? 'Editar Folha' : 'Nova Folha de Pagamento'}</DialogTitle>
          <DialogClose onClose={() => setDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <div className="grid gap-4 max-h-[65vh] overflow-y-auto pr-1">
            <div>
              <Label>Funcionário</Label>
              <Select
                value={form.funcionarioId}
                onChange={(e) => {
                  const emp = employees.find(x => x.id === e.target.value)
                  let multiplier = 1
                  let workedDays = countWorkedDays(emp, form.periodoInicio, form.periodoFim)
                  if (form.tipo_periodo === 'periodo' && form.periodoInicio && form.periodoFim) {
                    const dias = differenceInCalendarDays(parseISO(form.periodoFim), parseISO(form.periodoInicio)) + 1
                    if (dias > 0) multiplier = dias / 30
                  } else if (form.tipo_periodo === '13_salario') {
                    const year = parseInt(form.mesReferencia.split('-')[0], 10) || new Date().getFullYear();
                    const endCalculated = form.periodoFim ? parseISO(form.periodoFim) : parseISO(`${year}-12-31`);
                    if (emp?.dataAdmissao) {
                      const admissao = parseISO(emp.dataAdmissao);
                      const anoAdmissao = admissao.getFullYear();
                      if (anoAdmissao < year) {
                        let meses = 0;
                        for (let m = 0; m <= endCalculated.getMonth(); m++) {
                           if (m === endCalculated.getMonth()) {
                             if (endCalculated.getDate() >= 15) meses++;
                           } else {
                             meses++;
                           }
                        }
                        multiplier = meses / 12;
                      } else if (anoAdmissao > year) {
                        multiplier = 0;
                      } else {
                        let meses = 0;
                        for (let m = admissao.getMonth(); m <= endCalculated.getMonth(); m++) {
                          if (m === admissao.getMonth() && m === endCalculated.getMonth()) {
                             const diasTrabalhados = endCalculated.getDate() - admissao.getDate() + 1;
                             if (diasTrabalhados >= 15) meses++;
                          } else if (m === admissao.getMonth()) {
                            const daysInMonth = getDaysInMonth(admissao);
                            const diasTrabalhados = daysInMonth - admissao.getDate() + 1;
                            if (diasTrabalhados >= 15) meses++;
                          } else if (m === endCalculated.getMonth()) {
                            if (endCalculated.getDate() >= 15) meses++;
                          } else {
                            meses++;
                          }
                        }
                        multiplier = meses / 12;
                      }
                    }
                  }
                  
                  const salarioBruto = calculateEmployeeSalary(emp, multiplier, form.periodoInicio, form.periodoFim, form.tipo_periodo)
                  setForm({ ...form, funcionarioId: e.target.value, salarioBruto, descontos: emp?.descontos_fixos || 0 })
                  
                  const newAdicionais: PayrollAdicional[] = []
                  if (emp?.tem_vt && form.tipo_periodo !== '13_salario') {
                    newAdicionais.push({
                      descricao: 'Vale Transporte',
                      tipo: 'provento',
                      valor: calculateVtValue(emp, multiplier, workedDays)
                    })
                  }
                  if (emp?.tem_insalubridade && emp.insalubridade_percentual) {
                    newAdicionais.push({
                      descricao: `Adicional Insalubridade (${emp.insalubridade_percentual}%)`,
                      tipo: 'provento',
                      valor: Number((salarioBruto * (emp.insalubridade_percentual / 100)).toFixed(2))
                    })
                  }
                  setAdicionais(newAdicionais)
                }}
                className="mt-1"
              >
                <option value="">Selecionar...</option>
                {employees.filter(e => e.status === 'ativo' || e.id === form.funcionarioId).map(e => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </Select>
            </div>

            {/* Tipo de Período */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo de Período</Label>
                <Select 
                  value={form.tipo_periodo} 
                  onChange={(e) => {
                    const val = e.target.value as 'mes' | 'periodo' | '13_salario'
                    let start = form.periodoInicio
                    let end = form.periodoFim
                    
                    if (val === 'mes' && form.mesReferencia) {
                      const date = parseISO(form.mesReferencia + '-01')
                      start = format(startOfMonth(date), 'yyyy-MM-dd')
                      end = format(endOfMonth(date), 'yyyy-MM-dd')
                    }
                    
                    updatePeriodAndSalary(val, start, end, form.mesReferencia)
                  }} 
                  className="mt-1"
                >
                  <option value="mes">Mês Cheio</option>
                  <option value="periodo">Período Customizado</option>
                  <option value="13_salario">13º Salário</option>
                </Select>
              </div>
              <div>
                <Label>Mês Referência</Label>
                <Input 
                  type="month" 
                  value={form.mesReferencia} 
                  onChange={(e) => {
                    const month = e.target.value
                    let start = form.periodoInicio
                    let end = form.periodoFim
                    
                    if (form.tipo_periodo === 'mes' && month) {
                      const date = parseISO(month + '-01')
                      start = format(startOfMonth(date), 'yyyy-MM-dd')
                      end = format(endOfMonth(date), 'yyyy-MM-dd')
                    }
                    
                    updatePeriodAndSalary(form.tipo_periodo, start, end, month)
                  }} 
                  className="mt-1" 
                />
              </div>
            </div>

            {(form.tipo_periodo === 'periodo' || form.tipo_periodo === '13_salario') && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1">
                <div>
                  <Label>Início do Período</Label>
                  <Input type="date" value={form.periodoInicio} onChange={(e) => updatePeriodAndSalary(form.tipo_periodo, e.target.value, form.periodoFim, form.mesReferencia)} className="mt-1" />
                </div>
                <div>
                  <Label>Fim do Período</Label>
                  <Input type="date" value={form.periodoFim} onChange={(e) => updatePeriodAndSalary(form.tipo_periodo, form.periodoInicio, e.target.value, form.mesReferencia)} className="mt-1" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Status do Pagamento</Label>
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Payroll['status'] })} className="mt-1">
                  <option value="pendente">Pendente</option>
                  <option value="pago">Pago</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Salário Bruto</Label>
                <Input type="number" value={form.salarioBruto} onChange={(e) => setForm({ ...form, salarioBruto: Number(e.target.value) })} className="mt-1" />
              </div>
              <div>
                <Label>Descontos Fixos</Label>
                <Input type="number" value={form.descontos} onChange={(e) => setForm({ ...form, descontos: Number(e.target.value) })} className="mt-1" />
              </div>
            </div>

            {/* Adicionais */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Adicionais (Proventos & Descontos)</Label>
                <Button variant="outline" size="sm" onClick={addAdicional} className="gap-1">
                  <Plus className="h-3 w-3" /> Adicionar
                </Button>
              </div>
              {adicionais.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum adicional</p>
              )}
              {adicionais.map((a, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_100px_100px_32px] gap-2 items-end">
                  <div>
                    <Label className="text-xs">Descrição</Label>
                    <Input value={a.descricao} onChange={(e) => updateAdicional(idx, 'descricao', e.target.value)} className="mt-0.5" placeholder="Ex: Hora Extra, INSS..." />
                  </div>
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <Select value={a.tipo} onChange={(e) => updateAdicional(idx, 'tipo', e.target.value)} className="mt-0.5">
                      <option value="provento">Provento</option>
                      <option value="desconto">Desconto</option>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Valor</Label>
                    <Input type="number" value={a.valor} onChange={(e) => updateAdicional(idx, 'valor', Number(e.target.value))} className="mt-0.5" />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeAdicional(idx)} className="self-end mb-0.5">
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Totals preview */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-1 text-sm">
              <div className="flex justify-between"><span>Salário Bruto</span><span>{formatCurrency(form.salarioBruto)}</span></div>
              {totalProventos > 0 && <div className="flex justify-between text-green-600"><span>+ Proventos</span><span>{formatCurrency(totalProventos)}</span></div>}
              <div className="flex justify-between text-red-600"><span>- Descontos Fixos</span><span>{formatCurrency(form.descontos)}</span></div>
              {totalDescontos > 0 && <div className="flex justify-between text-red-600"><span>- Descontos Adicionais</span><span>{formatCurrency(totalDescontos)}</span></div>}
              <div className="flex justify-between font-bold text-base pt-2 border-t">
                <span>Salário Líquido</span>
                <span>{formatCurrency(salarioLiquidoCalc)}</span>
              </div>
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="mt-1" placeholder="Anotações sobre este pagamento..." />
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={massDialogOpen} onOpenChange={setMassDialogOpen}>
        <DialogHeader>
          <DialogTitle>Gerar Folhas via Escala</DialogTitle>
          <DialogClose onClose={() => setMassDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div className="p-4 bg-primary/5 rounded-lg border border-primary/20 text-sm">
              Esta ferramenta identifica todos os funcionários ativos com turnos de trabalho na escala do mês selecionado e gera automaticamente suas folhas de pagamento pendentes.
            </div>
            <div>
              <Label>Mês de Referência</Label>
              <Input type="month" value={massMonth} onChange={e => setMassMonth(e.target.value)} className="mt-1" />
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setMassDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleMassGenerate} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
            Gerar Folhas do Mês
          </Button>
        </DialogFooter>
      </Dialog>

      {/* ── DIALOG: Dar Baixa / Registrar Pagamento ───────────────────── */}
      <Dialog open={baixaOpen} onOpenChange={(open) => { setBaixaOpen(open) }}>
        <DialogHeader>
          <DialogTitle>
            <CheckCircle2 className="inline h-5 w-5 mr-2 text-green-600" />
            Dar Baixa — {baixaPayroll?.funcionarioNome}
          </DialogTitle>
          <DialogClose onClose={() => setBaixaOpen(false)} />
        </DialogHeader>
        <DialogContent>
          {baixaPayroll && (
            <>
              {/* Confronto automático */}
              {(() => {
                const linked = bills.find(b => (b as any).payroll_id === baixaPayroll.id)
                if (linked && linked.status === 'pago') {
                  return (
                    <div className="bg-green-50 border border-green-300 rounded-lg p-3 mb-4 text-sm text-green-800">
                      ✅ <strong>Já pago em Contas a Pagar!</strong> Valor: {formatCurrency(linked.valor)} em {linked.payment_date || '—'}.<br />
                      Ao confirmar, a Folha será marcada como <strong>Paga</strong> sem criar novo lançamento.
                    </div>
                  )
                }
                if (linked && linked.status !== 'pago') {
                  return (
                    <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mb-4 text-sm text-amber-800">
                      ⚠️ <strong>Conta a Pagar pendente encontrada</strong> ({formatCurrency(linked.valor)}).<br />
                      Ao confirmar, ela será <strong>baixada automaticamente</strong> e a Folha marcada como Paga.
                    </div>
                  )
                }
                return (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
                    ℹ️ Nenhuma Conta a Pagar vinculada. Um novo lançamento <strong>pago</strong> será criado em Contas a Pagar.
                  </div>
                )
              })()}

              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-3 text-sm bg-muted/40 rounded-lg p-3">
                  <div><span className="text-muted-foreground text-xs block">Funcionário</span>{baixaPayroll.funcionarioNome}</div>
                  <div><span className="text-muted-foreground text-xs block">Mês Ref.</span>{baixaPayroll.mesReferencia}</div>
                  <div><span className="text-muted-foreground text-xs block">Sal. Líquido</span><strong>{formatCurrency(baixaPayroll.salarioLiquido)}</strong></div>
                  <div><span className="text-muted-foreground text-xs block">Status Atual</span><Badge variant="warning">Pendente</Badge></div>
                </div>

                <div>
                  <Label>Data do Pagamento</Label>
                  <Input
                    type="date"
                    value={baixaForm.dataPagamento}
                    onChange={e => setBaixaForm({ ...baixaForm, dataPagamento: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Conta Bancária</Label>
                  <Select
                    value={baixaForm.bank_account_id}
                    onChange={e => setBaixaForm({ ...baixaForm, bank_account_id: e.target.value })}
                    className="mt-1"
                  >
                    <option value="">Selecionar conta...</option>
                    {bankAccounts.map(ba => (
                      <option key={ba.id} value={ba.id}>{ba.nome} — {ba.banco}</option>
                    ))}
                  </Select>
                </div>
              </div>
            </>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBaixaOpen(false)}>Cancelar</Button>
          <Button onClick={handleDarBaixa} disabled={baixaSaving} className="bg-green-600 hover:bg-green-700 gap-2">
            {baixaSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Confirmar Pagamento
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}
