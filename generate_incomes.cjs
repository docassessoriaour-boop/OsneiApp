const fs = require('fs');

const contractsData = [
  { pId: 'ff99f220-97d9-4d37-a05a-89a6d45bdb4c', nome: 'JOÃO FRANCISCO DE FARIA', valor: 3200, inicio: '2025-11-24' },
  { pId: 'f97a521a-a69d-43c4-8576-4116b7caf25f', nome: 'DULCINÉIA DUARTE DOS SANTOS', valor: 2900, inicio: '2025-06-07' },
  { pId: '34c31c45-2ee3-4b64-9ee7-8008f9f1f79b', nome: 'MADALENA FLORENCIO DIAS PEREDIM', valor: 3200, inicio: '2026-01-23' },
  { pId: 'a6fce8fb-dbe2-48b5-b4ca-12835d9363da', nome: 'CARMEM FLORINDO DE LUCIO', valor: 3200, inicio: '2026-01-22' },
  { pId: 'abc87ec0-f998-405e-8131-2579910ce669', nome: 'CARMEN VILHA GONÇALVES', valor: 3000, inicio: '2026-01-21' },
  { pId: '2a6d3923-2989-4d19-b983-2563e3bf1d56', nome: 'ZILDA VILA BONEIN', valor: 3000, inicio: '2026-03-01' },
  { pId: 'dce97021-6f61-43b7-ad99-d4f3ba0176d4', nome: 'SURIA CURY DE SOUSA', valor: 3800, inicio: '2026-03-21' },
  { pId: '15537f7a-19f0-4cd5-8678-616fa15da494', nome: 'JOSÉ GRANADO ANDREU', valor: 3100, inicio: '2026-04-01' },
  { pId: '96393e7d-2d8e-4bf2-9bd7-60b7321ad6e3', nome: 'APARECIDA ESMERIA DE MORAES', valor: 3000, inicio: '2026-02-02' },
  { pId: '22dea682-32fe-4f4f-8c0c-9445536672e0', nome: 'ANNA DUMARA VILLAÇA PAULETE', valor: 3100, inicio: '2026-04-10' },
  { pId: '6709fdfb-c2d0-41fb-be8d-3ae6fd76a42b', nome: 'MARTA FIRVINO DUTRA', valor: 3000, inicio: '2026-04-08' },
  { pId: '608c3114-e94e-4aca-81e9-f1c24aa72305', nome: 'DIONCALO DE SOUZA CAMARGO', valor: 3100, inicio: '2026-04-12' },
  { pId: 'bd31b50d-da99-48f2-afef-14db944e6d1e', nome: 'TEREZINHA PAVANI', valor: 3200, inicio: '2025-04-27' },
  { pId: '38e70d59-d989-4ea9-99f8-f09b00b54ddc', nome: 'TEREZINHA IDINEIA BEFFANTI ORLANDINI', valor: 3200, inicio: '2025-04-14' },
  { pId: 'd5496dbc-9a14-49e3-a292-f11048c37752', nome: 'LEONORA PENTEADO AZEVEDO', valor: 3100, inicio: '2025-07-14' },
  { pId: '058fbe20-61f8-401c-89bd-c56514878e77', nome: 'VALTER SANT ANA', valor: 3000, inicio: '2026-02-02' },
  { pId: 'a4f5761c-72d6-472a-ad9a-4f30878c390d', nome: 'ANTONIO DA SILVA', valor: 2700, inicio: '2026-03-02' },
  { pId: '84b38fe3-64e6-4752-98f2-a44ee15accff', nome: 'ANTONIO CLOVIS DE SOUZA', valor: 3000, inicio: '2026-04-13' },
  { pId: '21e85465-4fe3-4441-9cc9-2cfad9b9ab05', nome: 'JOSÉ BISPO PAVÃO', valor: 3100, inicio: '2025-05-17' },
  { pId: '3d06e3fc-8a53-42ce-8a66-56d6eb7b05e3', nome: 'OSVALDO TANABE', valor: 3100, inicio: '2025-09-01' }
];

const categoryId = '1b81d999-be40-48a5-88cc-dbcb5389df44';
const genSql = [];

for (const c of contractsData) {
  const startDate = new Date(c.inicio + 'T12:00:00');
  for (let i = 0; i < 12; i++) {
    const dueDate = new Date(startDate);
    dueDate.setMonth(startDate.getMonth() + i);
    
    const dueDateStr = dueDate.toISOString().split('T')[0];
    const monthYear = (dueDate.getMonth() + 1).toString().padStart(2, '0') + '/' + dueDate.getFullYear();
    const description = `Mensalidade: ${c.nome} - ${monthYear}`;
    
    genSql.push(`INSERT INTO incomes (descricao, valor, vencimento, status, category_id, categoria) VALUES ('${description.replace(/'/g, "''")}', ${c.valor}, '${dueDateStr}', 'pendente', '${categoryId}', 'Paciente');`);
  }
}

fs.writeFileSync('generate_incomes.sql', 'BEGIN;\n' + genSql.join('\n') + '\nCOMMIT;');
function getTimelineColor(daysLeft, status) {
    if (status === 'cancelado') return '#9ca3af'
    if (daysLeft < 0) return '#dc2626'
    if (daysLeft <= 30) return '#f59e0b'
    if (daysLeft <= 90) return '#3b82f6'
    return '#16a34a'
}
