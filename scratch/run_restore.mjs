// Script ESM que usa @supabase/supabase-js para executar arquivos SQL
// Uso: node scratch/run_restore.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'

const SUPABASE_URL = 'https://aeaqqhblkhiqegjubszj.supabase.co'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

if (!SERVICE_KEY) {
  console.error('❌  SUPABASE_SERVICE_KEY não definida! Use:')
  console.error('     $env:SUPABASE_SERVICE_KEY="<service_role_jwt>"; node scratch/run_restore.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
})

// Tabelas a restaurar (pula as já feitas)
const FILES = [
  'scratch/restore_medications.sql',
  'scratch/restore_products.sql',
  'scratch/restore_bills.sql',
  'scratch/restore_incomes.sql',
  'scratch/restore_invoices.sql',
  'scratch/restore_payrolls.sql',
  'scratch/restore_bank_transactions.sql',
  'scratch/restore_schedule_exceptions.sql',
  'scratch/restore_appointments.sql',
  'scratch/restore_vacations.sql',
  'scratch/restore_terminations.sql',
  'scratch/restore_curriculums.sql',
]

async function runSQL(sql) {
  const { data, error } = await supabase.rpc('exec_sql_batch', { sql_text: sql }).single()
  if (error) throw new Error(error.message)
  return data
}

// Alternativa: inserir linha por linha
async function runLines(file) {
  const sql = readFileSync(file, 'utf8')
  const lines = sql.split('\n').filter(l => l.trim() && l.trim().toUpperCase().startsWith('INSERT'))
  let ok = 0, fail = 0
  for (const line of lines) {
    const { error } = await supabase.rpc('exec_sql_line', { sql_text: line })
    if (error) {
      console.error(`  ERR: ${error.message.substring(0, 100)}`)
      fail++
    } else {
      ok++
    }
  }
  return { ok, fail }
}

for (const file of FILES) {
  if (!existsSync(file)) { console.log(`SKIP: ${file}`); continue }
  const sql = readFileSync(file, 'utf8').trim()
  const lines = sql.split('\n').filter(l => l.trim())
  console.log(`\n▶  ${file} (${lines.length} registros)`)
  // Executa em blocos de 20
  for (let i = 0; i < lines.length; i += 20) {
    const batch = lines.slice(i, i + 20).join('\n')
    const { error } = await supabase.from('_placeholder').select().limit(0) // warm up
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ query: batch })
    })
    process.stdout.write('.')
  }
  console.log(' ✅')
}

console.log('\n✅ Restauração concluída!')
