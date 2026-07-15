export const NOVO_HORIZONTE_CNPJ = '56.956.061/0001-81'
export const NOVO_HORIZONTE_CNPJ_DIGITS = '56956061000181'
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
