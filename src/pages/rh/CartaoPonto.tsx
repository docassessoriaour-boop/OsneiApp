import { useEffect, useMemo, useState } from 'react'
import { addMonths, eachDayOfInterval, endOfMonth, format, getDay, parseISO, startOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Download, FileText, Loader2, Save } from 'lucide-react'
import { useDb } from '@/hooks/useDb'
import { useClinic } from '@/lib/clinicConfig'
import { getCompanyWorkUnit, matchesWorkUnit } from '@/lib/units'
import { printPDF } from '@/lib/pdf'
import { calculateTimeCardDay, formatMinutes, getEmployeeShift, isScheduledWorkday } from '@/lib/timeCard'
import type { TimeCardEntry } from '@/lib/timeCard'
import type { Employee } from '@/lib/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type EntryDraft = Pick<TimeCardEntry, 'entry_1' | 'exit_1' | 'entry_2' | 'exit_2' | 'status' | 'notes'>

const blankEntry: EntryDraft = {
  entry_1: '', exit_1: '', entry_2: '', exit_2: '', status: 'trabalho', notes: ''
}

function normalizeEmployee(raw: any): Employee {
  return { ...raw, dataAdmissao: raw.dataAdmissao || raw.data_admissao || '' } as Employee
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char] || char)
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export default function CartaoPonto() {
  const { data: rawEmployees, loading: loadingEmployees } = useDb<Employee>('employees')
  const { data: entries, loading: loadingEntries, insert, update } = useDb<TimeCardEntry>('time_card_entries')
  const [clinic] = useClinic()
  const employees = useMemo(() => rawEmployees.map(normalizeEmployee), [rawEmployees])
  const companyWorkUnit = getCompanyWorkUnit(clinic as any)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [unit, setUnit] = useState(companyWorkUnit)
  const [employeeId, setEmployeeId] = useState('')
  const [tab, setTab] = useState('apontamentos')
  const [drafts, setDrafts] = useState<Record<string, EntryDraft>>({})
  const [savingDate, setSavingDate] = useState('')
  const [reducedNightHour, setReducedNightHour] = useState(true)
  const [extendAfterFive, setExtendAfterFive] = useState(false)

  useEffect(() => setUnit(companyWorkUnit), [companyWorkUnit])

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const days = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [monthStart.getTime(), monthEnd.getTime()])
  const monthPrefix = format(currentDate, 'yyyy-MM')
  const activeEmployees = useMemo(() => employees
    .filter(employee => employee.status === 'ativo' && matchesWorkUnit(employee.unidade, unit, clinic as any))
    .sort((a, b) => a.nome.localeCompare(b.nome)), [employees, unit, clinic])
  const selectedEmployee = activeEmployees.find(employee => employee.id === employeeId) || activeEmployees[0]

  useEffect(() => {
    if (!employeeId && activeEmployees[0]) setEmployeeId(activeEmployees[0].id)
    if (employeeId && !activeEmployees.some(employee => employee.id === employeeId)) setEmployeeId(activeEmployees[0]?.id || '')
  }, [activeEmployees, employeeId])

  useEffect(() => {
    const next: Record<string, EntryDraft> = {}
    entries.forEach(entry => {
      if (entry.work_date.startsWith(monthPrefix)) {
        next[`${entry.employee_id}:${entry.work_date}`] = {
          entry_1: entry.entry_1?.slice(0, 5) || '', exit_1: entry.exit_1?.slice(0, 5) || '',
          entry_2: entry.entry_2?.slice(0, 5) || '', exit_2: entry.exit_2?.slice(0, 5) || '',
          status: entry.status || 'trabalho', notes: entry.notes || ''
        }
      }
    })
    setDrafts(next)
  }, [entries, monthPrefix])

  const options = { reducedNightHour, extendAfterFive }
  const getDraft = (employee: Employee, date: string): EntryDraft => {
    const key = `${employee.id}:${date}`
    const stored = drafts[key]
    if (stored) return stored
    return { ...blankEntry, status: isScheduledWorkday(employee, date) ? 'trabalho' : 'folga' }
  }
  const setDraft = (employee: Employee, date: string, patch: Partial<EntryDraft>) => {
    const key = `${employee.id}:${date}`
    setDrafts(previous => ({ ...previous, [key]: { ...getDraft(employee, date), ...patch } }))
  }

  async function saveEntry(employee: Employee, date: string) {
    const draft = getDraft(employee, date)
    const existing = entries.find(entry => entry.employee_id === employee.id && entry.work_date === date)
    setSavingDate(date)
    try {
      const payload = { employee_id: employee.id, work_date: date, ...draft }
      if (existing) await update(existing.id, payload)
      else await insert(payload)
    } catch (error) {
      console.error(error)
      alert('Não foi possível salvar o apontamento. Verifique se a atualização do banco de dados foi aplicada.')
    } finally {
      setSavingDate('')
    }
  }

  function getEmployeeSummary(employee: Employee) {
    const totals = days.reduce((sum, day) => {
      const date = format(day, 'yyyy-MM-dd')
      const calculation = calculateTimeCardDay(employee, date, getDraft(employee, date), options)
      return {
        worked: sum.worked + calculation.workedMinutes,
        expected: sum.expected + calculation.expectedMinutes,
        overtime: sum.overtime + calculation.overtimeMinutes,
        missing: sum.missing + calculation.missingMinutes,
        night: sum.night + calculation.nightReducedMinutes,
      }
    }, { worked: 0, expected: 0, overtime: 0, missing: 0, night: 0 })
    return { ...totals, balance: totals.worked - totals.expected }
  }

  function downloadCsv() {
    const rows = [['Funcionário', 'CPF', 'Cargo', 'Escala', 'Horas previstas', 'Horas trabalhadas', 'Saldo', 'Horas extras', 'Horas devidas', 'Adicional noturno']]
    activeEmployees.forEach(employee => {
      const summary = getEmployeeSummary(employee)
      rows.push([employee.nome, employee.cpf, employee.cargo, employee.escala, formatMinutes(summary.expected), formatMinutes(summary.worked), formatMinutes(summary.balance, true), formatMinutes(summary.overtime), formatMinutes(summary.missing), formatMinutes(summary.night)])
    })
    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `relatorio-cartao-ponto-${monthPrefix}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function printAccountingReport() {
    const rows = activeEmployees.map(employee => {
      const summary = getEmployeeSummary(employee)
      return `<tr><td>${escapeHtml(employee.nome)}</td><td>${escapeHtml(employee.cpf)}</td><td>${escapeHtml(employee.cargo)}</td><td class="text-center">${escapeHtml(employee.escala)}</td><td class="text-center">${formatMinutes(summary.expected)}</td><td class="text-center">${formatMinutes(summary.worked)}</td><td class="text-center">${formatMinutes(summary.balance, true)}</td><td class="text-center">${formatMinutes(summary.overtime)}</td><td class="text-center">${formatMinutes(summary.missing)}</td><td class="text-center">${formatMinutes(summary.night)}</td></tr>`
    }).join('')
    const month = format(currentDate, 'MMMM yyyy', { locale: ptBR })
    printPDF(`Relatório de horas trabalhadas - ${month}`, `<table style="font-size:7pt"><thead><tr><th>Funcionário</th><th>CPF</th><th>Cargo</th><th>Escala</th><th>Previstas</th><th>Trabalhadas</th><th>Saldo</th><th>Extras</th><th>Devidas</th><th>Noturnas</th></tr></thead><tbody>${rows}</tbody></table><p style="font-size:8pt">Horas noturnas ${reducedNightHour ? 'convertidas pela hora reduzida de 52min30s' : 'em horas de relógio'}${extendAfterFive ? ', com prorrogação após 05:00' : ''}.</p>`, clinic, { orientation: 'landscape', compactLayout: true })
  }

  function printEmployeeReport(employee: Employee) {
    const rows = days.map(day => {
      const date = format(day, 'yyyy-MM-dd')
      const draft = getDraft(employee, date)
      const calculation = calculateTimeCardDay(employee, date, draft, options)
      return `<tr><td>${format(day, 'dd/MM/yyyy')}</td><td>${format(day, 'EEE', { locale: ptBR })}</td><td>${escapeHtml(draft.status)}</td><td>${escapeHtml(draft.entry_1 || '-')}</td><td>${escapeHtml(draft.exit_1 || '-')}</td><td>${escapeHtml(draft.entry_2 || '-')}</td><td>${escapeHtml(draft.exit_2 || '-')}</td><td>${formatMinutes(calculation.workedMinutes)}</td><td>${formatMinutes(calculation.expectedMinutes)}</td><td>${formatMinutes(calculation.workedMinutes - calculation.expectedMinutes, true)}</td><td>${formatMinutes(calculation.nightReducedMinutes)}</td></tr>`
    }).join('')
    const summary = getEmployeeSummary(employee)
    const html = `<div style="font-size:9pt;margin-bottom:8px"><strong>Funcionário:</strong> ${escapeHtml(employee.nome)} &nbsp; <strong>CPF:</strong> ${escapeHtml(employee.cpf)}<br/><strong>Cargo:</strong> ${escapeHtml(employee.cargo)} &nbsp; <strong>Escala:</strong> ${escapeHtml(employee.escala)} &nbsp; <strong>Horário:</strong> ${getEmployeeShift(employee).start}–${getEmployeeShift(employee).end}</div><table style="font-size:7pt"><thead><tr><th>Data</th><th>Dia</th><th>Status</th><th>Ent. 1</th><th>Saí. 1</th><th>Ent. 2</th><th>Saí. 2</th><th>Horas</th><th>Base</th><th>Saldo</th><th>A.N.</th></tr></thead><tbody>${rows}</tbody></table><div class="divider"></div><table style="font-size:9pt"><tbody><tr><td><strong>Horas previstas</strong></td><td>${formatMinutes(summary.expected)}</td><td><strong>Horas trabalhadas</strong></td><td>${formatMinutes(summary.worked)}</td><td><strong>Saldo</strong></td><td>${formatMinutes(summary.balance, true)}</td><td><strong>Adicional noturno</strong></td><td>${formatMinutes(summary.night)}</td></tr></tbody></table>`
    printPDF(`Cartão de ponto - ${employee.nome} - ${format(currentDate, 'MMMM yyyy', { locale: ptBR })}`, html, clinic, { orientation: 'landscape', compactLayout: true })
  }

  const selectedSummary = selectedEmployee ? getEmployeeSummary(selectedEmployee) : null
  const loading = loadingEmployees || loadingEntries

  return <div>
    <PageHeader title="Cartão de Ponto" description="Registre horários e feche as horas mensais para a contabilidade">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={unit} onChange={event => setUnit(event.target.value)} className="w-44 bg-white"><option value={companyWorkUnit}>{companyWorkUnit}</option></Select>
        <Button variant="outline" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="min-w-32 text-center text-sm font-semibold capitalize">{format(currentDate, 'MMMM yyyy', { locale: ptBR })}</span>
        <Button variant="outline" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </PageHeader>

    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="mb-3"><TabsTrigger value="apontamentos">Apontamentos</TabsTrigger><TabsTrigger value="resumo">Resumo para contabilidade</TabsTrigger><TabsTrigger value="configuracoes">Regras de cálculo</TabsTrigger></TabsList>

      <TabsContent value="apontamentos">
        <Card className="p-4">
          {loading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div> : !selectedEmployee ? <p className="p-10 text-center text-muted-foreground">Cadastre funcionários ativos para iniciar o cartão de ponto.</p> : <>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-72"><Label>Funcionário</Label><Select value={selectedEmployee.id} onChange={event => setEmployeeId(event.target.value)}>{activeEmployees.map(employee => <option key={employee.id} value={employee.id}>{employee.nome}</option>)}</Select></div>
              <div className="flex gap-2"><Button variant="outline" onClick={() => printEmployeeReport(selectedEmployee)}><FileText className="mr-2 h-4 w-4" />PDF do funcionário</Button></div>
            </div>
            {selectedSummary && <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
              {[['Previstas', selectedSummary.expected], ['Trabalhadas', selectedSummary.worked], ['Saldo', selectedSummary.balance], ['Extras', selectedSummary.overtime], ['Adic. noturno', selectedSummary.night]].map(([label, value]) => <div key={String(label)} className="rounded-lg border bg-muted/30 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-bold">{formatMinutes(Number(value), label === 'Saldo')}</div></div>)}
            </div>}
            <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead><tr className="border-b bg-muted/40"><th className="p-2 text-left">Data</th><th>Status</th><th>Entrada 1</th><th>Saída 1</th><th>Entrada 2</th><th>Saída 2</th><th>Trabalhadas</th><th>Base</th><th>Saldo</th><th>Noturnas</th><th>Observações</th><th></th></tr></thead><tbody>
              {days.map(day => {
                const date = format(day, 'yyyy-MM-dd')
                const draft = getDraft(selectedEmployee, date)
                const calculation = calculateTimeCardDay(selectedEmployee, date, draft, options)
                const balance = calculation.workedMinutes - calculation.expectedMinutes
                const weekend = getDay(day) === 0 || getDay(day) === 6
                return <tr key={date} className={`border-b ${weekend ? 'bg-muted/20' : ''}`}><td className="whitespace-nowrap p-2 font-medium">{format(day, 'dd/MM')} <span className="text-xs text-muted-foreground">{format(day, 'EEE', { locale: ptBR })}</span></td><td className="p-1"><Select className="h-8 min-w-28 px-2 py-1 text-xs" value={draft.status} onChange={event => setDraft(selectedEmployee, date, { status: event.target.value as EntryDraft['status'] })}><option value="trabalho">Trabalho</option><option value="falta">Falta</option><option value="folga">Folga</option><option value="ferias">Férias</option><option value="afastamento">Afastamento</option></Select></td>
                  {(['entry_1', 'exit_1', 'entry_2', 'exit_2'] as const).map(field => <td key={field} className="p-1"><Input type="time" className="h-8 min-w-24 px-2" disabled={draft.status !== 'trabalho'} value={draft[field] || ''} onChange={event => setDraft(selectedEmployee, date, { [field]: event.target.value })} /></td>)}
                  <td className="text-center font-medium">{formatMinutes(calculation.workedMinutes)}</td><td className="text-center">{formatMinutes(calculation.expectedMinutes)}</td><td className={`text-center font-semibold ${balance > 0 ? 'text-emerald-600' : balance < 0 ? 'text-red-600' : ''}`}>{formatMinutes(balance, true)}</td><td className="text-center text-indigo-600">{formatMinutes(calculation.nightReducedMinutes)}</td><td className="p-1"><Input className="h-8 min-w-40" value={draft.notes || ''} onChange={event => setDraft(selectedEmployee, date, { notes: event.target.value })} /></td><td className="p-1"><Button size="sm" variant="outline" disabled={savingDate === date} onClick={() => saveEntry(selectedEmployee, date)}>{savingDate === date ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}</Button></td></tr>
              })}
            </tbody></table></div>
          </>}
        </Card>
      </TabsContent>

      <TabsContent value="resumo">
        <Card className="p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Fechamento mensal</h3><p className="text-sm text-muted-foreground">Conferência por funcionário antes do envio ao escritório contábil.</p></div><div className="flex gap-2"><Button variant="outline" onClick={downloadCsv}><Download className="mr-2 h-4 w-4" />CSV</Button><Button onClick={printAccountingReport}><FileText className="mr-2 h-4 w-4" />Relatório PDF</Button></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b bg-muted/40"><th className="p-2 text-left">Funcionário</th><th>CPF</th><th>Escala</th><th>Previstas</th><th>Trabalhadas</th><th>Saldo</th><th>Extras</th><th>Devidas</th><th>Adic. noturno</th><th></th></tr></thead><tbody>{activeEmployees.map(employee => { const summary = getEmployeeSummary(employee); return <tr key={employee.id} className="border-b"><td className="p-2 font-medium">{employee.nome}<div className="text-xs font-normal text-muted-foreground">{employee.cargo}</div></td><td className="text-center">{employee.cpf}</td><td className="text-center">{employee.escala}</td><td className="text-center">{formatMinutes(summary.expected)}</td><td className="text-center font-semibold">{formatMinutes(summary.worked)}</td><td className={`text-center font-semibold ${summary.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatMinutes(summary.balance, true)}</td><td className="text-center">{formatMinutes(summary.overtime)}</td><td className="text-center">{formatMinutes(summary.missing)}</td><td className="text-center text-indigo-600">{formatMinutes(summary.night)}</td><td className="p-1 text-right"><Button variant="ghost" size="sm" onClick={() => printEmployeeReport(employee)}><FileText className="h-4 w-4" /></Button></td></tr> })}</tbody></table></div>
        </Card>
      </TabsContent>

      <TabsContent value="configuracoes">
        <Card className="max-w-3xl p-6"><h3 className="font-semibold">Regras do adicional noturno</h3><p className="mt-1 text-sm text-muted-foreground">Configurações inspiradas na planilha anexada. Confirme a aplicação com o escritório de contabilidade ou a convenção coletiva.</p><div className="mt-5 space-y-4"><label className="flex items-start gap-3 rounded-lg border p-4"><input type="checkbox" className="mt-1" checked={reducedNightHour} onChange={event => setReducedNightHour(event.target.checked)} /><span><strong className="block text-sm">Aplicar hora noturna reduzida</strong><span className="text-sm text-muted-foreground">Converte 52 minutos e 30 segundos trabalhados no período noturno em uma hora para o relatório.</span></span></label><label className="flex items-start gap-3 rounded-lg border p-4"><input type="checkbox" className="mt-1" checked={extendAfterFive} onChange={event => setExtendAfterFive(event.target.checked)} /><span><strong className="block text-sm">Incluir prorrogação após 05:00</strong><span className="text-sm text-muted-foreground">Inclui as horas posteriores às 05:00 quando o turno cobriu integralmente o período das 22:00 às 05:00.</span></span></label><div className="rounded-lg bg-indigo-50 p-4 text-sm text-indigo-900"><strong>Período noturno considerado:</strong> 22:00 às 05:00. As jornadas que atravessam a meia-noite são calculadas automaticamente.</div></div></Card>
      </TabsContent>
    </Tabs>
  </div>
}
