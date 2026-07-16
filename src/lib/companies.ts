export const DEMO_COMPANY_NAME = 'Residencial Vida Serena Demo'
export const DEMO_COMPANY_LEGAL_NAME = 'RESIDENCIAL VIDA SERENA DEMO LTDA'
export const DEMO_COMPANY_CNPJ = '00.000.000/0001-91'
export const DEMO_COMPANY_CNPJ_DIGITS = '00000000000191'
export const DEMO_COMPANY_ADDRESS = 'Rua das Flores, 100, Centro, Ourinhos, Sao Paulo, CEP 19.900-000'
export const DEMO_COMPANY_REPRESENTATIVE = 'Maria Helena Souza'
export const DEMO_COMPANY_REPRESENTATIVE_DOCS = 'RG 12.345.678-9 e CPF 123.456.789-09'
export const SELECTED_COMPANY_CNPJ_DIGITS_KEY = 'gom-selected-company-cnpj-digits-v1'

export function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

export function formatCnpj(value: string) {
  const digits = onlyDigits(value).slice(0, 14)
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}
