// Script que lê o backup JSON e gera SQL INSERT para restauração via Supabase MCP
const fs = require('fs')

const BACKUP_FILE = 'G:/Meu Drive/Novo Horizonte - Casa dos Idosos/SISTEMA GERIATICARE/backup_osneiapp_2026-06-01.json'

const raw = fs.readFileSync(BACKUP_FILE, 'utf8')
const backup = JSON.parse(raw)

function sqlVal(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`
  return `'${String(v).replace(/'/g, "''")}'`
}

function generateUpsert(table, records, conflictCol = 'id') {
  if (!records || records.length === 0) return ''
  
  // Mapeamento camelCase (backup) → snake_case (banco)
  const colMap = {
    patients: {
      telefoneResponsavel: 'telefone_responsavel',
      dataEntrada: 'data_entrada',
    },
    employees: {
      dataAdmissao: 'data_admissao',
    },
    medications: {
      pacienteId: 'paciente_id',
      pacienteNome: 'paciente_nome',
    },
    contracts: {
      pacienteId: 'paciente_id',
      pacienteNome: 'paciente_nome',
      dataInicio: 'data_inicio',
      dataFim: 'data_fim',
      valorExtra: 'valor_extra',
      descricaoExtra: 'descricao_extra',
    },
    terminations: {
      funcionarioId: 'funcionario_id',
      funcionarioNome: 'funcionario_nome',
      salarioBase: 'salario_base',
      dataAdmissao: 'data_admissao',
      dataDemissao: 'data_demissao',
      tipoRescisao: 'tipo_rescisao',
      valorLiquido: 'valor_liquido',
      valorFgts: 'valor_fgts',
      valorTotal: 'valor_total',
      dataCriacao: 'data_criacao',
    },
  }
  const sqls = []
  const map = colMap[table] || {}
  for (const rec of records) {
    // Renomeia colunas camelCase → snake_case conforme mapeamento
    let r = {}
    for (const [k, v] of Object.entries(rec)) {
      const newKey = map[k] || k
      r[newKey] = v
    }
    
    const cols = Object.keys(r)
    const vals = cols.map(c => sqlVal(r[c]))
    const updates = cols.filter(c => c !== conflictCol).map(c => `${c} = EXCLUDED.${c}`)
    
    sqls.push(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT (${conflictCol}) DO UPDATE SET ${updates.join(', ')};`
    )
  }
  return sqls.join('\n')
}

const ORDER = [
  ['company_info', 'id'],
  ['transaction_categories', 'id'],
  ['bank_accounts', 'id'],
  ['entities', 'id'],
  ['patients', 'id'],
  ['employees', 'id'],
  ['contracts', 'id'],
  ['medications', 'id'],
  ['products', 'id'],
  ['bills', 'id'],
  ['incomes', 'id'],
  ['invoices', 'id'],
  ['payrolls', 'id'],
  ['bank_transactions', 'id'],
  ['schedule_exceptions', 'id'],
  ['appointments', 'id'],
  ['vacations', 'id'],
  ['terminations', 'id'],
  ['curriculums', 'id'],
]

let allSql = '-- RESTAURAÇÃO DO BACKUP 2026-06-01\n-- Gerado automaticamente\n\n'

for (const [table, conflict] of ORDER) {
  const records = backup[table]
  if (!records) { console.log(`Sem dados: ${table}`); continue }
  const data = Array.isArray(records) ? records : [records]
  console.log(`${table}: ${data.length} registros`)
  const tableSql = generateUpsert(table, data, conflict)
  allSql += `\n-- === ${table.toUpperCase()} (${data.length} registros) ===\n`
  allSql += tableSql
  allSql += '\n'
  // Salva arquivo individual
  fs.writeFileSync(`scratch/restore_${table}.sql`, tableSql)
}

fs.writeFileSync('C:/Users/grupo/OneDrive/Documentos/OsneiApp/scratch/restore_data.sql', allSql)
console.log('\n✅ SQL gerado em scratch/restore_data.sql')
console.log('Tamanho:', (allSql.length / 1024).toFixed(1), 'KB')
