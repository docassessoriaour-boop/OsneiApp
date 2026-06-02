// Executa arquivos SQL via API REST do Supabase
const fs = require('fs')
const https = require('https')

const PROJECT_REF = 'aeaqqhblkhiqegjubszj'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

// Tabelas a executar na ordem correta
const FILES = [
  'scratch/restore_medications_1.sql',
  'scratch/restore_medications_2.sql',
  'scratch/restore_products_1.sql',
  'scratch/restore_products_2.sql',
  'scratch/restore_bills_1.sql',
  'scratch/restore_bills_2.sql',
  'scratch/restore_incomes_1.sql',
  'scratch/restore_incomes_2.sql',
  'scratch/restore_invoices.sql',
  'scratch/restore_payrolls.sql',
  'scratch/restore_schedule_exceptions_1.sql',
  'scratch/restore_schedule_exceptions_2.sql',
  'scratch/restore_appointments.sql',
  'scratch/restore_vacations.sql',
  'scratch/restore_terminations.sql',
  'scratch/restore_curriculums.sql',
]

async function executeSQL(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql })
    const options = {
      hostname: `${PROJECT_REF}.supabase.co`,
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
        'Content-Length': Buffer.byteLength(body),
      }
    }
    const req = https.request(options, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function main() {
  if (!SERVICE_KEY) {
    console.error('SUPABASE_SERVICE_KEY não definida!')
    process.exit(1)
  }

  for (const file of FILES) {
    if (!fs.existsSync(file)) {
      console.log(`SKIP (não existe): ${file}`)
      continue
    }
    const sql = fs.readFileSync(file, 'utf8').trim()
    if (!sql) { console.log(`SKIP (vazio): ${file}`); continue }
    
    process.stdout.write(`Executando ${file}... `)
    try {
      const res = await executeSQL(sql)
      if (res.status < 300) {
        console.log(`✅ OK (${res.status})`)
      } else {
        console.log(`❌ ERRO ${res.status}: ${res.body.substring(0, 200)}`)
      }
    } catch(e) {
      console.log(`❌ EXCEPTION: ${e.message}`)
    }
  }
  console.log('\n✅ Concluído!')
}

main()
