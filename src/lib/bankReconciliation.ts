import type { BankAccount, BankTransaction, Bill, Income } from './types'

export type ReconciliationAccount = BankAccount & { reconciliation_account_id?: string | null }
export type StatementTransaction = BankTransaction & {
  statement_id?: string | null
  reconciliation_key?: string | null
  transfer_id?: string | null
  counterpart_account_id?: string | null
}
export const normalizeBankText = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
export const cents = (value: number) => Math.round(Number(value) * 100)

export function investmentMovement(tx: Pick<BankTransaction, 'descricao' | 'tipo'>, account?: BankAccount) {
  const text = normalizeBankText(tx.descricao)
  if (/\b(rendimentos?|rendimento|juros|iof|irrf|imposto|tarifa|tributo)\b/.test(text)) return null
  const kind = /\b(resgat\w*|regast\w*|resg)\b/.test(text) ? 'resgate'
    : /\b(aplic\w*|apl)\b/.test(text) ? 'aplicacao' : null
  if (!kind) return null
  const investment = account?.tipo === 'investimento' || account?.tipo === 'poupanca'
  const expected = kind === 'resgate' ? (investment ? 'debito' : 'credito') : (investment ? 'credito' : 'debito')
  return { kind, validDirection: tx.tipo === expected && !/\b(estorno|est\b|cancel\w*)/.test(text) }
}

export function suggestCounterpart(account: ReconciliationAccount | undefined, accounts: ReconciliationAccount[]) {
  if (!account) return ''
  const candidates = accounts.filter(a => a.id !== account.id && (account.tipo === 'investimento' || account.tipo === 'poupanca'
    ? a.tipo === 'corrente' : a.tipo === 'investimento' || a.tipo === 'poupanca'))
  if (account.reconciliation_account_id && candidates.some(a => a.id === account.reconciliation_account_id)) return account.reconciliation_account_id
  const reverse = candidates.filter(a => a.reconciliation_account_id === account.id)
  if (reverse.length === 1) return reverse[0].id
  const sameBank = candidates.filter(a => account.banco && normalizeBankText(a.banco) === normalizeBankText(account.banco))
  return sameBank.length === 1 ? sameBank[0].id
    : candidates.length === 1 && (!account.banco || !candidates[0].banco) ? candidates[0].id : ''
}

function validDate(year: string, month: string, day: string) {
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  const date = new Date(`${iso}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : ''
}

function parseDate(value: string) {
  const iso = value.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})/)
  if (iso) return validDate(iso[1], iso[2], iso[3])
  const br = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s.*)?$/)
  return br ? validDate(br[3].length === 2 ? `20${br[3]}` : br[3], br[2], br[1]) : ''
}

function parseAmount(value: string) {
  let text = value.replace(/R\$|\s/g, '').replace(/^\((.*)\)$/, '-$1')
  const debit = /D$/i.test(text)
  text = text.replace(/[CD]$/i, '')
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.')
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(text)) return NaN
  return Number(text) * (debit ? -1 : 1)
}

function csvRows(text: string, delimiter: string) {
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++ } else quoted = !quoted
    } else if (char === delimiter && !quoted) { row.push(field.trim()); field = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field.trim()); if (row.some(Boolean)) rows.push(row)
      row = []; field = ''
    } else field += char
  }
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row)
  return rows
}

export function parseBankStatement(text: string, format: 'ofx' | 'csv', accountId: string) {
  const transactions: StatementTransaction[] = []
  let ignored = 0
  const occurrences = new Map<string, number>()
  const add = (data: string, descricao: string, value: number, statementId = '') => {
    if (!data || !descricao || !Number.isFinite(value) || cents(value) === 0) { ignored++; return }
    const tipo = value < 0 ? 'debito' : 'credito'
    const signature = `${data}|${tipo}|${Math.abs(cents(value))}|${normalizeBankText(descricao)}`
    const occurrence = (occurrences.get(signature) || 0) + 1
    occurrences.set(signature, occurrence)
    transactions.push({ id: `temp-${crypto.randomUUID()}`, data, descricao, valor: Math.abs(value), tipo,
      origem: format, bank_account_id: accountId, statement_id: statementId || null,
      reconciliation_key: statementId ? `ofx:${statementId}` : `csv:${signature}|${occurrence}` })
  }
  if (format === 'ofx') {
    for (const match of text.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi)) {
      const get = (tag: string) => match[1].match(new RegExp(`<${tag}[^>]*>\\s*([^<\\r\\n]+)`, 'i'))?.[1]?.trim() || ''
      const description = [get('NAME'), get('MEMO')].filter(Boolean)
      add(parseDate(get('DTPOSTED')), [...new Set(description)].join(' — ') || 'Sem descrição', parseAmount(get('TRNAMT')), get('FITID'))
    }
  } else {
    const first = text.replace(/^\uFEFF/, '').split(/\r?\n/)[0]
    const delimiter = first.includes(';') ? ';' : first.includes('\t') ? '\t' : ','
    const rows = csvRows(text.replace(/^\uFEFF/, ''), delimiter)
    const header = (rows[0] || []).map(normalizeBankText)
    const dateIndex = header.findIndex(h => /^(data|date)(\b|_)/.test(h))
    const hasHeader = dateIndex >= 0
    const descriptionIndex = header.findIndex(h => /descri|historico|memo|lancamento/.test(h))
    const amountIndex = header.findIndex(h => /^(valor|amount)(\b|_)/.test(h))
    const creditIndex = header.findIndex(h => /^(credito|credit|entrada)(\b|_)/.test(h))
    const debitIndex = header.findIndex(h => /^(debito|debit|saida)(\b|_)/.test(h))
    const typeIndex = header.findIndex(h => /^(tipo|natureza|d\/c|c\/d)$/.test(h))
    for (const row of rows.slice(hasHeader ? 1 : 0)) {
      let amount = parseAmount(row[hasHeader && amountIndex >= 0 ? amountIndex : 2] || '')
      if (hasHeader && amountIndex < 0 && creditIndex >= 0 && debitIndex >= 0) {
        const credit = row[creditIndex] ? parseAmount(row[creditIndex]) : 0
        const debit = row[debitIndex] ? parseAmount(row[debitIndex]) : 0
        amount = credit && debit ? NaN : credit ? Math.abs(credit) : -Math.abs(debit)
      }
      const type = normalizeBankText(typeIndex >= 0 ? row[typeIndex] || '' : '')
      if (/^(d|debito|saida)$/.test(type)) amount = -Math.abs(amount)
      if (/^(c|credito|entrada)$/.test(type)) amount = Math.abs(amount)
      add(parseDate(row[hasHeader ? dateIndex : 0] || ''), row[hasHeader && descriptionIndex >= 0 ? descriptionIndex : 1] || '', amount)
    }
  }
  return { transactions, ignored }
}

export function sameStatementTransaction(a: StatementTransaction, b: StatementTransaction) {
  if (a.bank_account_id !== b.bank_account_id) return false
  if (a.reconciliation_key && b.reconciliation_key) return a.reconciliation_key === b.reconciliation_key
  if (a.statement_id && b.statement_id) return a.statement_id === b.statement_id
  return a.data === b.data && a.tipo === b.tipo && cents(a.valor) === cents(b.valor)
    && normalizeBankText(a.descricao) === normalizeBankText(b.descricao) && !b.transfer_id
}

export function matchingEntries(tx: BankTransaction, entries: (Income | Bill)[], days = 7, transactions: StatementTransaction[] = []) {
  return entries.filter(item => {
    const manual = transactions.find(t => t.id === item.bank_transaction_id && t.origem === 'manual' && !t.transfer_id
      && t.bank_account_id === tx.bank_account_id && t.tipo === tx.tipo && cents(t.valor) === cents(tx.valor))
    const settled = ['recebido', 'pago'].includes(item.status)
    return (settled ? !!manual : ['pendente', 'vencido'].includes(item.status) && !item.bank_transaction_id)
      && (!item.bank_account_id || item.bank_account_id === tx.bank_account_id)
      && cents(item.valor) === cents(tx.valor)
      && Math.abs(Date.parse(`${settled ? item.payment_date || item.vencimento : item.vencimento}T12:00:00Z`) - Date.parse(`${tx.data}T12:00:00Z`)) <= days * 86400000
  })
}

export function safeAutomaticMatch(tx: BankTransaction, entries: (Income | Bill)[], transactions: StatementTransaction[] = []) {
  const candidates = matchingEntries(tx, entries, 7, transactions)
  const words = normalizeBankText(tx.descricao).split(/[^a-z0-9]+/).filter(w => w.length >= 4)
  const identified = candidates.filter(item => words.some(w => normalizeBankText(item.descricao).split(/[^a-z0-9]+/).includes(w)
    && !['pagamento', 'recebimento', 'transferencia', 'banco', 'boleto', 'debito', 'credito', 'conta', 'valor',
      'mensalidade', 'fornecedor', 'cliente', 'paciente', 'cobranca', 'servicos', 'pagto', 'transf'].includes(w)))
  return candidates.length === 1 && identified.length === 1 ? candidates[0] : undefined
}
