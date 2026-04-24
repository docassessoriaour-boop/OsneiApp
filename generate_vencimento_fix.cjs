const fs = require('fs');

function getFifthBusinessDay(year, month) {
  let count = 0;
  let date = new Date(year, month, 1);
  while (count < 5) {
    const day = date.getDay();
    if (day !== 0 && day !== 6) { 
      count++;
    }
    if (count < 5) {
      date.setDate(date.getDate() + 1);
    }
    if (date.getDate() > 20) break; 
  }
  return date.toISOString().split('T')[0];
}

const months = [
  {y: 2026, m: 4}, {y: 2026, m: 5}, {y: 2026, m: 6}, {y: 2026, m: 7},
  {y: 2026, m: 8}, {y: 2026, m: 9}, {y: 2026, m: 10}, {y: 2026, m: 11},
  {y: 2026, m: 12}, {y: 2027, m: 1}, {y: 2027, m: 2}, {y: 2027, m: 3}
];

const sql = ['BEGIN;'];
for (const item of months) {
  const newDate = getFifthBusinessDay(item.y, item.m - 1);
  const pattern = `${item.y}-${item.m.toString().padStart(2, '0')}-%`;
  sql.push(`UPDATE incomes SET vencimento = '${newDate}' WHERE category_id = '1b81d999-be40-48a5-88cc-dbcb5389df44' AND vencimento::text LIKE '${pattern}';`);
}
sql.push('COMMIT;');
fs.writeFileSync('update_vencimentos.sql', sql.join('\n'));
console.log('SQL generated in update_vencimentos.sql');
