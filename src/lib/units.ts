import { LAR_SABEDORIA_CNPJ_DIGITS, NOVO_HORIZONTE_CNPJ_DIGITS, onlyDigits } from './companies'

export const NOVO_HORIZONTE_WORK_UNIT_NAME = 'Jardim Matilde'
export const LAR_SABEDORIA_WORK_UNIT_NAME = 'Ouro Verde'
export const WORK_UNIT_NAME = NOVO_HORIZONTE_WORK_UNIT_NAME
export const LEGACY_WORK_UNIT_NAME = LAR_SABEDORIA_WORK_UNIT_NAME

export type WorkUnit = typeof WORK_UNIT_NAME | typeof LEGACY_WORK_UNIT_NAME

type CompanyUnitConfig = { cnpj?: string | null, cnpj_digits?: string | null }

export function getCompanyWorkUnit(company?: CompanyUnitConfig | null) {
  const cnpjDigits = onlyDigits(company?.cnpj_digits || company?.cnpj || '')
  if (cnpjDigits === LAR_SABEDORIA_CNPJ_DIGITS) return LAR_SABEDORIA_WORK_UNIT_NAME
  if (cnpjDigits === NOVO_HORIZONTE_CNPJ_DIGITS) return NOVO_HORIZONTE_WORK_UNIT_NAME
  return NOVO_HORIZONTE_WORK_UNIT_NAME
}

export function normalizeWorkUnit(unit?: string | null, company?: CompanyUnitConfig | null) {
  const companyWorkUnit = getCompanyWorkUnit(company)
  if (!unit) return companyWorkUnit
  if (unit === LAR_SABEDORIA_WORK_UNIT_NAME && companyWorkUnit === NOVO_HORIZONTE_WORK_UNIT_NAME) return companyWorkUnit
  return unit
}

export function matchesWorkUnit(unit: string | undefined | null, selectedUnit: string, company?: CompanyUnitConfig | null) {
  return selectedUnit === 'todos' || selectedUnit === 'all' || normalizeWorkUnit(unit, company) === selectedUnit
}
