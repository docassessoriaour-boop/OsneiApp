import { useState, useEffect, useMemo } from 'react'
import { useDb } from '@/hooks/useDb'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { Bill, Employee, TransactionCategory, Vacation } from '@/lib/types'
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
import { Pencil, Trash2, Calculator, Info, CheckCircle2, Printer, Loader2, FileText } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF } from '@/lib/pdf'

type VacationDb = Vacation & {
  funcionario_id?: string
  funcionario_nome?: string
  data_inicio?: string
  data_fim?: string
  salario_base?: number
  dias_ferias?: number
  dias_abono?: number
  valor_ferias?: number
  valor_terco_constitucional?: number
  valor_abono_pecuniario?: number
  valor_terco_abono?: number
  descontos_inss?: number
  descontos_irrf?: number
  valor_liquido?: number
}

function parseLocalDate(date?: string) {
  if (!date) return null
  const parsed = new Date(date.includes('T') ? date : `${date}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function diffDays(start: Date, end: Date) {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.ceil((end.getTime() - start.getTime()) / msPerDay)
}

function addYears(date: Date, years: number) {
  const next = new Date(date)
  next.setFullYear(next.getFullYear() + years)
  return next
}

function completedYearsSince(start: Date, end: Date) {
  let years = end.getFullYear() - start.getFullYear()
  const anniversary = addYears(start, years)
  if (anniversary > end) years--
  return Math.max(0, years)
}

function vacationDays(vacation: Vacation) {
  if (vacation.diasFerias && vacation.diasFerias > 0) return vacation.diasFerias
  const start = parseLocalDate(vacation.dataInicio)
  const end = parseLocalDate(vacation.dataFim)
  if (!start || !end) return 0
  return Math.max(0, diffDays(start, end) + 1)
}

function toMoneyInput(value: number) {
  return Number(value || 0).toFixed(2).replace('.', ',')
}

function parseMoneyInput(value: string) {
  const normalized = value.replace(/\./g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export default function Ferias() {
  const [clinic] = useClinic()
  const { data: employees } = useDb<Employee>('employees')
  const { data: rawVacations, loading, insert, update, remove } = useDb<Vacation>('vacations')
  const { data: bills, insert: insertBill, update: updateBill } = useDb<Bill>('bills')
  const { data: categories } = useDb<TransactionCategory>('transaction_categories')
  const vacations = rawVacations.map((v: VacationDb) => ({
    ...v,
    funcionarioId: v.funcionarioId || v.funcionario_id || '',
    funcionarioNome: v.funcionarioNome || v.funcionario_nome || '',
    dataInicio: v.dataInicio || v.data_inicio || '',
    dataFim: v.dataFim || v.data_fim || '',
    salarioBase: v.salarioBase ?? v.salario_base,
    diasFerias: v.diasFerias ?? v.dias_ferias,
    diasAbono: v.diasAbono ?? v.dias_abono,
    valorFerias: v.valorFerias ?? v.valor_ferias,
    valorTercoConstitucional: v.valorTercoConstitucional ?? v.valor_terco_constitucional,
    valorAbonoPecuniario: v.valorAbonoPecuniario ?? v.valor_abono_pecuniario,
    valorTercoAbono: v.valorTercoAbono ?? v.valor_terco_abono,
    descontosInss: v.descontosInss ?? v.descontos_inss,
    descontosIrrf: v.descontosIrrf ?? v.descontos_irrf,
    valorLiquido: v.valorLiquido ?? v.valor_liquido,
  })) as Vacation[]
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [payableDialogOpen, setPayableDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [payableSaving, setPayableSaving] = useState(false)
  const [selectedVacation, setSelectedVacation] = useState<Vacation | null>(null)
  const [form, setForm] = useState({
    funcionarioId: '',
    dataInicio: '',
    dataFim: '',
    status: 'agendada' as Vacation['status'],
    salarioBase: 0,
    diasFerias: 30,
    diasAbono: 0,
    venderFerias: false,
    descontoInss: 0,
  })
  const [payableForm, setPayableForm] = useState({
    vencimento: new Date().toISOString().slice(0, 10),
    status: 'pendente' as Extract<Bill['status'], 'pendente' | 'pago'>,
    paymentDate: '',
    valor: '0,00',
  })

  const filtered = vacations.filter(v =>
    (v.funcionarioNome || '').toLowerCase().includes(search.toLowerCase())
  )

  function getVacationBillDescription(vacation: Vacation) {
    return `Férias - ${vacation.funcionarioNome} - ${formatDate(vacation.dataInicio)} a ${formatDate(vacation.dataFim)}`
  }

  function getVacationBill(vacation: Vacation) {
    const description = getVacationBillDescription(vacation)
    return bills.find(b => (b as any).vacation_id === vacation.id || b.descricao === description)
  }

  function getVacationExpenseCategory() {
    return categories.find(c => c.tipo === 'despesa' && c.nome.toLowerCase().includes('férias'))
      || categories.find(c => c.tipo === 'despesa' && c.nome.toLowerCase().includes('ferias'))
      || categories.find(c => c.tipo === 'despesa' && c.nome.toLowerCase().includes('folha'))
  }

  const vacationOverview = useMemo(() => {
    const today = new Date()
    const activeEmployees = employees
      .filter(e => e.status === 'ativo')
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))

    return activeEmployees.map(employee => {
      const admissionDate = parseLocalDate((employee as any).dataAdmissao || (employee as any).data_admissao)
      const employeeVacations = vacations.filter(v => v.funcionarioId === employee.id)
      const completedVacations = employeeVacations.filter(v => v.status === 'concluida')
      const takenDays = completedVacations.reduce((sum, vacation) => sum + vacationDays(vacation), 0)
      const lastVacation = [...completedVacations]
        .sort((a, b) => (b.dataFim || '').localeCompare(a.dataFim || ''))[0]

      if (!admissionDate) {
        return {
          employee,
          admissionDate: null,
          earnedPeriods: 0,
          takenDays,
          availableDays: 0,
          nextDate: null,
          daysToNext: null,
          statusText: 'Sem data de admissão',
          statusTone: 'muted' as const,
          lastVacation,
        }
      }

      const earnedPeriods = completedYearsSince(admissionDate, today)
      const earnedDays = earnedPeriods * 30
      const availableDays = Math.max(0, earnedDays - takenDays)
      const nextDate = addYears(admissionDate, earnedPeriods + 1)
      const daysToNext = Math.max(0, diffDays(today, nextDate))
      const statusText = availableDays > 0
        ? `Possui ${availableDays} ${availableDays === 1 ? 'dia disponível' : 'dias disponíveis'}`
        : daysToNext === 0
          ? 'Novo período disponível'
          : `Faltam ${daysToNext} dia${daysToNext === 1 ? '' : 's'}`
      const statusTone = availableDays > 0 || daysToNext === 0
        ? 'success' as const
        : daysToNext <= 60
          ? 'warning' as const
          : 'muted' as const

      return {
        employee,
        admissionDate,
        earnedPeriods,
        takenDays,
        availableDays,
        nextDate,
        daysToNext,
        statusText,
        statusTone,
        lastVacation,
      }
    })
  }, [employees, vacations])

  // Calculate vacation values
  const results = useMemo(() => {
    const { salarioBase, diasFerias, diasAbono, venderFerias, descontoInss } = form
    if (!salarioBase) return null

    const vFerias = (salarioBase / 30) * diasFerias
    const vTerco = vFerias / 3
    
    // Abono Pecuniário (max 10 days)
    const abonoDays = venderFerias ? Math.min(diasAbono || 10, 10) : 0
    const vAbono = (salarioBase / 30) * abonoDays
    const vTercoAbono = vAbono / 3

    // INSS informado manualmente no lancamento.
    const inss = Math.max(0, descontoInss || 0)

    const liquid = vFerias + vTerco + vAbono + vTercoAbono - inss

    return {
      vFerias,
      vTerco,
      vAbono,
      vTercoAbono,
      inss,
      liquid,
      totalProventos: vFerias + vTerco + vAbono + vTercoAbono,
      totalDescontos: inss
    }
  }, [form])

  // Auto-calculate days based on dates
  useEffect(() => {
    if (form.dataInicio && form.dataFim) {
      const start = new Date(form.dataInicio)
      const end = new Date(form.dataFim)
      const diffTime = Math.abs(end.getTime() - start.getTime())
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
      if (!isNaN(diffDays)) {
        setForm(prev => ({ ...prev, diasFerias: diffDays }))
      }
    }
  }, [form.dataInicio, form.dataFim])

  // Set salary when employee changes
  useEffect(() => {
    if (form.funcionarioId) {
      const emp = employees.find(e => e.id === form.funcionarioId)
      if (emp) {
        setForm(prev => ({ ...prev, salarioBase: emp.salario || 0 }))
      }
    }
  }, [form.funcionarioId, employees])

  function openNew() {
    setForm({ 
      funcionarioId: '', 
      dataInicio: '', 
      dataFim: '', 
      status: 'agendada',
      salarioBase: 0,
      diasFerias: 30,
      diasAbono: 10,
      venderFerias: false,
      descontoInss: 0,
    })
    setEditingId(null)
    setDialogOpen(true)
  }

  function openNewForEmployee(employee: Employee) {
    setForm({
      funcionarioId: employee.id,
      dataInicio: '',
      dataFim: '',
      status: 'agendada',
      salarioBase: employee.salario || 0,
      diasFerias: 30,
      diasAbono: 10,
      venderFerias: false,
      descontoInss: 0,
    })
    setEditingId(null)
    setDialogOpen(true)
  }

  async function handleSave() {
    const emp = employees.find(e => e.id === form.funcionarioId)
    if (!emp || !form.dataInicio || !form.dataFim) {
      alert('Preencha os campos obrigatórios e selecione o funcionário.')
      return
    }
    
    setSaving(true)
    try {
      const vData = {
        funcionario_id: form.funcionarioId,
        funcionario_nome: emp.nome,
        data_inicio: form.dataInicio,
        data_fim: form.dataFim,
        status: form.status,
        salario_base: form.salarioBase,
        dias_ferias: form.diasFerias,
        dias_abono: form.venderFerias ? form.diasAbono : 0,
        valor_ferias: results?.vFerias,
        valor_terco_constitucional: results?.vTerco,
        valor_abono_pecuniario: results?.vAbono,
        valor_terco_abono: results?.vTercoAbono,
        descontos_inss: results?.inss,
        descontos_irrf: 0,
        valor_liquido: results?.liquid
      }
      if (editingId) {
        await update(editingId, vData as Omit<Vacation, 'id'>)
      } else {
        await insert(vData as Omit<Vacation, 'id'>)
      }
      setDialogOpen(false)
    } catch (error) {
      console.error(error)
      alert('Erro ao salvar férias.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Tem certeza?')) {
      try {
        await remove(id)
      } catch (error) {
        console.error(error)
        alert('Erro ao excluir férias.')
      }
    }
  }

  function openPayable(v: Vacation) {
    const existingBill = getVacationBill(v)
    setSelectedVacation(v)
    setPayableForm({
      vencimento: existingBill?.vencimento
        ? new Date(existingBill.vencimento).toISOString().slice(0, 10)
        : v.dataInicio || new Date().toISOString().slice(0, 10),
      status: existingBill?.status === 'pago' ? 'pago' : 'pendente',
      paymentDate: existingBill?.payment_date || '',
      valor: toMoneyInput(Number(existingBill?.valor ?? v.valorLiquido ?? 0)),
    })
    setPayableDialogOpen(true)
  }

  async function handleSavePayable() {
    if (!selectedVacation) return
    const payableValue = parseMoneyInput(payableForm.valor)
    if (!payableForm.vencimento || payableValue <= 0) {
      alert('Informe a data de vencimento e um valor maior que zero.')
      return
    }

    setPayableSaving(true)
    try {
      const category = getVacationExpenseCategory()
      const existingBill = getVacationBill(selectedVacation)
      const payload = {
        descricao: getVacationBillDescription(selectedVacation),
        categoria: category?.nome || 'Férias',
        category_id: category?.id || null,
        valor: Number(payableValue.toFixed(2)),
        vencimento: payableForm.vencimento,
        status: payableForm.status,
        payment_date: payableForm.status === 'pago' ? (payableForm.paymentDate || payableForm.vencimento) : null,
        vacation_id: selectedVacation.id,
      }

      if (existingBill) {
        await updateBill(existingBill.id, { ...existingBill, ...payload } as any)
      } else {
        await insertBill(payload as any)
      }

      setPayableDialogOpen(false)
      alert(existingBill ? 'Lançamento atualizado no Contas a Pagar!' : 'Férias lançadas no Contas a Pagar!')
    } catch (error: any) {
      console.error(error)
      alert(`Erro ao lançar no Contas a Pagar: ${error.message || 'Erro desconhecido'}`)
    } finally {
      setPayableSaving(false)
    }
  }

  function openEdit(v: Vacation) {
    setForm({ 
      funcionarioId: v.funcionarioId, 
      dataInicio: v.dataInicio, 
      dataFim: v.dataFim, 
      status: v.status,
      salarioBase: v.salarioBase || 0,
      diasFerias: v.diasFerias || 30,
      diasAbono: v.diasAbono || 0,
      venderFerias: (v.diasAbono || 0) > 0,
      descontoInss: v.descontosInss || 0,
    })
    setEditingId(v.id)
    setDialogOpen(true)
  }

  const printVacationReceipt = (v: Vacation) => {
    const content = `
      <div class="report-header">
        <h2>Recibo de Férias</h2>
        <p>Funcionário: <strong>${v.funcionarioNome}</strong></p>
        <p>Período: ${formatDate(v.dataInicio)} até ${formatDate(v.dataFim)} (${v.diasFerias} dias)</p>
      </div>
      
      <table class="w-full">
        <thead>
          <tr><th>Descrição</th><th class="text-right">Proventos</th><th class="text-right">Descontos</th></tr>
        </thead>
        <tbody>
          <tr><td>Valor das Férias</td><td class="text-right">${formatCurrency(v.valorFerias || 0)}</td><td></td></tr>
          <tr><td>1/3 Constitucional</td><td class="text-right">${formatCurrency(v.valorTercoConstitucional || 0)}</td><td></td></tr>
          ${v.valorAbonoPecuniario ? `<tr><td>Abono Pecuniário (${v.diasAbono} dias)</td><td class="text-right">${formatCurrency(v.valorAbonoPecuniario)}</td><td></td></tr>` : ''}
          ${v.valorTercoAbono ? `<tr><td>1/3 sobre Abono</td><td class="text-right">${formatCurrency(v.valorTercoAbono)}</td><td></td></tr>` : ''}
          ${v.descontosInss ? `<tr><td>INSS sobre Férias</td><td></td><td class="text-right">${formatCurrency(v.descontosInss)}</td></tr>` : ''}
        </tbody>
        <tfoot>
          <tr style="font-weight:700;">
            <td>TOTAL LÍQUIDO</td>
            <td colspan="2" class="text-right">${formatCurrency(v.valorLiquido || 0)}</td>
          </tr>
        </tfoot>
      </table>

      <div style="margin-top: 40px; font-size: 14px;">
        <p>Recebi da empresa <strong>${clinic.razao_social || (clinic as any).name}</strong> a importância líquida de <strong>${formatCurrency(v.valorLiquido || 0)}</strong>, referente ao pagamento de minhas férias no período acima mencionado.</p>
      </div>

      <div style="margin-top: 80px; display: flex; justify-content: space-around;">
        <div style="text-align: center; border-top: 1px solid #000; width: 250px; padding-top: 5px;">
          <p>${v.funcionarioNome}</p>
          <p style="font-size: 10px;">Funcionário</p>
        </div>
        <div style="text-align: center; border-top: 1px solid #000; width: 250px; padding-top: 5px;">
          <p>${clinic.razao_social || (clinic as any).name}</p>
          <p style="font-size: 10px;">Empregador</p>
        </div>
      </div>
    `
    printPDF('Recibo de Férias', content, clinic)
  }

  const statusBadge = (status: Vacation['status']) => {
    const map = { agendada: 'default', em_andamento: 'warning', concluida: 'success' } as const
    const labels = { agendada: 'Agendada', em_andamento: 'Em Andamento', concluida: 'Concluída' }
    return <Badge variant={map[status]}>{labels[status]}</Badge>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Férias"
        description="Cálculo e controle de férias dos funcionários"
        actionLabel="Lançar Férias"
        onAction={openNew}
      />

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Controle de Períodos Aquisitivos</h3>
            <p className="text-sm text-muted-foreground">
              Baseado na data de admissão e nas férias concluídas de cada funcionário.
            </p>
          </div>
          <Badge variant="outline">{vacationOverview.length} funcionários</Badge>
        </div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionário</TableHead>
                <TableHead>Admissão</TableHead>
                <TableHead>Períodos</TableHead>
                <TableHead>Férias Tiradas</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Próximo Período</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vacationOverview.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}><EmptyState message="Nenhum funcionário ativo encontrado" /></TableCell>
                </TableRow>
              ) : (
                vacationOverview.map(item => (
                  <TableRow key={item.employee.id}>
                    <TableCell className="font-medium">
                      <div>{item.employee.nome}</div>
                      <div className="text-xs text-muted-foreground">{item.employee.cargo || 'Cargo não informado'}</div>
                    </TableCell>
                    <TableCell>{item.admissionDate ? formatDate(item.admissionDate.toISOString().slice(0, 10)) : '--'}</TableCell>
                    <TableCell>{item.earnedPeriods}</TableCell>
                    <TableCell>
                      <div>{item.takenDays}d</div>
                      {item.lastVacation && (
                        <div className="text-xs text-muted-foreground">
                          Última: {formatDate(item.lastVacation.dataInicio)} a {formatDate(item.lastVacation.dataFim)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className={item.availableDays > 0 ? 'font-semibold text-primary' : ''}>
                      {item.availableDays}d
                    </TableCell>
                    <TableCell>{item.nextDate ? formatDate(item.nextDate.toISOString().slice(0, 10)) : '--'}</TableCell>
                    <TableCell>
                      <Badge variant={item.statusTone === 'success' ? 'success' : item.statusTone === 'warning' ? 'warning' : 'outline'}>
                        {item.statusText}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openNewForEmployee(item.employee)}>
                        Lançar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-foreground">Férias Lançadas</h3>
          <p className="text-sm text-muted-foreground">Histórico, cálculo e recibos de férias.</p>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por funcionário..." />
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionário</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Dias</TableHead>
                <TableHead>Abono</TableHead>
                <TableHead>Valor Líquido</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}><EmptyState message="Nenhuma férias cadastrada" /></TableCell>
                </TableRow>
              ) : (
                filtered.map(v => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.funcionarioNome}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {formatDate(v.dataInicio)} até {formatDate(v.dataFim)}
                      </div>
                    </TableCell>
                    <TableCell>{v.diasFerias || '--'}d</TableCell>
                    <TableCell>{v.diasAbono ? `${v.diasAbono}d` : '--'}</TableCell>
                    <TableCell className="font-semibold text-primary">{v.valorLiquido ? formatCurrency(v.valorLiquido) : '--'}</TableCell>
                    <TableCell>{statusBadge(v.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => printVacationReceipt(v)} title="Imprimir Recibo"><Printer className="h-4 w-4" /></Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openPayable(v)}
                          title={getVacationBill(v) ? 'Editar no Contas a Pagar' : 'Lançar no Contas a Pagar'}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(v)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(v.id)} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={payableDialogOpen} onOpenChange={setPayableDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {selectedVacation && getVacationBill(selectedVacation) ? 'Editar Contas a Pagar' : 'Lançar em Contas a Pagar'}
            </DialogTitle>
            <DialogClose onClose={() => setPayableDialogOpen(false)} />
          </DialogHeader>

          {selectedVacation && (
            <div className="grid gap-4">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p><strong>Funcionário:</strong> {selectedVacation.funcionarioNome}</p>
                <p><strong>Período:</strong> {formatDate(selectedVacation.dataInicio)} até {formatDate(selectedVacation.dataFim)}</p>
                <p><strong>Valor líquido:</strong> {formatCurrency(selectedVacation.valorLiquido || 0)}</p>
              </div>

              <div>
                <Label>Valor do lançamento (R$)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={payableForm.valor}
                  onChange={(e) => setPayableForm({ ...payableForm, valor: e.target.value })}
                  onBlur={() => setPayableForm({ ...payableForm, valor: toMoneyInput(parseMoneyInput(payableForm.valor)) })}
                  className="mt-1"
                  placeholder="0,00"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data de vencimento</Label>
                  <Input
                    type="date"
                    value={payableForm.vencimento}
                    onChange={(e) => setPayableForm({ ...payableForm, vencimento: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={payableForm.status}
                    onChange={(e) => {
                      const status = e.target.value as typeof payableForm.status
                      setPayableForm({
                        ...payableForm,
                        status,
                        paymentDate: status === 'pago' && !payableForm.paymentDate
                          ? new Date().toISOString().slice(0, 10)
                          : payableForm.paymentDate,
                      })
                    }}
                    className="mt-1"
                  >
                    <option value="pendente">Pendente</option>
                    <option value="pago">Pago</option>
                  </Select>
                </div>
              </div>

              {payableForm.status === 'pago' && (
                <div>
                  <Label>Data do pagamento</Label>
                  <Input
                    type="date"
                    value={payableForm.paymentDate}
                    onChange={(e) => setPayableForm({ ...payableForm, paymentDate: e.target.value })}
                    className="mt-1"
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPayableDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSavePayable} disabled={payableSaving}>
              {payableSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {payableSaving ? 'Salvando...' : 'Salvar Lançamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              {editingId ? 'Editar Cálculo de Férias' : 'Novo Cálculo de Férias'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            {/* Form Side */}
            <div className="space-y-4">
              <div>
                <Label>Funcionário</Label>
                <Select value={form.funcionarioId} onChange={(e) => setForm({ ...form, funcionarioId: e.target.value })} className="mt-1">
                  <option value="">Selecionar...</option>
                  {employees.filter(e => e.status === 'ativo').map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Salário Base (R$)</Label>
                  <Input type="number" value={form.salarioBase} onChange={(e) => setForm({ ...form, salarioBase: Number(e.target.value) })} className="mt-1" />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Vacation['status'] })} className="mt-1">
                    <option value="agendada">Agendada</option>
                    <option value="em_andamento">Em Andamento</option>
                    <option value="concluida">Concluída</option>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data Início</Label>
                  <Input type="date" value={form.dataInicio} onChange={(e) => setForm({ ...form, dataInicio: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Data Fim</Label>
                  <Input type="date" value={form.dataFim} onChange={(e) => setForm({ ...form, dataFim: e.target.value })} className="mt-1" />
                </div>
              </div>

              <div>
                <Label>Desconto INSS (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.descontoInss}
                  onChange={(e) => setForm({ ...form, descontoInss: Number(e.target.value) })}
                  className="mt-1"
                />
              </div>

              <div className="p-4 bg-muted/50 rounded-lg space-y-4 border border-dashed border-primary/20">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={form.venderFerias} 
                      onChange={e => setForm({...form, venderFerias: e.target.checked})}
                      className="w-4 h-4 rounded border-gray-300 text-primary"
                    />
                    Abono Pecuniário (Venda)
                  </Label>
                  {form.venderFerias && (
                    <div className="flex items-center gap-2">
                       <Input 
                        type="number" 
                        max={10}
                        className="w-20 h-8" 
                        value={form.diasAbono} 
                        onChange={e => setForm({...form, diasAbono: Number(e.target.value)})}
                      />
                      <span className="text-xs text-muted-foreground">dias</span>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight italic">
                  * O funcionário pode vender até 1/3 das férias (limite legal de 10 dias).
                </p>
              </div>
            </div>

            {/* Results Side */}
            <div className="bg-primary/5 rounded-xl border border-primary/10 p-6 flex flex-col">
              <h3 className="font-bold text-sm uppercase text-primary/70 mb-4 tracking-wider flex items-center gap-2">
                <Info className="h-4 w-4" />
                Resumo do Pagamento
              </h3>
              
              {!results ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-50">
                  <Calculator className="h-12 w-12 mb-2" />
                  <p className="text-sm">Selecione o funcionário e as datas</p>
                </div>
              ) : (
                <div className="space-y-3 flex-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Valor das Férias ({form.diasFerias} dias):</span>
                    <span className="font-medium">{formatCurrency(results.vFerias)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">1/3 Constitucional:</span>
                    <span className="font-medium">{formatCurrency(results.vTerco)}</span>
                  </div>
                  
                  {form.venderFerias && (
                    <>
                      <Separator className="bg-primary/10" />
                      <div className="flex justify-between items-center text-sm text-green-700">
                        <span className="font-medium">Abono Pecuniário ({form.diasAbono} dias):</span>
                        <span className="font-bold">{formatCurrency(results.vAbono)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm text-green-700">
                        <span className="font-medium">1/3 sobre Abono:</span>
                        <span className="font-bold">{formatCurrency(results.vTercoAbono)}</span>
                      </div>
                    </>
                  )}

                  {results.inss > 0 && (
                    <Separator className="bg-primary/10" />
                  )}
                  
                  {results.inss > 0 && (
                    <div className="flex justify-between items-center text-sm text-destructive">
                      <span>INSS:</span>
                      <span>-{formatCurrency(results.inss)}</span>
                    </div>
                  )}
                  <div className="mt-auto pt-6 border-t-2 border-primary/20">
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-primary/10">
                      <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Valor Líquido a Receber</div>
                      <div className="text-3xl font-black text-primary flex items-baseline gap-1">
                        {formatCurrency(results.liquid)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="mt-6 border-t pt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="gap-2" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {saving ? 'Salvando...' : 'Confirmar e Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
