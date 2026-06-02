// Gerador final corrigido para todas tabelas pendentes
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

function genSQL(table, records, validCols, colMap) {
  const lines = [];
  for (const rec of records) {
    const r = {};
    for (const [k, v] of Object.entries(rec)) {
      const newKey = (colMap && colMap[k]) ? colMap[k] : k;
      if (!validCols || validCols.includes(newKey)) r[newKey] = v;
    }
    const cols = Object.keys(r).filter(c => r[c] !== undefined && r[c] !== null || validCols.includes(c));
    const validEntries = Object.entries(r).filter(([c]) => !validCols || validCols.includes(c));
    if (!validEntries.length) continue;
    const colNames = validEntries.map(([c]) => c);
    const vals = validEntries.map(([, v]) => sqlVal(v));
    lines.push(`INSERT INTO ${table} (${colNames.join(',')}) VALUES (${vals.join(',')}) ON CONFLICT (id) DO NOTHING;`);
  }
  return lines;
}

// ============ PRODUCTS (restantes, sem category_id para material) ============
// Insere os 95 products restantes (id 26-120) sem category_id FK
const allProds = backup.products || [];
const existingProdSQL = fs.existsSync('scratch/fix_products_c01.sql') ? 
  fs.readFileSync('scratch/fix_products_c01.sql','utf8') : '';
// Pega IDs já inseridos do chunk 01
const insertedProdIds = existingProdSQL.match(/VALUES \('([^']+)'/g)?.map(m => m.match(/'([^']+)'/)[1]) || [];
const remainingProds = allProds.filter(p => !insertedProdIds.includes(p.id));
const PROD_VALID = ['id','nome','tipo','estoque','unidade','fornecedor','estoque_minimo','created_at','custo_medio','fornecedor_id','ultimo_valor_comprado'];
const prodLines = remainingProds.map(p => {
  const vals = PROD_VALID.filter(c => p[c] !== undefined).map(c => `${c}=${sqlVal(p[c])}`);
  const cols = PROD_VALID.filter(c => p[c] !== undefined);
  const vvals = cols.map(c => sqlVal(p[c]));
  return `INSERT INTO products (${cols.join(',')}) VALUES (${vvals.join(',')}) ON CONFLICT (id) DO NOTHING;`;
});
// Salva em chunks de 30
for (let i = 0; i < prodLines.length; i += 30) {
  const n = String(Math.floor(i/30)+1).padStart(2,'0');
  fs.writeFileSync(`scratch/fix_prods_remain_c${n}.sql`, prodLines.slice(i,i+30).join('\n'));
}
console.log(`products restantes: ${prodLines.length} em ${Math.ceil(prodLines.length/30)} chunks`);

// ============ BILLS ============
const BILLS_VALID = ['id','descricao','categoria','category_id','valor','vencimento','status','payment_date','bank_account_id','bank_transaction_id','termination_id','payroll_id','created_at'];
const BILLS_MAP = { paymentDate:'payment_date', bankAccountId:'bank_account_id', bankTransactionId:'bank_transaction_id', terminationId:'termination_id', payrollId:'payroll_id', categoryId:'category_id' };
const billLines = genSQL('bills', backup.bills||[], BILLS_VALID, BILLS_MAP);
for (let i=0;i<billLines.length;i+=25){
  const n=String(Math.floor(i/25)+1).padStart(2,'0');
  fs.writeFileSync(`scratch/fix2_bills_c${n}.sql`, billLines.slice(i,i+25).join('\n'));
}
console.log(`bills: ${billLines.length} em ${Math.ceil(billLines.length/25)} chunks`);

// ============ INCOMES ============
const INCOMES_VALID = ['id','descricao','categoria','category_id','valor','vencimento','status','invoice_id','payment_date','bank_account_id','bank_transaction_id','paid_by','paid_by_phone','paid_by_document','created_at'];
const INCOMES_MAP = { paymentDate:'payment_date', bankAccountId:'bank_account_id', bankTransactionId:'bank_transaction_id', sourceAccountId:'source_account_id', paidBy:'paid_by', paidByPhone:'paid_by_phone', paidByDocument:'paid_by_document', invoiceId:'invoice_id', categoryId:'category_id' };
const incomeLines = genSQL('incomes', backup.incomes||[], INCOMES_VALID, INCOMES_MAP);
for (let i=0;i<incomeLines.length;i+=25){
  const n=String(Math.floor(i/25)+1).padStart(2,'0');
  fs.writeFileSync(`scratch/fix2_incomes_c${n}.sql`, incomeLines.slice(i,i+25).join('\n'));
}
console.log(`incomes: ${incomeLines.length} em ${Math.ceil(incomeLines.length/25)} chunks`);

// ============ INVOICES ============
const INV_VALID = ['id','descricao','valor','vencimento','status','created_at'];
const invLines = genSQL('invoices', backup.invoices||[], INV_VALID, {});
fs.writeFileSync('scratch/fix2_invoices.sql', invLines.join('\n'));
console.log(`invoices: ${invLines.length}`);

// ============ PAYROLLS ============
const PAY_VALID = ['id','funcionario_id','funcionario_nome','cargo','salario_bruto','descontos','salario_liquido','mes_referencia','status','periodo_inicio','periodo_fim','adicionais','tipo_periodo','observacoes','created_at'];
const PAY_MAP = { funcionarioId:'funcionario_id', funcionarioNome:'funcionario_nome', salarioBruto:'salario_bruto', salarioLiquido:'salario_liquido', mesReferencia:'mes_referencia', periodoInicio:'periodo_inicio', periodoFim:'periodo_fim', tipoPeriodo:'tipo_periodo' };
const payLines = genSQL('payrolls', backup.payrolls||[], PAY_VALID, PAY_MAP);
fs.writeFileSync('scratch/fix2_payrolls.sql', payLines.join('\n'));
console.log(`payrolls: ${payLines.length}`);

// ============ TERMINATIONS ============
const TERM_VALID = ['id','funcionario_id','funcionario_nome','cpf','cargo','salario_base','data_admissao','data_demissao','tipo_rescisao','valor_liquido','valor_fgts','valor_total','status','details','created_at'];
const TERM_MAP = { funcionarioId:'funcionario_id', funcionarioNome:'funcionario_nome', salarioBase:'salario_base', dataAdmissao:'data_admissao', dataDemissao:'data_demissao', tipoRescisao:'tipo_rescisao', valorLiquido:'valor_liquido', valorFgts:'valor_fgts', valorTotal:'valor_total', dataCriacao:'created_at_old' };
const termLines = genSQL('terminations', backup.terminations||[], TERM_VALID, TERM_MAP);
fs.writeFileSync('scratch/fix2_terminations.sql', termLines.join('\n'));
console.log(`terminations: ${termLines.length}`);

// ============ SCHEDULE_EXCEPTIONS (restantes - já temos 31 inseridos) ============
const schedAll = backup.schedule_exceptions || [];
const SCHED_VALID = ['id','employee_id','date','is_working','is_dobra','start_time','end_time','created_at'];
const SCHED_MAP = { employeeId:'employee_id', isWorking:'is_working', isDobra:'is_dobra', startTime:'start_time', endTime:'end_time' };
const schedLines = genSQL('schedule_exceptions', schedAll, SCHED_VALID, SCHED_MAP);
// Salva todos (ON CONFLICT DO NOTHING vai pular os 31 já inseridos)
for (let i=0;i<schedLines.length;i+=25){
  const n=String(Math.floor(i/25)+1).padStart(2,'0');
  fs.writeFileSync(`scratch/fix2_sched_c${n}.sql`, schedLines.slice(i,i+25).join('\n'));
}
console.log(`schedule_exceptions: ${schedLines.length} em ${Math.ceil(schedLines.length/25)} chunks`);

console.log('\n✅ Todos os SQLs gerados!');
