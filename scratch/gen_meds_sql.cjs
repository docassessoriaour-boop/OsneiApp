// Script que lê o backup JSON e gera SQL sem embalagem_completa
// Uso: node scratch/gen_meds_sql.cjs
const fs = require('fs')
const BACKUP = 'G:/Meu Drive/Novo Horizonte - Casa dos Idosos/SISTEMA GERIATICARE/backup_osneiapp_2026-06-01.json'
const raw = fs.readFileSync(BACKUP, 'utf8')
const backup = JSON.parse(raw)

function sqlVal(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`
  return `'${String(v).replace(/'/g, "''")}'`
}

// Colunas válidas no banco para medications
const VALID_COLS = ['id','paciente_id','paciente_nome','medicamento','dosagem','horario','frequencia','observacoes','created_at','estoque_atual','estoque_minimo','qtd_por_dose','unidade_medida','tipo_escala','dias_semana']
const COL_MAP = { pacienteId: 'paciente_id', pacienteNome: 'paciente_nome' }

const meds = backup.medications || []
const lines = meds.map(rec => {
  // Renomeia colunas
  const r = {}
  for (const [k, v] of Object.entries(rec)) {
    const newKey = COL_MAP[k] || k
    if (VALID_COLS.includes(newKey)) r[newKey] = v
  }
  const cols = VALID_COLS.filter(c => r[c] !== undefined)
  const vals = cols.map(c => sqlVal(r[c]))
  return `INSERT INTO medications (${cols.join(',')}) VALUES (${vals.join(',')}) ON CONFLICT (id) DO NOTHING;`
})

// Divide em chunks de 25
for (let i = 0; i < lines.length; i += 25) {
  const n = String(Math.floor(i/25)+1).padStart(2,'0')
  const chunk = lines.slice(i, i+25).join('\n')
  fs.writeFileSync(`scratch/med_fixed_c${n}.sql`, chunk)
}
console.log(`✅ Gerado ${lines.length} registros em ${Math.ceil(lines.length/25)} chunks`)
