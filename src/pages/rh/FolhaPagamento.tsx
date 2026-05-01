import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import { formatCurrency } from '@/lib/utils'
import type { Employee, Payroll, PayrollAdicional, ScheduleException, Bill } from '@/lib/types'
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
import { Pencil, Trash2, FileText, Plus, X, CalendarClock, Loader2 } from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, differenceInCalendarDays } from 'date-fns'

const emptyAdicional: PayrollAdicional = { descricao: '', tipo: 'provento', valor: 0 }

export default function FolhaPagamento() {
  const { data: rawEmployees } = useDb<Employee>('employees')
  const employees = [...rawEmployees].sort((a, b) => a.nome.localeCompare(b.nome))
  const { data: payrolls, loading, insert, update, remove } = useDb<Payroll>('payrolls')
  const { data: exceptions } = useDb<ScheduleException>('schedule_exceptions')
  const { insert: insertBill } = useDb<Bill>('bills')
  
  const [clinic] = useClinic()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [massDialogOpen, setMassDialogOpen] = useState(false)
  const [massMonth, setMassMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [generating, setGenerating] = useState(false)
  
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    funcionarioId: '',
    salarioBruto: 0,
    descontos: 0,
    mesReferencia: new Date().toISOString().slice(0, 7),
    status: 'pendente' as Payroll['status'],
    periodoInicio: '',
    periodoFim: '',
    tipo_periodo: 'mes' as 'mes' | 'periodo',
    observacoes: '',
  })
  const [adicionais, setAdicionais] = useState<PayrollAdicional[]>([])

  const filtered = payrolls.filter(
    (p) => p.funcionarioNome.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => a.funcionarioNome.localeCompare(b.funcionarioNome))

  // Computed totals
  const totalProventos = adicionais.filter(a => a.tipo === 'provento').reduce((s, a) => s + a.valor, 0)
  const totalDescontos = adicionais.filter(a => a.tipo === 'desconto').reduce((s, a) => s + a.valor, 0)
  const salarioLiquidoCalc = form.salarioBruto + totalProventos - form.descontos - totalDescontos

  async function handleSave() {
    const emp = employees.find(e => e.id === form.funcionarioId)
    if (!emp) return
    
    const payrollData: Omit<Payroll, 'id' | 'created_at'> = {
      funcionarioId: form.funcionarioId,
      funcionarioNome: emp.nome,
      cargo: emp.cargo,
      salarioBruto: form.salarioBruto,
      descontos: form.descontos + totalDescontos,
      salarioLiquido: salarioLiquidoCalc,
      mesReferencia: form.mesReferencia,
      status: form.status,
      periodoInicio: form.periodoInicio || null,
      periodoFim: form.periodoFim || null,
      adicionais: adicionais.length > 0 ? adicionais : [],
      observacoes: form.observacoes || '',
    }

    try {
      if (editingId) {
        await update(editingId, payrollData)
      } else {
        const result = await insert(payrollData)
        
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
          const payloadAdicionais: PayrollAdicional[] = []
          if (dobrasCount > 0) {
             payloadAdicionais.push({
                descricao: `Dobra de Turno (${dobrasCount}x)`,
                tipo: 'provento',
                valor: 0 // Valor a ser preenchido manualmente
             })
          }

          const payrollResult = await insert({
            funcionarioId: emp.id,
            funcionarioNome: emp.nome,
            cargo: emp.cargo,
            salarioBruto: emp.salario || 0,
            descontos: 0,
            salarioLiquido: emp.salario || 0,
            mesReferencia: massMonth,
            status: 'pendente',
            periodoInicio: format(monthStart, 'yyyy-MM-dd'),
            periodoFim: format(monthEnd, 'yyyy-MM-dd'),
            observacoes: emp.is_pro_labore ? 'Retirada de Pró-Labore.' : `Gerado via escala: ${workedDays} turnos/dias identificados${dobrasCount > 0 ? `, incluindo ${dobrasCount} dobra(s)` : ''}.`,
            adicionais: payloadAdicionais
          } as Omit<Payroll, 'id' | 'created_at'>)

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
    setForm({
      funcionarioId: employees[0]?.id || '',
      salarioBruto: employees[0]?.salario || 0,
      descontos: 0,
      mesReferencia: new Date().toISOString().slice(0, 7),
      status: 'pendente',
      periodoInicio: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
      periodoFim: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
      tipo_periodo: 'mes',
      observacoes: '',
    })
    setAdicionais([])
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

  // PDF Pay Receipt
  function printReceipt(p: Payroll) {
    const emp = employees.find(e => e.id === p.funcionarioId)
    const periodo = p.periodoInicio && p.periodoFim
      ? `${formatDatePDF(p.periodoInicio)} a ${formatDatePDF(p.periodoFim)}`
      : p.mesReferencia

    let rows = `
      <tr><td>Salário Base</td><td class="text-right">${formatCurrencyPDF(p.salarioBruto)}</td></tr>
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

  return (
    <div>
      <PageHeader
        title="Folha de Pagamento"
        description="Gerenciamento da folha de pagamento"
      >
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setMassDialogOpen(true)} className="gap-2 text-primary border-primary/20 bg-primary/5">
            <CalendarClock className="h-4 w-4" /> Gerar via Escala
          </Button>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Folha
          </Button>
        </div>
      </PageHeader>

      <Card className="p-6">
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar..." />
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
                        ? `${new Date(p.periodoInicio).toLocaleDateString('pt-BR')} — ${new Date(p.periodoFim).toLocaleDateString('pt-BR')}`
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
                  setForm({ ...form, funcionarioId: e.target.value, salarioBruto: emp?.salario || 0 })
                }}
                className="mt-1"
              >
                <option value="">Selecionar...</option>
                {employees.map(e => (
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
                    const val = e.target.value as 'mes' | 'periodo'
                    let start = form.periodoInicio
                    let end = form.periodoFim
                    
                    if (val === 'mes' && form.mesReferencia) {
                      const date = parseISO(form.mesReferencia + '-01')
                      start = format(startOfMonth(date), 'yyyy-MM-dd')
                      end = format(endOfMonth(date), 'yyyy-MM-dd')
                    }
                    
                    setForm({ ...form, tipo_periodo: val, periodoInicio: start, periodoFim: end })
                  }} 
                  className="mt-1"
                >
                  <option value="mes">Mês Cheio</option>
                  <option value="periodo">Período Customizado</option>
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
                    
                    setForm({ ...form, mesReferencia: month, periodoInicio: start, periodoFim: end })
                  }} 
                  className="mt-1" 
                />
              </div>
            </div>

            {form.tipo_periodo === 'periodo' && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1">
                <div>
                  <Label>Início do Período</Label>
                  <Input type="date" value={form.periodoInicio} onChange={(e) => setForm({ ...form, periodoInicio: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Fim do Período</Label>
                  <Input type="date" value={form.periodoFim} onChange={(e) => setForm({ ...form, periodoFim: e.target.value })} className="mt-1" />
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
    </div>
  )
}
