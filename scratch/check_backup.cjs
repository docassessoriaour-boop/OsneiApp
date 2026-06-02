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

// product_categories
const cats = backup.product_categories || [];
console.log('product_categories:', cats.length, 'records');
const catLines = cats.map(r => {
  const cols = Object.keys(r);
  const vals = cols.map(c => sqlVal(r[c]));
  return 'INSERT INTO product_categories (' + cols.join(',') + ') VALUES (' + vals.join(',') + ') ON CONFLICT (id) DO NOTHING;';
});
fs.writeFileSync('scratch/fix_product_categories.sql', catLines.join('\n'));
console.log('product_categories SQL gerado');

// bills
const bills = backup.bills || [];
console.log('bills:', bills.length, 'records');
if (bills[0]) console.log('bills[0] keys:', Object.keys(bills[0]).join(', '));

// invoices
const invoices = backup.invoices || [];
console.log('invoices:', invoices.length, 'records');
if (invoices[0]) console.log('invoices[0] keys:', Object.keys(invoices[0]).join(', '));

// payrolls
const payrolls = backup.payrolls || [];
console.log('payrolls:', payrolls.length, 'records');
if (payrolls[0]) console.log('payrolls[0] keys:', Object.keys(payrolls[0]).join(', '));

// terminations
const terms = backup.terminations || [];
console.log('terminations:', terms.length, 'records');
if (terms[0]) console.log('terminations[0] keys:', Object.keys(terms[0]).join(', '));

// schedule_exceptions
const sched = backup.schedule_exceptions || [];
console.log('schedule_exceptions total:', sched.length);
