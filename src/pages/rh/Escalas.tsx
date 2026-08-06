import { useEffect, useState } from 'react'
import { useDb } from '@/hooks/useDb'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF } from '@/lib/pdf'
import { formatCurrency } from '@/lib/utils'
import { getCompanyWorkUnit, matchesWorkUnit } from '@/lib/units'
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

function getDefaultShiftTimes(employee: Employee) {
  if (employee.turno === 'Noturno') return { start: '19:00', end: '07:00' }
  if (employee.turno === 'Intermediário') return { start: '', end: '' }
  if (employee.escala === '40h' || employee.escala === 'Mensalista') return { start: '06:30', end: '14:30' }
  return { start: '07:00', end: '19:00' }
}

function normalizeTime(value?: string) {
  return value ? value.slice(0, 5) : ''
}

function getEmployeeShiftTime(employee: Employee) {
  const defaults = getDefaultShiftTimes(employee)
  const start = normalizeTime(employee.turno_inicio) || defaults.start
  const end = normalizeTime(employee.turno_fim) || defaults.end
  return start && end ? `${start}h/${end}h` : ''
}

type ScheduleCell = {
  working: boolean
  dobra: boolean
  tipo_lancamento?: ScheduleException['tipo_lancamento']
  start_time?: string
  end_time?: string
}

const optionalScheduleColumns = ['tipo_lancamento', 'is_dobra', 'start_time', 'end_time', 'horas_extras', 'valor_hora_extra', 'valor_hora_extra_total', 'observacoes'] as const

function getMissingOptionalScheduleColumn(error: any) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`
  return optionalScheduleColumns.find(column => message.includes(column))
}

function timeToMinutes(time?: string | null) {
  if (!time) return 0
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0
  return hours * 60 + minutes
}

function calculateHoursBetween(start?: string | null, end?: string | null) {
  const startMinutes = timeToMinutes(start)
  let endMinutes = timeToMinutes(end)
  if (!start || !end) return 0
  if (endMinutes <= startMinutes) endMinutes += 24 * 60
  return Number(((endMinutes - startMinutes) / 60).toFixed(2))
}

function calculateScheduledHours(employee: Employee) {
  const defaults = getDefaultShiftTimes(employee)
  const regularStart = normalizeTime(employee.turno_inicio) || defaults.start || '07:00'
  const regularEnd = normalizeTime(employee.turno_fim) || defaults.end || '17:00'
  return calculateHoursBetween(regularStart, regularEnd)
}

function calculateOvertimeHours(employee: Employee, start?: string | null, end?: string | null) {
  if (!start || !end) return 0

  const workedHours = calculateHoursBetween(start, end)
  const scheduledHours = calculateScheduledHours(employee)

  return Number(Math.max(0, workedHours - scheduledHours).toFixed(2))
}

function formatHoursToHHMM(hours: number) {
  const totalMinutes = Math.round((Number(hours) || 0) * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function getDefaultOvertimeHourlyValue(employee: Employee) {
  if (employee.valor_hora_extra && employee.valor_hora_extra > 0) return Number(employee.valor_hora_extra.toFixed(2))
  const salary = employee.salario || 0
  const plantaoCount = employee.salario_tipo === 'plantao_10_10h' || employee.salario_tipo === 'plantao_10_12h' ? 10 : employee.salario_tipo === 'plantao_15_12h' ? 15 : 0
  const plantaoHours = employee.salario_tipo === 'plantao_10_10h' ? 10 : 12
  const plantaoSalary = employee.salario_tipo === 'plantao_10_10h' ? employee.salario || 0 : (employee.valor_plantao_12h || 0) * plantaoCount
  const baseHourly = employee.salario_tipo === 'diaria'
    ? salary / 8
    : plantaoCount > 0
      ? plantaoSalary / (plantaoCount * plantaoHours)
      : salary / 220
  return Number((baseHourly * 1.5).toFixed(2))
}

function getBaseHourlyValue(employee: Employee) {
  const salary = employee.salario || 0
  if (employee.salario_tipo === 'diaria') return Number((salary / 8).toFixed(2))
  if (employee.salario_tipo?.startsWith('plantao_')) {
    const count = employee.salario_tipo === 'plantao_15_12h' ? 15 : 10
    const hours = employee.salario_tipo === 'plantao_10_10h' ? 10 : 12
    const packageSalary = employee.salario_tipo === 'plantao_10_10h'
      ? salary
      : (employee.valor_plantao_12h || 0) * count
    return Number((packageSalary / (count * hours || 220)).toFixed(2))
  }
  return Number((salary / 220).toFixed(2))
}

function getPackageExpectedHours(employee: Employee) {
  if (employee.salario_tipo === 'plantao_10_10h') return 100
  if (employee.salario_tipo === 'plantao_10_12h') return 120
  if (employee.salario_tipo === 'plantao_15_12h') return 180
  return 0
}

function getSalaryTypeLabel(employee: Employee) {
  if (employee.salario_tipo === 'diaria') return 'Diária'
  if (employee.salario_tipo === 'plantao_10_10h') return '10 plantões de 10h'
  if (employee.salario_tipo === 'plantao_10_12h') return '10 plantões de 12h'
  if (employee.salario_tipo === 'plantao_15_12h') return '15 plantões de 12h'
  return 'Mensal'
}

export default function Escalas() {
  const { data: rawEmployees, loading: loadingEmployees } = useDb<Employee>('employees')
  // Normaliza: DB retorna data_admissao (snake_case), código usa dataAdmissao (camelCase)
  const employees = rawEmployees.map((e: any) => ({ ...e, dataAdmissao: e.dataAdmissao || e.data_admissao || '' })) as Employee[]
  const { data: exceptions, insert, update, remove, loading: loadingExceptions } = useDb<ScheduleException>('schedule_exceptions')
  const { data: histories, insert: insertHistory, remove: removeHistory, loading: loadingHistories } = useDb<ScheduleHistory>('schedule_histories')
  
  const [clinic] = useClinic()
  const companyWorkUnit = getCompanyWorkUnit(clinic as any)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [unidadeFilter, setUnidadeFilter] = useState<string>(companyWorkUnit)
  const [turnoFilter, setTurnoFilter] = useState<'todos' | 'Diurno' | 'Noturno' | 'Intermediário'>('todos')
  const [isManualMode, setIsManualMode] = useState(false)
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [timeDialogOpen, setTimeDialogOpen] = useState(false)
  const [selectedCell, setSelectedCell] = useState<{ employee: Employee, day: Date } | null>(null)
  const [manualTimes, setManualTimes] = useState({ type: 'hora_extra' as ScheduleException['tipo_lancamento'], start: '', end: '', hourlyValue: 0, notes: '' })

  useEffect(() => {
    setUnidadeFilter(companyWorkUnit)
  }, [companyWorkUnit])

  const loading = loadingEmployees || loadingExceptions

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const dialogShouldCalculateOvertime = manualTimes.type === 'hora_extra' || manualTimes.type === 'trabalho'
  const dialogOvertimeHours = selectedCell && dialogShouldCalculateOvertime
    ? calculateOvertimeHours(selectedCell.employee, manualTimes.start, manualTimes.end)
    : 0

  const activeEmployees = employees.filter(e => 
    e.status === 'ativo' && 
    matchesWorkUnit(e.unidade, unidadeFilter, clinic as any) &&
    (turnoFilter === 'todos' || (e.turno || 'Diurno') === turnoFilter)
  ).sort((a, b) => a.nome.localeCompare(b.nome))

  // Generate schedule based on employee scale type + exceptions
  async function saveScheduleException(
    existing: ScheduleException | undefined,
    payload: Partial<ScheduleException>
  ) {
    const nextPayload: Partial<ScheduleException> = { ...payload }

    while (true) {
      try {
        if (existing) {
          await update(existing.id, nextPayload)
        } else {
          await insert(nextPayload as Omit<ScheduleException, 'id'>)
        }
        return
      } catch (error) {
        const missingColumn = getMissingOptionalScheduleColumn(error)
        if (!missingColumn || !(missingColumn in nextPayload)) throw error
        console.warn(`Coluna opcional ausente em schedule_exceptions: ${missingColumn}. Salvando sem ela.`)
        delete (nextPayload as any)[missingColumn]
      }
    }
  }

  function getBaseSchedule(employee: Employee, day: Date): ScheduleCell {
    if (isManualMode) return { working: false, dobra: false }

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

  function getSchedule(employee: Employee, day: Date): ScheduleCell {
    const dateStr = format(day, 'yyyy-MM-dd')
    const exception = exceptions.find(ex => ex.employee_id === employee.id && ex.date === dateStr)

    if (exception?.tipo_lancamento === 'hora_extra') {
      const base = getBaseSchedule(employee, day)
      return {
        ...base,
        tipo_lancamento: 'hora_extra',
        start_time: exception.start_time,
        end_time: exception.end_time
      }
    }

    if (exception) return {
      working: exception.is_working,
      dobra: !!exception.is_dobra,
      tipo_lancamento: exception.tipo_lancamento,
      start_time: exception.start_time,
      end_time: exception.end_time
    }

    return getBaseSchedule(employee, day)
  }

  async function handleOpenTimeDialog(employee: Employee, day: Date) {
    const dateStr = format(day, 'yyyy-MM-dd')
    const exception = exceptions.find(ex => ex.employee_id === employee.id && ex.date === dateStr)
    
    setSelectedCell({ employee, day })
    setManualTimes({
      type: exception?.tipo_lancamento || 'hora_extra',
      start: exception?.start_time || '',
      end: exception?.end_time || '',
      hourlyValue: (exception as any)?.valor_hora_extra || getDefaultOvertimeHourlyValue(employee),
      notes: (exception as any)?.observacoes || ''
    })
    setTimeDialogOpen(true)
  }

  async function saveManualTimes() {
    if (!selectedCell) return
    const { employee, day } = selectedCell
    const dateStr = format(day, 'yyyy-MM-dd')
    const exception = exceptions.find(ex => ex.employee_id === employee.id && ex.date === dateStr)
    const tipoLancamento = manualTimes.type || 'hora_extra'
    const shouldCalculateOvertime = tipoLancamento === 'hora_extra' || tipoLancamento === 'trabalho'
    const horasExtras = shouldCalculateOvertime ? calculateOvertimeHours(employee, manualTimes.start, manualTimes.end) : 0
    const valorTotal = Number((horasExtras * (manualTimes.hourlyValue || 0)).toFixed(2))
    const tipoLancamentoFinal: ScheduleException['tipo_lancamento'] =
      tipoLancamento === 'trabalho' && horasExtras > 0 ? 'hora_extra' : tipoLancamento

    if (tipoLancamento !== 'falta' && (!manualTimes.start || !manualTimes.end)) {
      alert('Informe entrada e saída válidas.')
      return
    }
    if (tipoLancamento === 'hora_extra' && horasExtras <= 0) {
      alert('Informe horários válidos para calcular a hora extra.')
      return
    }

    try {
      const payload = {
        start_time: manualTimes.start || null,
        end_time: manualTimes.end || null,
        is_working: tipoLancamentoFinal !== 'falta',
        is_dobra: tipoLancamentoFinal === 'plantao_12h',
        tipo_lancamento: tipoLancamentoFinal,
        horas_extras: horasExtras,
        valor_hora_extra: manualTimes.hourlyValue || 0,
        valor_hora_extra_total: valorTotal,
        observacoes: manualTimes.notes || null
      }

      if (exception) {
        await saveScheduleException(exception, payload)
      } else {
        await saveScheduleException(undefined, {
          employee_id: employee.id,
          date: dateStr,
          ...payload
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
    } else if (current.working && !current.dobra && current.tipo_lancamento !== 'plantao_12h') {
      nextWorking = true;
      nextDobra = true;
    } else {
      nextWorking = false;
      nextDobra = false;
    }
    const tipoLancamento: ScheduleException['tipo_lancamento'] = !nextWorking ? 'falta' : nextDobra ? 'plantao_12h' : 'trabalho'

    try {
      if (exception) {
        // Update existing exception
        await saveScheduleException(exception, { is_working: nextWorking, is_dobra: nextDobra, tipo_lancamento: tipoLancamento })
      } else {
        // Create new exception
        await saveScheduleException(undefined, {
          employee_id: employee.id,
          date: dateStr,
          is_working: nextWorking,
          is_dobra: nextDobra,
          tipo_lancamento: tipoLancamento
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
          await saveScheduleException(exception, { is_working: !current.working, is_dobra: false })
        } else {
          await saveScheduleException(undefined, {
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
            const { working, dobra, tipo_lancamento, start_time, end_time } = getSchedule(emp, day)
            return {
              date: format(day, 'yyyy-MM-dd'),
              working,
              dobra,
              tipo_lancamento,
              start_time,
              end_time
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
        <th style="width: 16px; text-align: center; border: 1px solid #ddd; font-size: 6px; padding: 1px; background-color: ${bgColor}; line-height: 1.05;">
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
        const symbol = dayRecord?.tipo_lancamento === 'hora_extra' ? 'HE' : dayRecord?.tipo_lancamento === 'plantao_12h' || dobra ? 'P12' : dayRecord?.tipo_lancamento === 'falta' ? 'F' : (working ? 'T' : '')
        const timeStr = startTime && endTime ? `<div style="font-size: 6px; opacity: 0.7;">${startTime}-${endTime}</div>` : ''
        return `<td style="text-align: center; border: 1px solid #ddd; font-size: 8px; padding: 1px; background-color: ${dayRecord?.tipo_lancamento === 'hora_extra' ? 'rgba(34, 197, 94, 0.12)' : working ? (dobra ? 'rgba(245, 158, 11, 0.1)' : 'rgba(56, 189, 248, 0.1)') : 'transparent'}; font-weight: ${working || dayRecord?.tipo_lancamento === 'hora_extra' ? 'bold' : 'normal'}; color: ${dayRecord?.tipo_lancamento === 'hora_extra' ? '#15803d' : dobra ? '#b45309' : '#000'}; line-height: 1.05;">${symbol}${timeStr}</td>`
      }).join('')
      
      return `
        <tr>
          <td style="border: 1px solid #ddd; padding: 2px 3px; font-size: 7px; min-width: 86px; line-height: 1.15;">
            <strong>${emp.nome}</strong><br/>
            <small style="color: #444;">${emp.escala} - ${emp.turno}</small>
          </td>
          ${scheduleCells}
        </tr>
      `
    }).join('')

    const html = `
      <table style="width: 100%; border-collapse: collapse; margin-top: 4px; table-layout: fixed;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="text-align: left; padding: 2px 3px; border: 1px solid #ddd; font-size: 7px; width: 96px;">Funcionário</th>
            ${daysHeader}
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <div class="footer" style="margin-top: 5px; font-size: 7px; color: #666;">
        <strong>Legenda:</strong> [ T ] Trabalha | [ P12 ] Plantão 12h | [ F ] Falta | [ &nbsp;&nbsp; ] Folga
      </div>
    `
    printPDF(title, html, clinic, {
      orientation: 'landscape',
      compactLayout: true,
      hideLogo: true,
      pageMargin: '0.35cm'
    })
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
        <th style="width: 16px; text-align: center; border: 1px solid #ddd; font-size: 6px; padding: 1px; background-color: ${bgColor}; line-height: 1.05;">
          <div style="font-weight: bold; opacity: 0.6;">${dayInitial}</div>
          <div>${format(day, 'd')}</div>
        </th>
      `
    }).join('')
    
    // Employee rows
    const rows = activeEmployees.map(employee => {
      const shiftTime = getEmployeeShiftTime(employee)

      const scheduleCells = days.map(day => {
        const { working, dobra, tipo_lancamento, start_time, end_time } = getSchedule(employee, day) as any
        const symbol = tipo_lancamento === 'hora_extra' ? 'HE' : tipo_lancamento === 'plantao_12h' || dobra ? 'P12' : tipo_lancamento === 'falta' ? 'F' : (working ? 'T' : '')
        const timeStr = start_time && end_time ? `<div style="font-size: 5px; opacity: 0.7;">${start_time}-${end_time}</div>` : ''
        return `<td style="text-align: center; border: 1px solid #ddd; font-size: 8px; padding: 1px; background-color: ${tipo_lancamento === 'hora_extra' ? 'rgba(34, 197, 94, 0.12)' : working ? (dobra ? 'rgba(245, 158, 11, 0.1)' : 'rgba(56, 189, 248, 0.1)') : 'transparent'}; font-weight: ${working || tipo_lancamento === 'hora_extra' ? 'bold' : 'normal'}; color: ${tipo_lancamento === 'hora_extra' ? '#15803d' : dobra ? '#b45309' : '#000'}; line-height: 1.05;">${symbol}${timeStr}</td>`
      }).join('')
      
      return `
        <tr>
          <td style="border: 1px solid #ddd; padding: 2px 3px; font-size: 7px; min-width: 86px; line-height: 1.15;">
            <strong>${employee.nome}</strong><br/>
            <small style="color: #444;">${employee.escala} - ${employee.turno || 'Diurno'}</small><br/>
            <small style="color: #666; font-size: 6px;">Horário: ${shiftTime}</small>
          </td>
          ${scheduleCells}
        </tr>
      `
    }).join('')

    const html = `
      <table style="width: 100%; border-collapse: collapse; margin-top: 4px; table-layout: fixed;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="text-align: left; padding: 2px 3px; border: 1px solid #ddd; font-size: 7px; width: 96px;">Funcionário</th>
            ${daysHeader}
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <div class="footer" style="margin-top: 5px; font-size: 7px; color: #666;">
        <strong>Legenda:</strong> [ T ] Trabalha | [ P12 ] Plantão 12h | [ F ] Falta | [ &nbsp;&nbsp; ] Folga
      </div>
    `

    printPDF(title, html, clinic, {
      orientation: 'landscape',
      compactLayout: true,
      hideLogo: true,
      pageMargin: '0.35cm'
    })
  }

  function printEmployeeFrequency(employee: Employee) {
    const monthName = format(currentDate, 'MMMM yyyy', { locale: ptBR }).replace(/^\w/, c => c.toUpperCase())
    const shiftHours = calculateScheduledHours(employee)
    const packageExpectedHours = getPackageExpectedHours(employee)
    const overtimeHourlyValue = getDefaultOvertimeHourlyValue(employee)
    const baseHourlyValue = getBaseHourlyValue(employee)
    const monthExceptions = exceptions
      .filter(ex => ex.employee_id === employee.id && ex.date >= format(monthStart, 'yyyy-MM-dd') && ex.date <= format(monthEnd, 'yyyy-MM-dd'))
      .sort((a, b) => a.date.localeCompare(b.date))

    const attendance = monthExceptions.filter(ex =>
      ex.tipo_lancamento !== 'falta' &&
      !!ex.start_time &&
      !!ex.end_time
    )

    const workedHoursTotal = Number(attendance.reduce((sum, ex) => sum + calculateHoursBetween(ex.start_time, ex.end_time), 0).toFixed(2))
    const expectedHoursTotal = packageExpectedHours || Number(attendance.reduce((sum) => sum + shiftHours, 0).toFixed(2))
    const balanceHours = Number((workedHoursTotal - expectedHoursTotal).toFixed(2))
    const overtimeHours = Math.max(0, balanceHours)
    const owedHours = Math.max(0, -balanceHours)
    const overtimeTotal = Number((overtimeHours * overtimeHourlyValue).toFixed(2))
    const owedTotal = Number((owedHours * baseHourlyValue).toFixed(2))

    const rows = attendance.map(ex => {
      const workedHours = calculateHoursBetween(ex.start_time, ex.end_time)
      const expected = packageExpectedHours ? 0 : shiftHours
      const balance = packageExpectedHours ? 0 : Number((workedHours - expected).toFixed(2))
      const balanceLabel = packageExpectedHours
        ? '-'
        : balance > 0
          ? `+${formatHoursToHHMM(balance)}`
          : balance < 0
            ? `-${formatHoursToHHMM(Math.abs(balance))}`
            : '00:00'
      const kind = ex.tipo_lancamento === 'plantao_12h'
        ? 'Plantão 12h'
        : ex.tipo_lancamento === 'hora_extra'
          ? 'Frequência / HE'
          : 'Frequência'

      return `
        <tr>
          <td>${format(ex.date ? parseISO(ex.date) : new Date(), 'dd/MM/yyyy')}</td>
          <td>${kind}</td>
          <td class="text-center">${ex.start_time || '-'}</td>
          <td class="text-center">${ex.end_time || '-'}</td>
          <td class="text-center">${formatHoursToHHMM(workedHours)}</td>
          <td class="text-center">${packageExpectedHours ? '-' : formatHoursToHHMM(expected)}</td>
          <td class="text-center">${balanceLabel}</td>
          <td>${ex.observacoes || ''}</td>
        </tr>
      `
    }).join('')

    const faltasRows = monthExceptions
      .filter(ex => ex.tipo_lancamento === 'falta')
      .map(ex => `
        <tr>
          <td>${format(parseISO(ex.date), 'dd/MM/yyyy')}</td>
          <td>Falta</td>
          <td class="text-center">-</td>
          <td class="text-center">-</td>
          <td class="text-center">00:00</td>
          <td class="text-center">${formatHoursToHHMM(shiftHours)}</td>
          <td class="text-center">-${formatHoursToHHMM(shiftHours)}</td>
          <td>${ex.observacoes || ''}</td>
        </tr>
      `).join('')

    const html = `
      <div style="font-size: 10pt; margin-bottom: 12px;">
        <p><strong>Funcionário:</strong> ${employee.nome}</p>
        <p><strong>Cargo:</strong> ${employee.cargo || '-'}</p>
        <p><strong>Competência:</strong> ${monthName}</p>
        <p><strong>Tipo de salário:</strong> ${getSalaryTypeLabel(employee)}</p>
        <p><strong>Horário base:</strong> ${getEmployeeShiftTime(employee)} (${formatHoursToHHMM(shiftHours)})</p>
        <p><strong>Valor hora extra:</strong> ${formatCurrency(overtimeHourlyValue)}</p>
      </div>

      <table style="font-size: 8.5pt;">
        <thead>
          <tr>
            <th>Data</th>
            <th>Lançamento</th>
            <th class="text-center">Entrada</th>
            <th class="text-center">Saída</th>
            <th class="text-center">Horas</th>
            <th class="text-center">Base</th>
            <th class="text-center">Saldo</th>
            <th>Observações</th>
          </tr>
        </thead>
        <tbody>
          ${rows || faltasRows ? `${rows}${faltasRows}` : '<tr><td colspan="8" class="text-center">Nenhuma frequência lançada no período.</td></tr>'}
        </tbody>
      </table>

      <div class="divider"></div>
      <table style="font-size: 9pt;">
        <tbody>
          <tr><td><strong>Horas previstas</strong></td><td class="text-right">${formatHoursToHHMM(expectedHoursTotal)}</td></tr>
          <tr><td><strong>Horas lançadas</strong></td><td class="text-right">${formatHoursToHHMM(workedHoursTotal)}</td></tr>
          <tr><td><strong>Horas extras a receber</strong></td><td class="text-right text-green">${formatHoursToHHMM(overtimeHours)} (${formatCurrency(overtimeTotal)})</td></tr>
          <tr><td><strong>Horas devidas</strong></td><td class="text-right text-red">${formatHoursToHHMM(owedHours)} (${formatCurrency(owedTotal)})</td></tr>
        </tbody>
      </table>

      <div style="margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 50px;">
        <div style="text-align: center;"><hr/><span>Responsável</span></div>
        <div style="text-align: center;"><hr/><span>Funcionário</span></div>
      </div>
    `

    printPDF(`Folha de Frequência - ${employee.nome} - ${monthName}`, html, clinic)
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
              <Select value={unidadeFilter} onChange={(e) => setUnidadeFilter(e.target.value as any)} className="w-40 bg-white">
                <option value={companyWorkUnit}>{companyWorkUnit}</option>
              </Select>
            <Select value={turnoFilter} onChange={(e) => setTurnoFilter(e.target.value as typeof turnoFilter)} className="w-[120px]">
              <option value="todos">Todos</option>
              <option value="Diurno">Diurno</option>
              <option value="Noturno">Noturno</option>
              <option value="Intermediário">Intermediário</option>
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
                          <span className={`text-[9px] px-1 rounded ${employee.turno === 'Noturno' ? 'bg-slate-800 text-white' : employee.turno === 'Intermediário' ? 'bg-sky-100 text-sky-900 font-bold' : 'bg-amber-100 text-amber-900 font-bold'}`}>
                            {employee.turno === 'Noturno' ? 'NOT' : employee.turno === 'Intermediário' ? 'INT' : 'DIU'}
                          </span>
                          <span className="text-[9px] text-primary/70 font-semibold border px-1 rounded bg-primary/5">
                            {getEmployeeShiftTime(employee).replace('h/', '-').replace(/h$/, '')}
                          </span>
                          {employee.is_pro_labore && (
                            <span className="text-[9px] text-emerald-600 font-bold border border-emerald-200 px-1 rounded bg-emerald-50">PRO-LABORE</span>
                          )}
                          <button
                            onClick={(event) => {
                              event.stopPropagation()
                              printEmployeeFrequency(employee)
                            }}
                            title="Imprimir folha de frequência individual"
                            className="ml-auto p-0.5 hover:bg-muted rounded text-primary transition-colors"
                          >
                            <FileText className="h-3 w-3" />
                          </button>
                          {employee.escala === '12x36' && (
                            <button 
                              onClick={() => invertCycle12x36(employee)}
                              title="Inverter Ciclo (A/B)"
                              className="p-0.5 hover:bg-muted rounded text-primary transition-colors"
                            >
                              <div className="text-[10px] underline decoration-primary/30">Inverter</div>
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                    {days.map(day => {
                      const schedule = getSchedule(employee, day) as any
                      const { working, dobra, tipo_lancamento, start_time, end_time } = schedule
                      const isException = exceptions.some(ex => ex.employee_id === employee.id && ex.date === format(day, 'yyyy-MM-dd'))
                      
                      return (
                        <td key={day.toISOString()} className="text-center p-0">
                          <button
                            onClick={() => toggleDay(employee, day)}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              handleOpenTimeDialog(employee, day)
                            }}
                            title={`${tipo_lancamento === 'hora_extra' ? 'Hora Extra' : tipo_lancamento === 'plantao_12h' ? 'Plantão 12h' : tipo_lancamento === 'falta' ? 'Falta' : (working ? 'Trabalha' : 'Folga')} - Clique esquerdo alternar, Direito p/ Frequência`}
                            className={`w-full h-10 flex flex-col items-center justify-center transition-all relative ${
                              tipo_lancamento === 'hora_extra'
                                ? 'bg-emerald-100 text-emerald-700 font-bold hover:bg-emerald-200'
                                : tipo_lancamento === 'plantao_12h' || dobra
                                ? 'bg-amber-100 text-amber-700 font-bold hover:bg-amber-200'
                                : working
                                  ? 'bg-primary/10 text-primary font-bold hover:bg-primary/20'
                                  : tipo_lancamento === 'falta'
                                    ? 'bg-red-50 text-red-700 font-bold hover:bg-red-100'
                                    : 'bg-transparent text-muted-foreground hover:bg-muted'
                            } ${isException ? 'ring-1 ring-inset ring-amber-400' : ''}`}
                          >
                            <span className="text-xs">{tipo_lancamento === 'hora_extra' ? 'HE' : tipo_lancamento === 'plantao_12h' || dobra ? 'P12' : tipo_lancamento === 'falta' ? 'F' : (working ? 'T' : '—')}</span>
                            {start_time && (
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
          <div className="flex items-center gap-1"><div className="w-5 h-3 bg-amber-100 rounded border border-amber-300 flex items-center justify-center text-[8px] font-bold text-amber-700">P12</div> Plantão 12h</div>
          <div className="flex items-center gap-1"><div className="w-5 h-3 bg-emerald-100 rounded border border-emerald-300 flex items-center justify-center text-[8px] font-bold text-emerald-700">HE</div> Hora extra</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-50 border border-red-200 rounded flex items-center justify-center text-[8px] font-bold text-red-700">F</div> Falta</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 bg-transparent border rounded flex items-center justify-center text-[8px]">—</div> Folga</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 border border-amber-400 rounded"></div> Editado manualmente</div>
          <div className="ml-auto italic font-medium text-amber-600 animate-pulse">Dica: clique com o botão direito para lançar frequência</div>
        </div>
      </Card>

      <Dialog open={timeDialogOpen} onOpenChange={setTimeDialogOpen}>
        <DialogHeader>
          <DialogTitle>Folha de Frequência</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {selectedCell?.employee.nome} - {selectedCell?.day && format(selectedCell.day, 'dd/MM/yyyy')}
          </p>
        </DialogHeader>
        <DialogContent className="max-w-xs">
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2 space-y-2">
              <Label>Tipo de lançamento</Label>
              <Select
                value={manualTimes.type || 'hora_extra'}
                onChange={(e) => setManualTimes({ ...manualTimes, type: e.target.value as ScheduleException['tipo_lancamento'] })}
              >
                <option value="trabalho">Trabalho / frequência</option>
                <option value="plantao_12h">Plantão 12h</option>
                <option value="hora_extra">Hora extra</option>
                <option value="falta">Falta</option>
              </Select>
            </div>
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
            <div className="space-y-2">
              <Label>{dialogShouldCalculateOvertime ? 'Horas Extras' : 'Horas Registradas'}</Label>
              <Input value={formatHoursToHHMM(dialogShouldCalculateOvertime ? dialogOvertimeHours : calculateHoursBetween(manualTimes.start, manualTimes.end))} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Valor por Hora</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={manualTimes.hourlyValue}
                onChange={(e) => setManualTimes({ ...manualTimes, hourlyValue: Number(e.target.value) })}
              />
            </div>
            <div className="col-span-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm flex items-center justify-between">
              <span>Total para folha</span>
              <strong>{formatCurrency(dialogOvertimeHours * (manualTimes.hourlyValue || 0))}</strong>
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Observações</Label>
              <Input
                value={manualTimes.notes}
                onChange={(e) => setManualTimes({ ...manualTimes, notes: e.target.value })}
                placeholder="Ex: entrada, saída, cobertura, falta ou atraso..."
              />
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setTimeDialogOpen(false)}>Cancelar</Button>
          <Button onClick={saveManualTimes}>Salvar Frequência</Button>
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

