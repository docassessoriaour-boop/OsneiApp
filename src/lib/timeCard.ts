import { differenceInCalendarDays, getDay, parseISO } from 'date-fns'
import type { Employee } from './types'

export interface TimeCardEntry {
  id: string
  employee_id: string
  work_date: string
  entry_1?: string | null
  exit_1?: string | null
  entry_2?: string | null
  exit_2?: string | null
  status: 'trabalho' | 'falta' | 'folga' | 'ferias' | 'afastamento'
  notes?: string | null
  created_at?: string
  updated_at?: string
}

export type TimeCardCalculation = {
  workedMinutes: number
  expectedMinutes: number
  overtimeMinutes: number
  missingMinutes: number
  nightClockMinutes: number
  nightReducedMinutes: number
}

export function timeToMinutes(value?: string | null) {
  if (!value) return null
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

function normalizeInterval(start: number, end: number) {
  return { start, end: end <= start ? end + 1440 : end }
}

function overlap(start: number, end: number, windowStart: number, windowEnd: number) {
  return Math.max(0, Math.min(end, windowEnd) - Math.max(start, windowStart))
}

function intervalMinutes(startValue?: string | null, endValue?: string | null) {
  const start = timeToMinutes(startValue)
  const end = timeToMinutes(endValue)
  if (start === null || end === null) return 0
  const normalized = normalizeInterval(start, end)
  return normalized.end - normalized.start
}

function intervalNightMinutes(startValue?: string | null, endValue?: string | null, extendAfterFive = false) {
  const start = timeToMinutes(startValue)
  const end = timeToMinutes(endValue)
  if (start === null || end === null) return 0
  const normalized = normalizeInterval(start, end)
  let minutes = overlap(normalized.start, normalized.end, 0, 300)
    + overlap(normalized.start, normalized.end, 1320, 1740)
    + overlap(normalized.start, normalized.end, 2760, 3180)

  const coversFullNight = normalized.start <= 1320 && normalized.end >= 1740
  if (extendAfterFive && coversFullNight) minutes += Math.max(0, normalized.end - 1740)
  return minutes
}

function extendedNightMinutes(entry?: Partial<TimeCardEntry>) {
  const firstStart = timeToMinutes(entry?.entry_1)
  if (firstStart === null || firstStart > 1320) return 0
  const pairs = [[entry?.entry_1, entry?.exit_1], [entry?.entry_2, entry?.exit_2]] as const
  const intervals = pairs.flatMap(([startValue, endValue]) => {
    const startRaw = timeToMinutes(startValue)
    const endRaw = timeToMinutes(endValue)
    if (startRaw === null || endRaw === null) return []
    let start = startRaw
    let end = endRaw <= startRaw ? endRaw + 1440 : endRaw
    if (start < firstStart) {
      start += 1440
      end += 1440
    }
    return [{ start, end }]
  })
  if (!intervals.some(interval => interval.end >= 1740)) return 0
  return intervals.reduce((sum, interval) => sum + overlap(interval.start, interval.end, 1740, 2880), 0)
}

export function getEmployeeShift(employee: Employee) {
  const start = employee.turno_inicio?.slice(0, 5)
    || (employee.turno === 'Noturno' ? '19:00' : employee.escala === '40h' || employee.escala === 'Mensalista' ? '06:30' : '07:00')
  const end = employee.turno_fim?.slice(0, 5)
    || (employee.turno === 'Noturno' ? '07:00' : employee.escala === '40h' || employee.escala === 'Mensalista' ? '14:30' : '19:00')
  return { start, end, minutes: intervalMinutes(start, end) }
}

export function isScheduledWorkday(employee: Employee, date: string) {
  const day = parseISO(date)
  if (employee.escala === '40h' || employee.escala === 'Mensalista') {
    const weekday = getDay(day)
    return weekday >= 1 && weekday <= 5
  }
  if (employee.escala === 'Manual') return false
  if (employee.escala === 'Dobra') return true
  const admission = employee.dataAdmissao
  if (!admission) return false
  return differenceInCalendarDays(day, parseISO(admission)) % 2 === 0
}

export function calculateTimeCardDay(
  employee: Employee,
  date: string,
  entry?: Partial<TimeCardEntry>,
  options: { reducedNightHour?: boolean; extendAfterFive?: boolean } = {}
): TimeCardCalculation {
  const status = entry?.status || 'trabalho'
  const workedMinutes = status === 'trabalho'
    ? intervalMinutes(entry?.entry_1, entry?.exit_1) + intervalMinutes(entry?.entry_2, entry?.exit_2)
    : 0
  const scheduled = isScheduledWorkday(employee, date)
  const expectedMinutes = status === 'ferias' || status === 'afastamento' || status === 'folga'
    ? 0
    : scheduled ? getEmployeeShift(employee).minutes : 0
  const nightClockMinutes = status === 'trabalho'
    ? intervalNightMinutes(entry?.entry_1, entry?.exit_1)
      + intervalNightMinutes(entry?.entry_2, entry?.exit_2)
      + (options.extendAfterFive ? extendedNightMinutes(entry) : 0)
    : 0
  const nightReducedMinutes = options.reducedNightHour === false
    ? nightClockMinutes
    : Math.round(nightClockMinutes * (60 / 52.5))

  return {
    workedMinutes,
    expectedMinutes,
    overtimeMinutes: Math.max(0, workedMinutes - expectedMinutes),
    missingMinutes: Math.max(0, expectedMinutes - workedMinutes),
    nightClockMinutes,
    nightReducedMinutes,
  }
}

export function formatMinutes(total: number, signed = false) {
  const prefix = signed && total > 0 ? '+' : total < 0 ? '-' : ''
  const absolute = Math.abs(Math.round(total))
  return `${prefix}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
}
