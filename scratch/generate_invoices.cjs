const fs = require('fs');

const contracts = [
    {patient_id: "10000000-0000-0000-0000-000000000003", patient_name: "MADALENA FLORÊNCIO DIAS PERECIM", client_name: "DANIEL DIAS PERECIM", client_document: "321.533.778-50", valor: 3000, dataInicio: "2026-01-23", dataFim: "2027-01-23"},
    {patient_id: "10000000-0000-0000-0000-000000000004", patient_name: "CARMEM FLORINDO DE LÚCIO", client_name: "ISABEL CRISTINA DE LUCIO FERREIRA", client_document: "222.350.858-33", valor: 3200, dataInicio: "2026-01-22", dataFim: "2027-01-22"},
    {patient_id: "10000000-0000-0000-0000-000000000005", patient_name: "CARMEN VILHA GONÇALVES", client_name: "CÉLIA GONÇALVES SALMAZO", client_document: "101.678.508-41", valor: 3000, dataInicio: "2026-01-21", dataFim: "2027-01-21"},
    {patient_id: "10000000-0000-0000-0000-000000000006", patient_name: "ZILDA VILA BONVIN", client_name: "OSMAR BONVIN", client_document: "345.725.658-77", valor: 3000, dataInicio: "2026-03-01", dataFim: "2027-03-01"},
    {patient_id: "10000000-0000-0000-0000-000000000007", patient_name: "SURIA CURY DE SOUSA", client_name: "ADALBERTO DE SOUSA", client_document: "315.754.408-73", valor: 3800, dataInicio: "2026-03-21", dataFim: "2027-03-21"},
    {patient_id: "10000000-0000-0000-0000-000000000008", patient_name: "JOSÉ GRANADO ANDREU", client_name: "MARCO ANTONIO GRANADO", client_document: "318.892.838-58", valor: 3100, dataInicio: "2026-04-01", dataFim: "2027-04-01"},
    {patient_id: "10000000-0000-0000-0000-000000000009", patient_name: "APARECIDA ESMERIA DE MORAES", client_name: "ANA BEATRIZ DE MORAES MARCOLINO", client_document: "431.501.148-22", valor: 3000, dataInicio: "2026-02-02", dataFim: "2027-02-02"},
    {patient_id: "10000000-0000-0000-0000-000000000010", patient_name: "ANNA DUMARA VILLAÇA PAULETI", client_name: "JOSE GUILHERME PAULETI", client_document: "143.232.838-17", valor: 3100, dataInicio: "2026-04-10", dataFim: "2027-04-10"},
    {patient_id: "10000000-0000-0000-0000-000000000011", patient_name: "MARTA FIRMINO DUTRA", client_name: "MARIA MADALENA CORREA", client_document: "328.732.128-09", valor: 3000, dataInicio: "2026-04-08", dataFim: "2027-04-08"},
    {patient_id: "10000000-0000-0000-0000-000000000012", patient_name: "GONCALO DE SOUZA CAMARGO", client_name: "TANIA DE FATIMA CAMARGO", client_document: "447.322.428-71", valor: 3100, dataInicio: "2026-04-12", dataFim: "2027-04-12"},
    {patient_id: "10000000-0000-0000-0000-000000000013", patient_name: "TEREZINHA PAVANI", client_name: "PEDRO LUIZ PAVANI", client_document: "340.727.758-65", valor: 3200, dataInicio: "2025-04-27", dataFim: "2026-04-27"},
    {patient_id: "10000000-0000-0000-0000-000000000014", patient_name: "THEREZINHA DINEIA DEFFANTE ORLANDINI", client_name: "ELIANE MARGARETE ORLANDI DANTAS", client_document: "282.510.158-91", valor: 3200, dataInicio: "2025-04-14", dataFim: "2026-04-14"},
    {patient_id: "10000000-0000-0000-0000-000000000015", patient_name: "LEONORA PENTEADO AZEVEDO", client_name: "SUELEN DA SILVA AZEVEDO", client_document: "340.121.078-52", valor: 3100, dataInicio: "2025-07-14", dataFim: "2026-07-14"},
    {patient_id: "10000000-0000-0000-0000-000000000016", patient_name: "VALTER SANT ANA", client_name: "WILMA SANT ANA OLIVEIRA", client_document: "381.843.518-18", valor: 3000, dataInicio: "2026-02-02", dataFim: "2027-02-02"},
    {patient_id: "10000000-0000-0000-0000-000000000017", patient_name: "ANTONIO DA SILVA", client_name: "RITA DE CASSIA DA SILVA", client_document: "340.580.038-92", valor: 2700, dataInicio: "2026-03-02", dataFim: "2027-03-02"},
    {patient_id: "10000000-0000-0000-0000-000000000018", patient_name: "ANTONIO CLOVIS DE SOUZA", client_name: "ARLY APARECIDA DE SOUZA FERRARI", client_document: "057.495.838-89", valor: 3000, dataInicio: "2026-04-13", dataFim: "2027-04-13"},
    {patient_id: "10000000-0000-0000-0000-000000000019", patient_name: "JOSÉ BISPO IRMÃO", client_name: "ROGÉRIO FABER", client_document: "320.138.828-44", valor: 3100, dataInicio: "2025-05-17", dataFim: "2026-05-17"},
    {patient_id: "10000000-0000-0000-0000-000000000020", patient_name: "OSVALDO TANABE", client_name: "IZAURA KUMAGAI", client_document: "055.658.428-49", valor: 3100, dataInicio: "2025-09-01", dataFim: "2026-09-01"},
    {patient_id: "10000000-0000-0000-0000-000000000001", patient_name: "JOÃO FRANCISCO DE FARIA", client_name: "OSNEI FRANCISCO DE FARIAS", client_document: "034.224.428-37", valor: 3000, dataInicio: "2025-11-24", dataFim: "2026-11-24"},
    {patient_id: "10000000-0000-0000-0000-000000000002", patient_name: "DULCINÉIA DUARTE DOS SANTOS", client_name: "ELCIO AGNALDO DUARTE DOS SANTOS", client_document: "137.187.668-70", valor: 3000, dataInicio: "2025-09-07", dataFim: "2026-09-07"},
];

const months = [
    {idx: 5, year: 2026, due: "2026-05-08"},
    {idx: 6, year: 2026, due: "2026-06-08"},
    {idx: 7, year: 2026, due: "2026-07-07"},
    {idx: 8, year: 2026, due: "2026-08-07"},
    {idx: 9, year: 2026, due: "2026-09-08"},
    {idx: 10, year: 2026, due: "2026-10-07"},
    {idx: 11, year: 2026, due: "2026-11-09"},
    {idx: 12, year: 2026, due: "2026-12-07"},
];

const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

let totalSql = "DELETE FROM invoices WHERE id::text LIKE '40000000%'; DELETE FROM incomes WHERE id::text LIKE '30000000%';\n";

for (const m of months) {
    const monthName = monthNames[m.idx - 1];
    const dueDate = new Date(m.due);
    
    for (const c of contracts) {
        const df = new Date(c.dataFim);
        if (df < dueDate) continue;

        const val = Number(c.valor);
        const items = JSON.stringify([{description: `Mensalidade - ${monthName}/${m.year}`, quantity: 1, price: val}]);
        
        const issueDate = new Date(dueDate);
        issueDate.setDate(dueDate.getDate() - 7);
        const issueStr = issueDate.toISOString().split('T')[0];

        const suffix = c.patient_id.slice(-12);
        const incomeId = `30000000-${m.idx.toString().padStart(4, '0')}-0000-0000-${suffix}`;
        const invoiceId = `40000000-${m.idx.toString().padStart(4, '0')}-0000-0000-${suffix}`;

        totalSql += `INSERT INTO incomes (id, descricao, categoria, valor, vencimento, status) VALUES ('${incomeId}', 'Fatura: ${c.client_name} (${monthName}/${m.year})', 'Mensalidade/Serviços', ${val}, '${m.due}', 'pendente');\n`;
        totalSql += `INSERT INTO invoices (id, patient_id, client_name, client_document, date_issued, due_date, total_amount, status, items, income_id) VALUES ('${invoiceId}', '${c.patient_id}', '${c.client_name}', '${c.client_document}', '${issueStr}', '${m.due}', ${val}, 'pendente', '${items.replace(/'/g, "''")}', '${incomeId}');\n`;
    }
}

fs.writeFileSync(`scratch/generate_invoices_all.sql`, totalSql);
