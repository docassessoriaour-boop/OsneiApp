import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF } from '@/lib/pdf'
import type { Employee, ScheduleException, ScheduleHistory } from '@/lib/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogFooter } from '@/components/ui/dialog'
import { ChevronLeft, ChevronRight, Loader2, FileText, History, Save } from 'lucide-react'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth, differenceInCalendarDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function Escalas() {
  const { data: employees, loading: loadingEmployees } = useDb<Employee>('employees')
  const { data: exceptions, insert, update, remove, loading: loadingExceptions } = useDb<ScheduleException>('schedule_exceptions')
  const { data: histories, insert: insertHistory, remove: removeHistory, loading: loadingHistories } = useDb<ScheduleHistory>('schedule_histories')
  
  const [clinic] = useClinic()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [unidadeFilter, setUnidadeFilter] = useState<'Vila Moraes' | 'Jardim Matilde'>('Vila Moraes')
  const [turnoFilter, setTurnoFilter] = useState<'todos' | 'Diurno' | 'Noturno'>('todos')
  const [isManualMode, setIsManualMode] = useState(false)
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [timeDialogOpen, setTimeDialogOpen] = useState(false)
  const [selectedCell, setSelectedCell] = useState<{ employee: Employee, day: Date } | null>(null)
  const [manualTimes, setManualTimes] = useState({ start: '', end: '' })

  const loading = loadingEmployees || loadingExceptions

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

  const activeEmployees = employees.filter(e => 
    e.status === 'ativo' && 
    ((e.unidade || 'Vila Moraes') === unidadeFilter || e.unidade === 'Ambas') &&
    (turnoFilter === 'todos' || (e.turno || 'Diurno') === turnoFilter)
  ).sort((a, b) => a.nome.localeCompare(b.nome))

  // Generate schedule based on employee scale type + exceptions
  function getSchedule(employee: Employee, day: Date): { working: boolean, dobra: boolean } {
    const dateStr = format(day, 'yyyy-MM-dd')
    
    // Check for manual override/exception first
    const exception = exceptions.find(ex => ex.employee_id === employee.id && ex.date === dateStr)
    if (exception) return { 
      working: exception.is_working, 
      dobra: !!exception.is_dobra,
      start_time: exception.start_time,
      end_time: exception.end_time
    }

    // If manual mode is active, everything else is blank
    if (isManualMode) return { working: false, dobra: false }

    // Default logic if no exception
    if (employee.escala === '40h' || employee.escala === 'Mensalista') {
      const dayOfWeek = getDay(day)
      return { working: dayOfWeek >= 1 && dayOfWeek <= 5, dobra: false }
    }

    if (employee.escala === 'Manual') return { working: false, dobra: false }

    // 12x36: alternating days based on admission date
    if (!employee.dataAdmissao) return { working: false, dobra: false }
    const admDate = parseISO(employee.dataAdmissao)
    const diff = differenceInCalendarDays(day, admDate)
    return { working: diff % 2 === 0, dobra: false }
  }

  async function handleOpenTimeDialog(employee: Employee, day: Date) {
    const dateStr = format(day, 'yyyy-MM-dd')
    const exception = exceptions.find(ex => ex.employee_id === employee.id && ex.date === dateStr)
    
    setSelectedCell({ employee, day })
    setManualTimes({
      start: exception?.start_time || '',
      end: exception?.end_time || ''
    })
    setTimeDialogOpen(true)
  }

  async function saveManualTimes() {
    if (!selectedCell) return
    const { employee, day } = selectedCell
    const dateStr = format(day, 'yyyy-MM-dd')
    const exception = exceptions.find(ex => ex.employee_id === employee.id && ex.date === dateStr)

    try {
      if (exception) {
        await update(exception.id, { 
          start_time: manualTimes.start || null, 
          end_time: manualTimes.end || null,
          is_working: true // Assume working if times are set
        })
      } else {
        await insert({
          employee_id: employee.id,
          date: dateStr,
          is_working: true,
          is_dobra: false,
          start_time: manualTimes.start || null,
          end_time: manualTimes.end || null
        } as Omit<ScheduleException, 'id'>)
      }
      setTimeDialogOpen(false)
    } catch (error) {
      console.error(error)
      alert('Erro ao salvar horários')
    }
  }

  async function toggleDay(employee: Employee, day: Date) {
    const dateStr = format(day, 'yyyy-MM-dd')
    const current = getSchedule(employee, day)
    const exception = exceptions.find(ex => ex.employee_id === employee.id && ex.date === dateStr)

    let nextWorking = true;
    let nextDobra = false;

    if (!current.working) {
      nextWorking = true;
      nextDobra = false;
    } else if (current.working && !current.dobra) {
      nextWorking = true;
      nextDobra = true;
    } else {
      nextWorking = false;
      nextDobra = false;
    }

    try {
      if (exception) {
        // Update existing exception
        await update(exception.id, { is_working: nextWorking, is_dobra: nextDobra })
      } else {
        // Create new exception
        await insert({
          employee_id: employee.id,
          date: dateStr,
          is_working: nextWorking,
          is_dobra: nextDobra
        } as Omit<ScheduleException, 'id'>)
      }
    } catch (error) {
      console.error('Erro ao salvar alteração na escala:', error)
      alert('Não foi possível salvar a alteração.')
    }
  }

  async function clearMonthExceptions() {
    if (!confirm('Deseja remover todos os ajustes manuais deste mês para esta unidade?')) return
    const monthStr = format(currentDate, 'yyyy-MM')
    const toDelete = exceptions.filter(ex => ex.date.startsWith(monthStr) && activeEmployees.some(e => e.id === ex.employee_id))
    
    try {
      for (const ex of toDelete) {
        await remove(ex.id)
      }
      alert('Escala resetada para o padrão automático.')
    } catch (error) {
      console.error(error)
      alert('Erro ao limpar escala')
    }
  }

  async function invertCycle12x36(employee: Employee) {
    if (employee.escala !== '12x36') return
    if (!confirm(`Deseja inverter o ciclo 12x36 de ${employee.nome} para este mês?`)) return

    try {
      for (const day of days) {
        const dateStr = format(day, 'yyyy-MM-dd')
        const current = getSchedule(employee, day)
        const exception = exceptions.find(ex => ex.employee_id === employee.id && ex.date === dateStr)
        
        if (exception) {
          await update(exception.id, { is_working: !current.working, is_dobra: false })
        } else {
          await insert({
            employee_id: employee.id,
            date: dateStr,
            is_working: !current.working,
            is_dobra: false
          } as Omit<ScheduleException, 'id'>)
        }
      }
    } catch (error) {
      console.error(error)
      alert('Erro ao inverter ciclo')
    }
  }

  async function saveSnapshot() {
    const monthName = format(currentDate, 'MMMM yyyy', { locale: ptBR })
    if (!confirm(`Deseja salvar a exibição atual como o Histórico Fixo para ${monthName} (${unidadeFilter})?`)) return
    
    const snapshotData = {
      daysCount: days.length,
      employees: activeEmployees.map(emp => {
        return {
          id: emp.id,
          nome: emp.nome,
          escala: emp.escala,
          turno: emp.turno || 'Diurno',
          schedule: days.map(day => {
            const { working, dobra } = getSchedule(emp, day)
            return {
              date: format(day, 'yyyy-MM-dd'),
              working,
              dobra
            }
          })
        }
      })
    }

    try {
      await insertHistory({
        month: format(currentDate, 'yyyy-MM'),
        unidade: unidadeFilter,
        snapshot_data: snapshotData
      } as Omit<ScheduleHistory, 'id' | 'created_at'>)
      alert('Histórico salvo com sucesso!')
    } catch {
      alert('Erro ao salvar histórico.')
    }
  }

  function printHistory(history: ScheduleHistory) {
    const [year, month] = history.month.split('-')
    const histDate = new Date(Number(year), Number(month) - 1, 1)
    const monthName = format(histDate, 'MMMM yyyy', { locale: ptBR })
    const title = `Histórico - Escala de Trabalho - ${history.unidade} - ${monthName}`
    
    const snap = history.snapshot_data
    const dayCount = snap.daysCount || new Date(Number(year), Number(month), 0).getDate()
    const historyDays = Array.from({ length: dayCount }, (_, i) => new Date(Number(year), Number(month) - 1, i + 1))
    
    const daysHeader = historyDays.map(day => {
      const dayInitial = format(day, 'eee', { locale: ptBR }).charAt(0).toUpperCase()
      const isWeekend = getDay(day) === 0 || getDay(day) === 6
      const bgColor = isWeekend ? '#f9fafb' : 'transparent'
      return `
        <th style="width: 20px; text-align: center; border: 1px solid #ddd; font-size: 7px; padding: 2px; background-color: ${bgColor};">
          <div style="font-weight: bold; opacity: 0.6;">${dayInitial}</div>
          <div>${format(day, 'd')}</div>
        </th>
      `
    }).join('')
    
    const rows = (snap.employees || []).map((emp: any) => {
      const scheduleCells = historyDays.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd')
        const dayRecord = emp.schedule?.find((s: any) => s.date === dateStr)
        const working = dayRecord ? dayRecord.working : false
        const dobra = dayRecord ? dayRecord.dobra : false
        const startTime = dayRecord?.start_time
        const endTime = dayRecord?.end_time
        const symbol = dobra ? '2X' : (working ? 'T' : '')
        const timeStr = startTime && endTime ? `<div style="font-size: 6px; opacity: 0.7;">${startTime}-${endTime}</div>` : ''
        return `<td style="text-align: center; border: 1px solid #ddd; font-size: 10px; padding: 2px; background-color: ${working ? (dobra ? 'rgba(245, 158, 11, 0.1)' : 'rgba(56, 189, 248, 0.1)') : 'transparent'}; font-weight: ${working ? 'bold' : 'normal'}; color: ${dobra ? '#b45309' : '#000'};">${symbol}${timeStr}</td>`
      }).join('')
      
      return `
        <tr>
          <td style="border: 1px solid #ddd; padding: 4px; font-size: 9px; min-width: 100px;">
            <strong>${emp.nome}</strong><br/>
            <small style="color: #444;">${emp.escala} - ${emp.turno}</small>
          </td>
          ${scheduleCells}
        </tr>
      `
    }).join('')

    const html = `
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="text-align: left; padding: 4px; border: 1px solid #ddd; font-size: 10px;">Funcionário</th>
            ${daysHeader}
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <div style="margin-top: 15px; font-size: 9px; color: #666;">
        <strong>Legenda:</strong> [ T ] Trabalha | [ 2X ] Dobra de Turno | [ &nbsp;&nbsp; ] Folga
      </div>
    `
    printPDF(title, html, clinic)
  }

  function printReport() {
    const monthName = format(currentDate, 'MMMM yyyy', { locale: ptBR })
    const title = `Escala de Trabalho - ${unidadeFilter} - ${monthName}`
    
    // Header row with days
    const daysHeader = days.map(day => {
      const dayInitial = format(day, 'eee', { locale: ptBR }).charAt(0).toUpperCase()
      const isWeekend = getDay(day) === 0 || getDay(day) === 6
      const bgColor = isWeekend ? '#f9fafb' : 'transparent'
      return `
        <th style="width: 20px; text-align: center; border: 1px solid #ddd; font-size: 7px; padding: 2px; background-color: ${bgColor};">
          <div style="font-weight: bold; opacity: 0.6;">${dayInitial}</div>
          <div>${format(day, 'd')}</div>
        </th>
      `
    }).join('')
    
    // Employee rows
    const rows = activeEmployees.map(employee => {
      const shiftTime = employee.escala === '12x36' 
        ? (employee.turno === 'Noturno' ? '19:00h/07:00h' : '07:00h/19:00h')
        : (employee.escala === 'Mensalista' || employee.escala === '40h' ? '06:30/14:30' : '')

      const scheduleCells = days.map(day => {
        const { working, dobra, start_time, end_time } = getSchedule(employee, day) as any
        const symbol = dobra ? '2X' : (working ? 'T' : '')
        const timeStr = start_time && end_time ? `<div style="font-size: 6px; opacity: 0.7;">${start_time}-${end_time}</div>` : ''
        return `<td style="text-align: center; border: 1px solid #ddd; font-size: 10px; padding: 2px; background-color: ${working ? (dobra ? 'rgba(245, 158, 11, 0.1)' : 'rgba(56, 189, 248, 0.1)') : 'transparent'}; font-weight: ${working ? 'bold' : 'normal'}; color: ${dobra ? '#b45309' : '#000'};">${symbol}${timeStr}</td>`
      }).join('')
      
      return `
        <tr>
          <td style="border: 1px solid #ddd; padding: 4px; font-size: 9px; min-width: 100px;">
            <strong>${employee.nome}</strong><br/>
            <small style="color: #444;">${employee.escala} - ${employee.turno || 'Diurno'}</small><br/>
            <small style="color: #666; font-size: 8px;">Horário: ${shiftTime}</small>
          </td>
          ${scheduleCells}
        </tr>
      `
    }).join('')

    const html = `
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="text-align: left; padding: 4px; border: 1px solid #ddd; font-size: 10px;">Funcionário</th>
            ${daysHeader}
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <div style="margin-top: 15px; font-size: 9px; color: #666;">
        <strong>Legenda:</strong> [ T ] Trabalha | [ 2X ] Dobra de Turno | [ &nbsp;&nbsp; ] Folga
      </div>
    `

    printPDF(title, html, clinic)
  }

  return (
    <div>
      <PageHeader
        title="Escalas de Trabalho"
        description="Visualize e edite as escalas (clique no dia para alternar)"
      >
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setHistoryDialogOpen(true)} className="gap-2 text-indigo-600 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-700">
              <History className="h-4 w-4" /> Históricos
            </Button>
            <Button variant="outline" onClick={saveSnapshot} className="gap-2 text-emerald-600 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-700" title="Salvar um histórico permanente (foto) do mês">
              <Save className="h-4 w-4" /> Salvar Histórico
            </Button>
            <Button variant="outline" onClick={printReport} className="gap-2">
              <FileText className="h-4 w-4" /> PDF
            </Button>
            <Button 
              variant={isManualMode ? "default" : "outline"} 
              size="sm" 
              onClick={() => setIsManualMode(!isManualMode)}
              className={isManualMode ? "bg-amber-600 hover:bg-amber-700 text-white" : "text-amber-600 hover:text-amber-700"}
            >
              {isManualMode ? "Modo Manual Ativo" : "Ativar Modo Manual"}
            </Button>
            <Button variant="outline" onClick={clearMonthExceptions} className="gap-2 text-destructive hover:text-destructive">
              Zerar/Limpar Tudo
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Select value={unidadeFilter} onChange={(e) => setUnidadeFilter(e.target.value as typeof unidadeFilter)} className="w-[150px]">
              <option value="Vila Moraes">Vila Moraes</option>
              <option value="Jardim Matilde">Jardim Matilde</option>
            </Select>
            <Select value={turnoFilter} onChange={(e) => setTurnoFilter(e.target.value as typeof turnoFilter)} className="w-[120px]">
              <option value="todos">Todos</option>
              <option value="Diurno">Diurno</option>
              <option value="Noturno">Noturno</option>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center">
              {format(currentDate, 'MMMM yyyy', { locale: ptBR }).replace(/^\w/, c => c.toUpperCase())}
            </span>
            <Button variant="outline" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </PageHeader>

      <Card className="p-6">
        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : activeEmployees.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            Cadastre funcionários ativos para visualizar as escalas de trabalho.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 sticky left-0 bg-card min-w-[150px] z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Funcionário</th>
                  {days.map(day => (
                    <th
                      key={day.toISOString()}
                      className={`text-center p-1 min-w-[36px] border-l ${
                        getDay(day) === 0 || getDay(day) === 6 ? 'text-muted-foreground bg-muted/20' : ''
                      } ${!isSameMonth(day, currentDate) ? 'opacity-40' : ''}`}
                    >
                      <div className="text-[10px] uppercase font-bold opacity-50">
                        {format(day, 'eee', { locale: ptBR }).charAt(0)}
                      </div>
                      <div className="text-xs font-semibold">
                        {format(day, 'd')}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeEmployees.map(employee => (
                  <tr key={employee.id} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="p-2 sticky left-0 bg-card font-medium z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      <div className="flex flex-col">
                        <span className="line-clamp-1 text-xs">{employee.nome}</span>
                        <div className="flex flex-wrap gap-1 items-center mt-1">
                          <span className="text-[9px] text-muted-foreground font-medium uppercase">{employee.escala}</span>
                          <span className={`text-[9px] px-1 rounded ${employee.turno === 'Noturno' ? 'bg-slate-800 text-white' : 'bg-amber-100 text-amber-900 font-bold'}`}>
                            {employee.turno === 'Noturno' ? 'NOT' : 'DIU'}
                          </span>
                          <span className="text-[9px] text-primary/70 font-semibold border px-1 rounded bg-primary/5">
                            {employee.escala === '12x36' 
                              ? (employee.turno === 'Noturno' ? '19h-07h' : '07h-19h')
                              : (employee.escala === 'Mensalista' || employee.escala === '40h' ? '06:30-14:30' : '')}
                          </span>
                          {employee.is_pro_labore && (
                            <span className="text-[9px] text-emerald-600 font-bold border border-emerald-200 px-1 rounded bg-emerald-50">PRO-LABORE</span>
                          )}
                          {employee.escala === '12x36' && (
                            <button 
                              onClick={() => invertCycle12x36(employee)}
                              title="Inverter Ciclo (A/B)"
                              className="ml-auto p-0.5 hover:bg-muted rounded text-primary transition-colors"
                            >
                              <div className="text-[10px] underline decoration-primary/30">Inverter</div>
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                    {days.map(day => {
                      const schedule = getSchedule(employee, day) as any
                      const { working, dobra, start_time, end_time } = schedule
                      const isException = exceptions.some(ex => ex.employee_id === employee.id && ex.date === format(day, 'yyyy-MM-dd'))
                      
                      return (
                        <td key={day.toISOString()} className="text-center p-0">
                          <button
                            onClick={() => toggleDay(employee, day)}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              handleOpenTimeDialog(employee, day)
                            }}
                            title={`${dobra ? 'Dobra' : (working ? 'Trabalha' : 'Folga')} - Clique esquerdo alternar, Direito p/ Horário`}
                            className={`w-full h-10 flex flex-col items-center justify-center transition-all relative ${
                              dobra
                                ? 'bg-amber-100 text-amber-700 font-bold hover:bg-amber-200'
                                : working
                                  ? 'bg-primary/10 text-primary font-bold hover:bg-primary/20'
                                  : 'bg-transparent text-muted-foreground hover:bg-muted'
                            } ${isException ? 'ring-1 ring-inset ring-amber-400' : ''}`}
                          >
                            <span className="text-xs">{dobra ? '2X' : (working ? 'T' : '—')}</span>
                            {working && start_time && (
                              <span className="text-[7px] font-normal leading-none mt-0.5 opacity-70">
                                {start_time}-{end_time}
                              </span>
                            )}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-4 text-xs items-center text-muted-foreground">
          <div className="flex items-center gap-1"><div className="w-3 h-3 bg-primary/10 rounded border border-primary/20 flex items-center justify-center text-[8px] font-bold text-primary">T</div> Trabalha</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 bg-amber-100 rounded border border-amber-300 flex items-center justify-center text-[8px] font-bold text-amber-700">2X</div> Dobra</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 bg-transparent border rounded flex items-center justify-center text-[8px]">—</div> Folga</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 border border-amber-400 rounded"></div> Editado manualmente</div>
          <div className="ml-auto italic font-medium text-amber-600 animate-pulse">💡 Dica: Clique com o botão direito para definir horários específicos</div>
        </div>
      </Card>

      <Dialog open={timeDialogOpen} onOpenChange={setTimeDialogOpen}>
        <DialogHeader>
          <DialogTitle>Definir Horário Manual</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {selectedCell?.employee.nome} - {selectedCell?.day && format(selectedCell.day, 'dd/MM/yyyy')}
          </p>
        </DialogHeader>
        <DialogContent className="max-w-xs">
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>Entrada</Label>
              <Input 
                type="time" 
                value={manualTimes.start} 
                onChange={(e) => setManualTimes({ ...manualTimes, start: e.target.value })} 
              />
            </div>
            <div className="space-y-2">
              <Label>Saída</Label>
              <Input 
                type="time" 
                value={manualTimes.end} 
                onChange={(e) => setManualTimes({ ...manualTimes, end: e.target.value })} 
              />
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setTimeDialogOpen(false)}>Cancelar</Button>
          <Button onClick={saveManualTimes}>Salvar Horário</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogHeader>
          <DialogTitle>Históricos de Escalas Salvos</DialogTitle>
          <DialogClose onClose={() => setHistoryDialogOpen(false)} />
        </DialogHeader>
        <DialogContent className="max-w-2xl">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md">
              Os históricos são "fotografias" das escalas salvas em um momento específico, garantindo que alterações vindouras nos funcionários (como troca de escala ou demissões) não alterem os registros passados.
            </p>
            {loadingHistories ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : histories.length === 0 ? (
              <div className="text-center py-8 text-neutral-500 text-sm">Nenhum histórico salvo ainda.</div>
            ) : (
              <div className="border rounded-md divide-y max-h-[60vh] overflow-y-auto">
                {histories.sort((a, b) => b.month.localeCompare(a.month)).map(hist => {
                  const [y, m] = hist.month.split('-')
                  const dt = new Date(Number(y), Number(m) - 1, 1)
                  return (
                    <div key={hist.id} className="p-3 flex items-center justify-between hover:bg-muted/30">
                      <div>
                        <div className="font-semibold capitalize text-sm">{format(dt, 'MMMM yyyy', { locale: ptBR })}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Unidade: {hist.unidade} • {hist.snapshot_data?.employees?.length || 0} funcionários</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => printHistory(hist)}>
                          <FileText className="h-3 w-3" /> Imprimir
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-50 hover:text-red-600" onClick={() => {
                          if (confirm('Tem certeza que deseja excluir permanentemente este histórico?')) removeHistory(hist.id)
                        }}>
                          Excluir
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
