export const WORK_UNIT_NAME = 'Jardim Matilde'
export const LEGACY_WORK_UNIT_NAME = 'Ouro Verde'

export type WorkUnit = typeof WORK_UNIT_NAME | typeof LEGACY_WORK_UNIT_NAME

export function normalizeWorkUnit(unit?: string | null) {
  if (!unit || unit === LEGACY_WORK_UNIT_NAME) return WORK_UNIT_NAME
  return unit
}

export function matchesWorkUnit(unit: string | undefined | null, selectedUnit: string) {
  return selectedUnit === 'todos' || selectedUnit === 'all' || normalizeWorkUnit(unit) === selectedUnit
}
