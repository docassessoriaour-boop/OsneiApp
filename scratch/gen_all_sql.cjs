// Gerador de SQL para todas as tabelas restantes
// Usa apenas colunas válidas do banco (sem embalagem_completa e similares)
const fs = require('fs')
const BACKUP = 'G:/Meu Drive/Novo Horizonte - Casa dos Idosos/SISTEMA GERIATICARE/backup_osneiapp_2026-06-01.json'
const backup = JSON.parse(fs.readFileSync(BACKUP, 'utf8'))

function sqlVal(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`
  return `'${String(v).replace(/'/g, "''")}'`
}

// Colunas válidas por tabela (somente as que existem no banco)
const VALID = {
  products: ['id','nome','tipo','category_id','estoque','unidade','fornecedor','fornecedor_id','estoque_minimo','custo_medio','ultimo_valor_comprado','created_at'],
  bills: ['id','descricao','categoria','category_id','valor','vencimento','status','payment_date','bank_account_id','bank_transaction_id','destination_account_id','termination_id','payroll_id','created_at'],
  incomes: ['id','descricao','categoria','category_id','valor','vencimento','status','invoice_id','payment_date','bank_account_id','bank_transaction_id','source_account_id','paid_by','paid_by_phone','paid_by_document','created_at'],
  invoices: ['id','descricao','valor','vencimento','status','created_at'],
  payrolls: ['id','funcionario_id','funcionario_nome','cargo','salario_bruto','descontos','salario_liquido','mes_referencia','status','periodo_inicio','periodo_fim','adicionais','tipo_periodo','observacoes','created_at'],
  schedule_exceptions: ['id','employee_id','date','is_working','is_dobra','start_time','end_time','created_at'],
  appointments: ['id','created_at'],
  vacations: ['id','created_at'],
  terminations: ['id','funcionario_id','funcionario_nome','cpf','cargo','salario_base','data_admissao','data_demissao','tipo_rescisao','valor_liquido','valor_fgts','valor_total','status','details','created_at'],
  curriculums: ['id','created_at'],
}

// Mapeamento camelCase → snake_case
const COL_MAP = {
  products: { fornecedorId: 'fornecedor_id', custoMedio: 'custo_medio', ultimoValorComprado: 'ultimo_valor_comprado', estoqueMinimo: 'estoque_minimo' },
  bills: { paymentDate: 'payment_date', bankAccountId: 'bank_account_id', bankTransactionId: 'bank_transaction_id', destinationAccountId: 'destination_account_id', terminationId: 'termination_id', payrollId: 'payroll_id' },
  incomes: { paymentDate: 'payment_date', bankAccountId: 'bank_account_id', bankTransactionId: 'bank_transaction_id', sourceAccountId: 'source_account_id', paidBy: 'paid_by', paidByPhone: 'paid_by_phone', paidByDocument: 'paid_by_document', invoiceId: 'invoice_id' },
  payrolls: { funcionarioId: 'funcionario_id', funcionarioNome: 'funcionario_nome', salarioBruto: 'salario_bruto', salarioLiquido: 'salario_liquido', mesReferencia: 'mes_referencia', periodoInicio: 'periodo_inicio', periodoFim: 'periodo_fim', tipoPeriodo: 'tipo_periodo' },
  schedule_exceptions: { employeeId: 'employee_id', isWorking: 'is_working', isDobra: 'is_dobra', startTime: 'start_time', endTime: 'end_time' },
  terminations: { funcionarioId: 'funcionario_id', funcionarioNome: 'funcionario_nome', salarioBase: 'salario_base', dataAdmissao: 'data_admissao', dataDemissao: 'data_demissao', tipoRescisao: 'tipo_rescisao', valorLiquido: 'valor_liquido', valorFgts: 'valor_fgts', valorTotal: 'valor_total' },
}

const TABLES = ['products','bills','incomes','invoices','payrolls','schedule_exceptions','appointments','vacations','terminations','curriculums']

for (const table of TABLES) {
  const records = backup[table]
  if (!records || !records.length) { console.log(`SKIP (vazio): ${table}`); continue }
  
  const validCols = VALID[table]
  const map = COL_MAP[table] || {}
  const lines = []

  for (const rec of records) {
    const r = {}
    for (const [k, v] of Object.entries(rec)) {
      const newKey = map[k] || k
      if (!validCols || validCols.includes(newKey)) r[newKey] = v
    }
    const cols = Object.keys(r)
    if (!cols.length) continue
    const vals = cols.map(c => sqlVal(r[c]))
    lines.push(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${vals.join(',')}) ON CONFLICT (id) DO NOTHING;`)
  }

  // Divide em chunks de 25
  for (let i = 0; i < lines.length; i += 25) {
    const n = String(Math.floor(i/25)+1).padStart(2,'0')
    fs.writeFileSync(`scratch/fix_${table}_c${n}.sql`, lines.slice(i,i+25).join('\n'))
  }
  console.log(`${table}: ${lines.length} registros → ${Math.ceil(lines.length/25)} chunks`)
}
console.log('\n✅ Todos os SQLs gerados!')
