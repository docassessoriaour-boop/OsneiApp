import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { Calculator, Plus, Trash2, Printer, FileText, Search, User, Save, History, ExternalLink } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF } from '@/lib/pdf'
import { useDb } from '@/hooks/useDb'
import type { Employee, Termination, Bill } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog'

type TerminationType = 'dispensa_sem_justa' | 'pedido_demissao' | 'dispensa_com_justa' | 'acordo_mutuo'

interface ExtraItem {
  id: string
  name: string
  value: number
  type: 'addition' | 'deduction'
}

export default function CalculadoraAcerto() {
  const [clinic] = useClinic()
  const { data: employees } = useDb<Employee>('employees')
  const { data: terminations, insert: insertTermination, remove: removeTermination } = useDb<Termination>('terminations')
  const { insert: insertBill } = useDb<Bill>('bills')
  
  const [searchTerm, setSearchTerm] = useState('')
  const [showResults, setShowResults] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    cpf: '',
    role: '',
    salary: 0,
    admissionDate: '',
    terminationDate: '',
    terminationType: 'dispensa_sem_justa' as TerminationType,
    workSchedule: '44h',
    workedDays: 30,
    hasExpiredVacation: false,
    hasInsalubridade: false,
    insalubridadePercent: 20,
    fgtsBalance: 0,
    employeeId: ''
  })

  const [extras, setExtras] = useState<ExtraItem[]>([])

  const addExtra = () => {
    setExtras([...extras, { id: crypto.randomUUID(), name: '', value: 0, type: 'addition' }])
  }

  const removeExtra = (id: string) => {
    setExtras(extras.filter(e => e.id !== id))
  }

  const updateExtra = (id: string, field: keyof ExtraItem, value: any) => {
    setExtras(extras.map(e => e.id === id ? { ...e, [field]: value } : e))
  }

  const results = useMemo(() => {
    const { salary, admissionDate, terminationDate, terminationType, workedDays, hasExpiredVacation, hasInsalubridade, insalubridadePercent } = form
    if (!salary || !admissionDate || !terminationDate) return null

    const insalubridadeMensal = hasInsalubridade ? (salary * (insalubridadePercent / 100)) : 0
    const baseCalculo = salary + insalubridadeMensal

    const start = new Date(admissionDate)
    const end = new Date(terminationDate)
    
    // 1. Saldo de Salário
    // Usamos workedDays (que agora é auto-calculado pelo dia do desligamento)
    const saldoSalario = (baseCalculo / 30) * workedDays
    const saldoInsalubridade = (insalubridadeMensal / 30) * workedDays

    // 4. Aviso Prévio
    const totalMonthsSinceStart = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
    const completeYears = Math.floor(totalMonthsSinceStart / 12)
    const avisoPrevioDays = Math.min(30 + (completeYears * 3), 90)
    let avisoPrevioValue = 0
    if (terminationType === 'dispensa_sem_justa') {
      avisoPrevioValue = (baseCalculo / 30) * avisoPrevioDays
    } else if (terminationType === 'acordo_mutuo') {
      avisoPrevioValue = ((baseCalculo / 30) * avisoPrevioDays) * 0.5
    }

    // Projeção do Aviso Prévio para cálculos de avos (13º e Férias)
    const projectedEnd = new Date(end)
    if (terminationType === 'dispensa_sem_justa' || terminationType === 'acordo_mutuo') {
      projectedEnd.setDate(projectedEnd.getDate() + avisoPrevioDays)
    }

    // Helper para calcular avos do 13º (meses com 15+ dias no ano civil)
    const calculate13thAvos = () => {
      let avos = 0
      const currentYear = end.getFullYear()
      const startOfYear = new Date(currentYear, 0, 1)
      const effectiveStart = start > startOfYear ? start : startOfYear
      
      const temp = new Date(effectiveStart.getFullYear(), effectiveStart.getMonth(), 1)
      while (temp <= projectedEnd && temp.getFullYear() === currentYear) {
        const monthStart = new Date(temp.getFullYear(), temp.getMonth(), 1)
        const monthEnd = new Date(temp.getFullYear(), temp.getMonth() + 1, 0)
        
        const periodStart = start > monthStart ? start : monthStart
        const periodEnd = projectedEnd < monthEnd ? projectedEnd : monthEnd
        
        const daysInMonth = Math.round((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
        if (daysInMonth >= 15) avos++
        
        temp.setMonth(temp.getMonth() + 1)
      }
      return avos
    }

    // Helper para calcular avos de Férias (meses com 15+ dias no período aquisitivo)
    const calculateVacationAvos = () => {
      let avos = 0
      const temp = new Date(start)
      
      // Encontrar o início do último período aquisitivo
      while (new Date(temp.getFullYear() + 1, temp.getMonth(), temp.getDate()) <= projectedEnd) {
        temp.setFullYear(temp.getFullYear() + 1)
      }
      
      let periodStart = new Date(temp)
      while (true) {
        const nextMonth = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, periodStart.getDate())
        if (nextMonth > projectedEnd) {
          // Último mês incompleto
          const days = Math.round((projectedEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
          if (days >= 15) avos++
          break
        }
        avos++
        periodStart = nextMonth
      }
      return avos
    }

    const monthsInYear = calculate13thAvos()
    const decimoTerceiro = (baseCalculo / 12) * monthsInYear

    const feriasPropMeses = calculateVacationAvos()
    const feriasProporcionais = (baseCalculo / 12) * feriasPropMeses
    const feriasVencidas = hasExpiredVacation ? baseCalculo : 0
    const umTercoConstitucional = (feriasProporcionais + feriasVencidas) / 3

    // 4. Aviso Prévio (Já calculado acima para uso na projeção)

    // 5. Deduções
    const irrf = (() => {
      const base = (saldoSalario + decimoTerceiro + avisoPrevioValue)
      if (base <= 2259.20) return 0
      if (base <= 2826.65) return base * 0.075 - 169.44
      if (base <= 3751.05) return base * 0.15 - 381.44
      if (base <= 4664.68) return base * 0.225 - 662.77
      return base * 0.275 - 896.00
    })()
    
    const extraAdditions = extras.filter(e => e.type === 'addition').reduce((sum, e) => sum + e.value, 0)
    const extraDeductions = extras.filter(e => e.type === 'deduction').reduce((sum, e) => sum + e.value, 0)

    const grossTotal = saldoSalario + decimoTerceiro + feriasProporcionais + feriasVencidas + umTercoConstitucional + avisoPrevioValue + extraAdditions
    
    // FGTS and Penalty
    const fgtsPenaltyPercent = terminationType === 'dispensa_sem_justa' ? 0.4 : terminationType === 'acordo_mutuo' ? 0.2 : 0
    const fgtsPenalty = form.fgtsBalance * fgtsPenaltyPercent
    const fgtsOnTermination = (saldoSalario + decimoTerceiro + avisoPrevioValue) * 0.08

    const deductionsTotal = irrf + extraDeductions
    const liquidOnly = grossTotal - deductionsTotal
    const netTotal = liquidOnly + (terminationType === 'dispensa_com_justa' ? 0 : fgtsPenalty) + fgtsOnTermination

    return {
      baseCalculo: Number(baseCalculo.toFixed(2)),
      insalubridadeMensal: Number(insalubridadeMensal.toFixed(2)),
      saldoSalario: Number(saldoSalario.toFixed(2)),
      saldoInsalubridade: Number(saldoInsalubridade.toFixed(2)),
      decimoTerceiro: Number(decimoTerceiro.toFixed(2)),
      monthsInYear,
      feriasProporcionais: Number(feriasProporcionais.toFixed(2)),
      feriasPropMeses,
      feriasVencidas: Number(feriasVencidas.toFixed(2)),
      umTercoConstitucional: Number(umTercoConstitucional.toFixed(2)),
      avisoPrevioValue: Number(avisoPrevioValue.toFixed(2)),
      avisoPrevioDays,
      irrf: Number(irrf.toFixed(2)),
      extraAdditions: Number(extraAdditions.toFixed(2)),
      extraDeductions: Number(extraDeductions.toFixed(2)),
      grossTotal: Number(grossTotal.toFixed(2)),
      deductionsTotal: Number(deductionsTotal.toFixed(2)),
      fgtsPenalty: Number(fgtsPenalty.toFixed(2)),
      fgtsOnTermination: Number(fgtsOnTermination.toFixed(2)),
      liquidOnly: Number(liquidOnly.toFixed(2)),
      netTotal: Number(netTotal.toFixed(2))
    }
  }, [form, extras])

  const handleSave = async () => {
    if (!results) return
    setSaving(true)
    try {
      const terminationId = crypto.randomUUID()
      const newTermination: Termination = {
        id: terminationId,
        funcionarioNome: form.name,
        cpf: form.cpf,
        cargo: form.role,
        salarioBase: form.salary,
        dataAdmissao: form.admissionDate || null,
        dataDemissao: form.terminationDate || null,
        tipoRescisao: form.terminationType,
        valorLiquido: results.liquidOnly,
        valorFgts: results.fgtsPenalty,
        valorTotal: results.netTotal,
        status: 'pendente',
        funcionarioId: form.employeeId || null,
        details: {
          results,
          form,
          extras
        }
      }

      await insertTermination(newTermination)

      // Gerar lançamento no Contas a Pagar
      await insertBill({
        id: crypto.randomUUID(),
        descricao: `RESCISÃO: ${form.name}`,
        valor: Number(results.netTotal.toFixed(2)),
        vencimento: form.terminationDate, // Vencimento na data de desligamento (ou pode ser +10 dias)
        status: 'pendente'
      } as Bill)

      alert('Rescisão salva com sucesso e lançada no Contas a Pagar!')
    } catch (error: any) {
      console.error(error)
      alert(`Erro ao salvar rescisão: ${error.message || 'Erro desconhecido'}`)
    } finally {
      setSaving(false)
    }
  }

  const printReport = (isOfficial = false) => {
    if (!results) return
    const title = isOfficial ? 'Recibo de Rescisão' : 'Simulação de Rescisão'
    
    const content = `
      <div class="report-header">
        <h2>${title} - ${form.name || (isOfficial ? '---' : 'Cálculo Simulado')}</h2>
        <p>CPF: ${form.cpf || '---'} | Cargo: ${form.role || '---'}</p>
        ${isOfficial ? `<p>Data Admissão: ${form.admissionDate ? new Date(form.admissionDate).toLocaleDateString() : '---'} | Data Desligamento: ${form.terminationDate ? new Date(form.terminationDate).toLocaleDateString() : '---'}</p>` : ''}
      </div>
      <table class="w-full">
        <thead>
          <tr><th>Descrição</th><th class="text-right">Proventos</th><th class="text-right">Descontos</th></tr>
        </thead>
        <tbody>
          <tr><td>Saldo de Salário (${form.workedDays} dias)</td><td class="text-right">${formatCurrency(results.saldoSalario - results.saldoInsalubridade)}</td><td></td></tr>
          ${results.saldoInsalubridade > 0 ? `<tr><td>Adicional Insalubridade s/ Saldo</td><td class="text-right">${formatCurrency(results.saldoInsalubridade)}</td><td></td></tr>` : ''}
          <tr><td>13º Salário Proporcional (${results.monthsInYear}/12)</td><td class="text-right">${formatCurrency(results.decimoTerceiro)}</td><td></td></tr>
          <tr><td>Férias Proporcionais (${results.feriasPropMeses}/12)</td><td class="text-right">${formatCurrency(results.feriasProporcionais)}</td><td></td></tr>
          ${results.feriasVencidas > 0 ? `<tr><td>Férias Vencidas</td><td class="text-right">${formatCurrency(results.feriasVencidas)}</td><td></td></tr>` : ''}
          <tr><td>1/3 Constitucional sobre Férias</td><td class="text-right">${formatCurrency(results.umTercoConstitucional)}</td><td></td></tr>
          ${results.avisoPrevioValue > 0 ? `<tr><td>Aviso Prévio Indenizado (${results.avisoPrevioDays} dias)</td><td class="text-right">${formatCurrency(results.avisoPrevioValue)}</td><td></td></tr>` : ''}
          ${extras.map(e => `<tr><td>${e.name}</td><td class="text-right">${e.type === 'addition' ? formatCurrency(e.value) : ''}</td><td class="text-right">${e.type === 'deduction' ? formatCurrency(e.value) : ''}</td></tr>`).join('')}
          ${results.irrf > 0 ? `<tr><td>IRRF sobre Verbas Rescisórias</td><td></td><td class="text-right">${formatCurrency(results.irrf)}</td></tr>` : ''}
        </tbody>
        <tfoot>
          <tr style="font-weight:700;">
            <td>TOTAL</td>
            <td class="text-right">${formatCurrency(results.grossTotal)}</td>
            <td class="text-right">${formatCurrency(results.deductionsTotal)}</td>
          </tr>
        </tfoot>
      </table>
      
      <div style="margin-top: 20px; padding: 15px; background: #f9fafb; border-radius: 8px;">
        <h3>Resumo FGTS</h3>
        <p>Multa do FGTS (${form.terminationType === 'dispensa_sem_justa' ? '40%' : '20%'}): <strong>${formatCurrency(results.fgtsPenalty)}</strong></p>
        <p>FGTS sobre Rescisão (8%): <strong>${formatCurrency(results.fgtsOnTermination)}</strong></p>
      </div>

      <div style="margin-top: 20px; text-align: right; font-size: 1.2rem; font-weight: 700;">
        <p>VALOR LÍQUIDO A RECEBER: ${formatCurrency(results.netTotal)}</p>
      </div>

      ${isOfficial ? `
      <div style="margin-top: 80px; display: flex; justify-content: space-around;">
        <div style="text-align: center; border-top: 1px solid #000; width: 250px; padding-top: 5px;">
          <p>${form.name || 'Nome do Funcionário'}</p>
          <p style="font-size: 10px;">Funcionário</p>
        </div>
        <div style="text-align: center; border-top: 1px solid #000; width: 250px; padding-top: 5px;">
          <p>${clinic.razao_social || clinic.name}</p>
          <p style="font-size: 10px;">Empregador</p>
        </div>
      </div>
      ` : ''}
    `
    printPDF(title, content, clinic)
  }

  const printSavedTermination = (t: Termination) => {
    // If we have saved details, use them. Otherwise, show a simplified report.
    const res = t.details?.results || {
      saldoSalario: t.valorLiquido,
      decimoTerceiro: 0,
      feriasProporcionais: 0,
      umTercoConstitucional: 0,
      avisoPrevioValue: 0,
      grossTotal: t.valorLiquido,
      deductionsTotal: 0,
      fgtsPenalty: t.valorFgts,
      fgtsOnTermination: 0,
      netTotal: t.valorTotal
    }
    
    const detailsForm = t.details?.form || { workedDays: '---' }
    const detailsExtras = t.details?.extras || []

    const content = `
      <div class="report-header">
        <h2>Recibo de Rescisão - ${t.funcionarioNome}</h2>
        <p>CPF: ${t.cpf || '---'} | Cargo: ${t.cargo || '---'}</p>
        <p>Data Admissão: ${new Date(t.dataAdmissao).toLocaleDateString()} | Data Desligamento: ${new Date(t.dataDemissao).toLocaleDateString()}</p>
      </div>
      <table class="w-full">
        <thead>
          <tr><th>Descrição</th><th class="text-right">Proventos</th><th class="text-right">Descontos</th></tr>
        </thead>
        <tbody>
          ${res.saldoSalario > 0 ? `<tr><td>Verbas Rescisórias / Saldo</td><td class="text-right">${formatCurrency(res.saldoSalario - (res.saldoInsalubridade || 0))}</td><td></td></tr>` : ''}
          ${res.saldoInsalubridade > 0 ? `<tr><td>Adicional Insalubridade s/ Saldo</td><td class="text-right">${formatCurrency(res.saldoInsalubridade)}</td><td></td></tr>` : ''}
          ${res.decimoTerceiro > 0 ? `<tr><td>13º Salário</td><td class="text-right">${formatCurrency(res.decimoTerceiro)}</td><td></td></tr>` : ''}
          ${res.feriasProporcionais > 0 ? `<tr><td>Férias + 1/3</td><td class="text-right">${formatCurrency(res.feriasProporcionais + (res.umTercoConstitucional || 0))}</td><td></td></tr>` : ''}
          ${res.avisoPrevioValue > 0 ? `<tr><td>Aviso Prévio</td><td class="text-right">${formatCurrency(res.avisoPrevioValue)}</td><td></td></tr>` : ''}
          ${detailsExtras.map((e: any) => `<tr><td>${e.name}</td><td class="text-right">${e.type === 'addition' ? formatCurrency(e.value) : ''}</td><td class="text-right">${e.type === 'deduction' ? formatCurrency(e.value) : ''}</td></tr>`).join('')}
        </tbody>
        <tfoot>
          <tr style="font-weight:700;">
            <td>TOTAL LÍQUIDO</td>
            <td class="text-right">${formatCurrency(t.valorLiquido)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      
      <div style="margin-top: 20px; padding: 15px; background: #f9fafb; border-radius: 8px;">
        <h3>Resumo FGTS</h3>
        <p>Multa do FGTS: <strong>${formatCurrency(t.valorFgts)}</strong></p>
      </div>

      <div style="margin-top: 40px; text-align: right; font-size: 1.2rem; font-weight: 700; border-top: 2px solid #000; pt: 10px;">
        <p>VALOR TOTAL A RECEBER: ${formatCurrency(t.valorTotal)}</p>
      </div>

      <div style="margin-top: 80px; display: flex; justify-content: space-around;">
        <div style="text-align: center; border-top: 1px solid #000; width: 250px; padding-top: 5px;">
          <p>${t.funcionarioNome}</p>
          <p style="font-size: 10px;">Funcionário</p>
        </div>
        <div style="text-align: center; border-top: 1px solid #000; width: 250px; padding-top: 5px;">
          <p>${clinic.razao_social || clinic.name}</p>
          <p style="font-size: 10px;">Empregador</p>
        </div>
      </div>
    `
    printPDF('Recibo de Rescisão', content, clinic)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calculadora de Acerto</h1>
          <p className="text-muted-foreground">Cálculo rescisório completo (CLT 2024)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsHistoryOpen(true)} className="gap-2">
            <History className="h-4 w-4" /> Histórico
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()} className="gap-2">
            Limpar Tudo
          </Button>
        </div>
      </div>

      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Histórico de Rescisões
            </DialogTitle>
            <DialogClose onClose={() => setIsHistoryOpen(false)} />
          </DialogHeader>
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {terminations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Nenhuma rescisão salva.
                    </TableCell>
                  </TableRow>
                ) : (
                  terminations.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">
                        {t.funcionarioNome}
                        <div className="text-[10px] text-muted-foreground">{t.tipoRescisao.replace(/_/g, ' ')}</div>
                      </TableCell>
                      <TableCell>{new Date(t.dataDemissao).toLocaleDateString()}</TableCell>
                      <TableCell className="font-bold">{formatCurrency(t.valorTotal)}</TableCell>
                      <TableCell>
                        <Badge variant={t.status === 'pago' ? 'success' : 'warning'}>
                          {t.status === 'pago' ? 'Pago' : 'Pendente'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => printSavedTermination(t)} title="Imprimir Recibo">
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => removeTermination(t.id)} className="text-destructive" title="Excluir">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulário de Input */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Informações Básicas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 relative">
                <Label>Buscar Funcionário</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    value={searchTerm} 
                    onChange={e => {
                      setSearchTerm(e.target.value)
                      setShowResults(true)
                    }} 
                    onFocus={() => setShowResults(true)}
                    placeholder="Digite o nome para buscar no cadastro..." 
                    className="pl-10" 
                  />
                </div>
                
                {showResults && (
                  <Card className="absolute z-10 w-full mt-1 max-h-60 overflow-y-auto shadow-xl border-primary/20">
                    <div className="p-1">
                      {employees
                        .filter(e => e.status === 'ativo' && (searchTerm ? e.nome.toLowerCase().includes(searchTerm.toLowerCase()) : true))
                        .map(emp => (
                          <button
                            key={emp.id}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10 rounded-md flex items-center gap-3 transition-colors"
                            onClick={() => {
                              setForm({
                                ...form,
                                name: emp.nome,
                                cpf: emp.cpf,
                                role: emp.cargo,
                                salary: emp.salario,
                                hasInsalubridade: emp.tem_insalubridade,
                                insalubridadePercent: emp.insalubridade_percentual || 0,
                                admissionDate: emp.dataAdmissao || '',
                                employeeId: emp.id,
                                workedDays: form.terminationDate 
                                  ? new Date(form.terminationDate).getDate() 
                                  : 30
                              })
                              setSearchTerm(emp.nome)
                              setShowResults(false)
                            }}
                          >
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                              {emp.nome.charAt(0)}
                            </div>
                            <div>
                              <div className="font-medium text-foreground">{emp.nome}</div>
                              <div className="text-[10px] text-muted-foreground uppercase">{emp.cargo} • {emp.cpf}</div>
                            </div>
                          </button>
                        ))}
                      {employees.filter(e => e.status === 'ativo' && (searchTerm ? e.nome.toLowerCase().includes(searchTerm.toLowerCase()) : true)).length === 0 && (
                        <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                          Nenhum funcionário encontrado.
                        </div>
                      )}
                    </div>
                  </Card>
                )}
                {showResults && (
                  <div className="fixed inset-0 z-0" onClick={() => setShowResults(false)} />
                )}
              </div>

              <div className="md:col-span-2 bg-muted/30 p-4 rounded-lg border border-dashed border-muted-foreground/30">
                <div className="flex items-center gap-2 text-primary font-semibold mb-3">
                  <User className="h-4 w-4" />
                  Dados Preenchidos
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Nome Completo</Label>
                    <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Nome completo" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">CPF</Label>
                    <Input value={form.cpf} onChange={e => setForm({...form, cpf: e.target.value})} placeholder="000.000.000-00" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Cargo</Label>
                    <Input value={form.role} onChange={e => setForm({...form, role: e.target.value})} placeholder="Ex: Técnico de Enfermagem" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Salário Base (R$)</Label>
                    <Input type="number" value={form.salary} onChange={e => setForm({...form, salary: Number(e.target.value)})} />
                  </div>
                </div>
              </div>
              <div>
                <Label>Saldo do FGTS para Multa (R$)</Label>
                <Input type="number" value={form.fgtsBalance} onChange={e => setForm({...form, fgtsBalance: Number(e.target.value)})} className="mt-1" />
              </div>
              <div>
                <Label>Data de Admissão</Label>
                <Input type="date" value={form.admissionDate} onChange={e => setForm({...form, admissionDate: e.target.value})} className="mt-1" />
              </div>
              <div>
                <Label>Data de Desligamento</Label>
                <Input 
                  type="date" 
                  value={form.terminationDate} 
                  onChange={e => {
                    const date = new Date(e.target.value)
                    setForm({
                      ...form, 
                      terminationDate: e.target.value,
                      workedDays: !isNaN(date.getTime()) ? date.getDate() : form.workedDays
                    })
                  }} 
                  className="mt-1" 
                />
              </div>
              <div>
                <Label>Tipo de Rescisão</Label>
                <Select value={form.terminationType} onChange={e => setForm({...form, terminationType: e.target.value as TerminationType})} className="mt-1">
                  <option value="dispensa_sem_justa">Dispensa sem Justa Causa</option>
                  <option value="pedido_demissao">Pedido de Demissão</option>
                  <option value="dispensa_com_justa">Dispensa com Justa Causa</option>
                  <option value="acordo_mutuo">Acordo Mútuo (Art. 484-A)</option>
                </Select>
              </div>
              <div>
                <Label>Dias Trabalhados no Mês</Label>
                <Input type="number" max="31" value={form.workedDays} onChange={e => setForm({...form, workedDays: Number(e.target.value)})} className="mt-1" />
              </div>
              <div className="flex flex-col gap-3 pt-4 border-t border-dashed mt-2">
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    id="hasInsalubridade"
                    checked={form.hasInsalubridade} 
                    onChange={e => setForm({...form, hasInsalubridade: e.target.checked})}
                    className="w-4 h-4 text-primary rounded border-gray-300"
                  />
                  <Label htmlFor="hasInsalubridade" className="cursor-pointer">Adicional de Insalubridade</Label>
                  
                  {form.hasInsalubridade && (
                    <div className="flex items-center gap-2 ml-4">
                      <Input 
                        type="number" 
                        className="w-20 h-8" 
                        value={form.insalubridadePercent} 
                        onChange={e => setForm({...form, insalubridadePercent: Number(e.target.value)})}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    id="expiredVacation"
                    checked={form.hasExpiredVacation} 
                    onChange={e => setForm({...form, hasExpiredVacation: e.target.checked})}
                    className="w-4 h-4 text-primary rounded border-gray-300"
                  />
                  <Label htmlFor="expiredVacation" className="cursor-pointer">Possui Férias Vencidas?</Label>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Ajustes Extras (Extras e Descontos)</h3>
              <Button size="sm" onClick={addExtra} className="gap-2"><Plus className="h-4 w-4" /> Adicionar</Button>
            </div>
            
            {extras.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum ajuste extra adicionado.</p>
            ) : (
                <div className="space-y-3">
                  {extras.map(e => (
                    <div key={e.id} className="flex gap-3 items-end">
                      <div className="flex-1">
                        <Label className="text-[10px] uppercase text-muted-foreground">Descrição</Label>
                        <Input value={e.name} onChange={v => updateExtra(e.id, 'name', v.target.value)} />
                      </div>
                      <div className="w-32">
                        <Label className="text-[10px] uppercase text-muted-foreground">Valor (R$)</Label>
                        <Input type="number" value={e.value} onChange={v => updateExtra(e.id, 'value', Number(v.target.value))} />
                      </div>
                      <div className="w-32">
                        <Label className="text-[10px] uppercase text-muted-foreground">Tipo</Label>
                        <Select value={e.type} onChange={v => updateExtra(e.id, 'type', v.target.value)}>
                          <option value="addition">Acréscimo</option>
                          <option value="deduction">Desconto</option>
                        </Select>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeExtra(e.id)} className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
            )}
          </Card>
        </div>

        {/* Resultados */}
        <div className="space-y-6">
          <Card className="p-6 bg-primary/5 border-primary/20 sticky top-20">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <Calculator className="h-5 w-5 text-primary" />
              Resumo do Cálculo
            </h3>

            {!results ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
                Preencha os dados acima para ver o resultado do acerto.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Saldo de Salário:</span>
                  <span className="font-medium">{formatCurrency(results.saldoSalario - results.saldoInsalubridade)} <span className="text-[10px] text-muted-foreground">({form.workedDays}d)</span></span>
                </div>
                {results.saldoInsalubridade > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Insalubridade s/ Saldo:</span>
                    <span className="font-medium">{formatCurrency(results.saldoInsalubridade)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Aviso Prévio:</span>
                  <span className="font-medium text-green-600">+{formatCurrency(results.avisoPrevioValue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Férias + 1/3:</span>
                  <span className="font-medium">{formatCurrency(results.feriasProporcionais + results.feriasVencidas + results.umTercoConstitucional)} <span className="text-[10px] text-muted-foreground">({results.feriasPropMeses}/12)</span></span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">13º Proporcional:</span>
                  <span className="font-medium">{formatCurrency(results.decimoTerceiro)} <span className="text-[10px] text-muted-foreground">({results.monthsInYear}/12)</span></span>
                </div>
                {results.irrf > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">IRRF:</span>
                    <span className="font-medium text-destructive">-{formatCurrency(results.irrf)}</span>
                  </div>
                )}
                
                <Separator />
                
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground text-blue-700 font-semibold">Líquido de Verbas:</span>
                  <span className="font-bold text-blue-700">{formatCurrency(results.liquidOnly)}</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground text-green-700 font-semibold">Multa do FGTS:</span>
                  <span className="font-bold text-green-700">+{formatCurrency(results.fgtsPenalty)}</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground text-green-700 font-semibold">FGTS s/ Rescisão (8%):</span>
                  <span className="font-bold text-green-700">+{formatCurrency(results.fgtsOnTermination)}</span>
                </div>

                <div className="pt-4 mt-4 border-t-2 border-primary/10">
                    <div className="flex justify-between items-center bg-primary/10 p-3 rounded-lg border border-primary/20">
                        <span className="text-md font-bold text-primary italic">TOTAL FINAL:</span>
                        <span className="text-2xl font-black text-primary">{formatCurrency(results.netTotal)}</span>
                    </div>
                </div>

                <div className="pt-6 flex flex-col gap-2">
                  <Button className="w-full gap-2 border-primary bg-primary/90 hover:bg-primary shadow-lg" onClick={handleSave} disabled={saving}>
                    {saving ? 'Salvando...' : <Save className="h-4 w-4" />} {saving ? 'Processando...' : 'Salvar e Gerar Contas a Pagar'}
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="w-full gap-2 text-xs" onClick={() => printReport(false)}>
                      <Calculator className="h-3 w-3" /> Gerar Simulação
                    </Button>
                    <Button variant="outline" className="w-full gap-2 text-xs border-primary text-primary hover:bg-primary/5" onClick={() => printReport(true)}>
                      <Printer className="h-3 w-3" /> Recibo Oficial
                    </Button>
                  </div>
                </div>
                
                <div className="p-3 bg-blue-50 text-[10px] text-blue-700 rounded-md border border-blue-200 mt-4 leading-relaxed">
                   <strong>AVISO:</strong> Este cálculo é uma simulação baseada nas regras gerais da CLT e tabelas vigentes de 2024. Não substitui o cálculo oficial do contador ou do sistema de folha.
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
