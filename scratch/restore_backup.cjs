const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const SUPABASE_URL = 'https://aeaqqhblkhiqegjubszj.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Defina a variável SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
})

const BACKUP_FILE = 'G:/Meu Drive/Novo Horizonte - Casa dos Idosos/SISTEMA GERIATICARE/backup_osneiapp_2026-06-01.json'

// Ordem de restauração respeitando FKs
const RESTORE_ORDER = [
  'company_info',
  'transaction_categories',
  'bank_accounts',
  'entities',
  'patients',
  'employees',
  'contracts',
  'medications',
  'products',
  'bills',
  'incomes',
  'invoices',
  'payrolls',
  'bank_transactions',
  'schedule_exceptions',
  'appointments',
  'vacations',
  'terminations',
  'curriculums',
]

async function upsertTable(tableName, records) {
  if (!records || records.length === 0) {
    console.log(`⏭️  ${tableName}: vazio, pulando`)
    return
  }

  // Normaliza employees: dataAdmissao → data_admissao
  if (tableName === 'employees') {
    records = records.map(r => {
      const { dataAdmissao, ...rest } = r
      return { ...rest, data_admissao: dataAdmissao || r.data_admissao || null }
    })
  }

  // Insere em lotes de 100
  const BATCH = 100
  let inserted = 0
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH)
    const { error } = await supabase
      .from(tableName)
      .upsert(batch, { onConflict: 'id', ignoreDuplicates: false })
    if (error) {
      console.error(`❌ ${tableName} [lote ${i}-${i+BATCH}]:`, error.message)
    } else {
      inserted += batch.length
    }
  }
  console.log(`✅ ${tableName}: ${inserted}/${records.length} registros restaurados`)
}

async function main() {
  console.log('📂 Lendo backup de 01/06/2026...')
  const raw = fs.readFileSync(BACKUP_FILE, 'utf8')
  const backup = JSON.parse(raw)

  console.log('\n🚀 Iniciando restauração...\n')

  for (const table of RESTORE_ORDER) {
    if (backup[table] !== undefined) {
      const data = Array.isArray(backup[table]) ? backup[table] : [backup[table]]
      await upsertTable(table, data)
    } else {
      console.log(`⚠️  ${table}: não encontrado no backup`)
    }
  }

  console.log('\n✅ Restauração concluída!')

  // Verificação final
  console.log('\n📊 Contagem final:')
  for (const table of RESTORE_ORDER) {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true })
    console.log(`   ${table}: ${count ?? '?'}`)
  }
}

main().catch(e => { console.error('Erro fatal:', e); process.exit(1) })
