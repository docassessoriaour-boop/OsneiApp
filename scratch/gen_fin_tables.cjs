// Gera SQL correto para bills, incomes, invoices, payrolls, terminations
const fs = require('fs');
const BACKUP = 'G:/Meu Drive/Novo Horizonte - Casa dos Idosos/SISTEMA GERIATICARE/backup_osneiapp_2026-06-01.json';
const backup = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));

function sqlVal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return "'" + JSON.stringify(v).replace(/'/g, "''") + "'";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

// ============ BILLS ============
// Colunas reais: id,descricao,categoria,category_id,valor,vencimento,status,payment_date,
//               bank_account_id,bank_transaction_id,destination_account_id,termination_id,payroll_id,created_at
// Backup keys: id,descricao,categoria,valor,vencimento,status,created_at,category_id,payment_date,
//              bank_account_id,bank_transaction_id,destination_bank_account_id,termination_id,payroll_id
const BILLS_VALID = ['id','descricao','categoria','category_id','valor','vencimento','status','payment_date',
  'bank_account_id','bank_transaction_id','destination_account_id','termination_id','payroll_id','created_at'];
const billLines = (backup.bills||[]).map(r => {
  const mapped = {
    id: r.id,
    descricao: r.descricao,
    categoria: r.categoria,
    category_id: r.category_id,
    valor: r.valor,
    vencimento: r.vencimento,
    status: r.status,
    payment_date: r.payment_date,
    bank_account_id: r.bank_account_id,
    bank_transaction_id: r.bank_transaction_id,
    destination_account_id: r.destination_bank_account_id, // renamed
    termination_id: r.termination_id,
    payroll_id: r.payroll_id,
    created_at: r.created_at
  };
  const entries = Object.entries(mapped).filter(([,v]) => v !== null && v !== undefined);
  if (!entries.length) return null;
  const cols = entries.map(([c]) => c);
  const vals = entries.map(([,v]) => sqlVal(v));
  return `INSERT INTO bills (${cols.join(',')}) VALUES (${vals.join(',')}) ON CONFLICT (id) DO NOTHING;`;
}).filter(Boolean);
// Salva em chunks de 25
for (let i=0;i<billLines.length;i+=25){
  const n=String(Math.floor(i/25)+1).padStart(2,'0');
  fs.writeFileSync(`scratch/fix3_bills_c${n}.sql`, billLines.slice(i,i+25).join('\n'));
}
console.log(`bills: ${billLines.length} linhas em ${Math.ceil(billLines.length/25)} chunks`);

// ============ INCOMES ============
// Vou verificar com columns check
const incomeLines = (backup.incomes||[]).map(r => {
  const mapped = {
    id: r.id,
    descricao: r.descricao,
    categoria: r.categoria,
    category_id: r.category_id,
    valor: r.valor,
    vencimento: r.vencimento,
    status: r.status,
    payment_date: r.payment_date,
    bank_account_id: r.bank_account_id,
    bank_transaction_id: r.bank_transaction_id,
    invoice_id: r.invoice_id,
    paid_by: r.paid_by,
    paid_by_phone: r.paid_by_phone,
    paid_by_document: r.paid_by_document,
    created_at: r.created_at
  };
  const entries = Object.entries(mapped).filter(([,v]) => v !== null && v !== undefined);
  const cols = entries.map(([c]) => c);
  const vals = entries.map(([,v]) => sqlVal(v));
  return `INSERT INTO incomes (${cols.join(',')}) VALUES (${vals.join(',')}) ON CONFLICT (id) DO NOTHING;`;
});
for (let i=0;i<incomeLines.length;i+=25){
  const n=String(Math.floor(i/25)+1).padStart(2,'0');
  fs.writeFileSync(`scratch/fix3_incomes_c${n}.sql`, incomeLines.slice(i,i+25).join('\n'));
}
console.log(`incomes: ${incomeLines.length} linhas em ${Math.ceil(incomeLines.length/25)} chunks`);

// ============ PAYROLLS ============
const payLines = (backup.payrolls||[]).map(r => {
  const mapped = {
    id: r.id,
    funcionario_id: r.funcionarioId,
    funcionario_nome: r.funcionarioNome,
    cargo: r.cargo,
    salario_bruto: r.salarioBruto,
    descontos: r.descontos,
    salario_liquido: r.salarioLiquido,
    mes_referencia: r.mesReferencia,
    status: r.status,
    periodo_inicio: r.periodoInicio,
    periodo_fim: r.periodoFim,
    adicionais: r.adicionais,
    tipo_periodo: r.tipo_periodo,
    observacoes: r.observacoes,
    created_at: r.created_at
  };
  const entries = Object.entries(mapped).filter(([,v]) => v !== null && v !== undefined);
  const cols = entries.map(([c]) => c);
  const vals = entries.map(([,v]) => sqlVal(v));
  return `INSERT INTO payrolls (${cols.join(',')}) VALUES (${vals.join(',')}) ON CONFLICT (id) DO NOTHING;`;
});
fs.writeFileSync('scratch/fix3_payrolls.sql', payLines.join('\n'));
console.log(`payrolls: ${payLines.length}`);

// ============ TERMINATIONS ============
const termLines = (backup.terminations||[]).map(r => {
  const mapped = {
    id: r.id,
    funcionario_id: r.funcionarioId,
    funcionario_nome: r.funcionarioNome,
    cpf: r.cpf,
    cargo: r.cargo,
    salario_base: r.salarioBase,
    data_admissao: r.dataAdmissao,
    data_demissao: r.dataDemissao,
    tipo_rescisao: r.tipoRescisao,
    valor_liquido: r.valorLiquido,
    valor_fgts: r.valorFgts,
    valor_total: r.valorTotal,
    status: r.status,
    details: r.details,
    created_at: r.created_at
  };
  const entries = Object.entries(mapped).filter(([,v]) => v !== null && v !== undefined);
  const cols = entries.map(([c]) => c);
  const vals = entries.map(([,v]) => sqlVal(v));
  return `INSERT INTO terminations (${cols.join(',')}) VALUES (${vals.join(',')}) ON CONFLICT (id) DO NOTHING;`;
});
fs.writeFileSync('scratch/fix3_terminations.sql', termLines.join('\n'));
console.log(`terminations: ${termLines.length}`);

// ============ INVOICES ============
// Verifica colunas do backup
const invSample = (backup.invoices||[])[0];
console.log('invoices backup keys:', Object.keys(invSample||{}).join(', '));
const invLines = (backup.invoices||[]).map(r => {
  const mapped = {
    id: r.id,
    patient_id: r.patient_id,
    client_name: r.client_name,
    client_document: r.client_document,
    date_issued: r.date_issued,
    due_date: r.due_date,
    total_amount: r.total_amount,
    status: r.status,
    items: r.items,
    income_id: r.income_id,
    payment_date: r.payment_date,
    bank_account_id: r.bank_account_id,
    bank_transaction_id: r.bank_transaction_id,
    paid_by: r.paid_by,
    paid_by_phone: r.paid_by_phone,
    paid_by_document: r.paid_by_document,
    created_at: r.created_at
  };
  const entries = Object.entries(mapped).filter(([,v]) => v !== null && v !== undefined);
  const cols = entries.map(([c]) => c);
  const vals = entries.map(([,v]) => sqlVal(v));
  return `INSERT INTO invoices (${cols.join(',')}) VALUES (${vals.join(',')}) ON CONFLICT (id) DO NOTHING;`;
});
fs.writeFileSync('scratch/fix3_invoices.sql', invLines.join('\n'));
console.log(`invoices: ${invLines.length}`);

console.log('\n✅ SQLs de bills/incomes/payrolls/terminations/invoices gerados!');
