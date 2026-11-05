// Integração em PostgreSQL isolado: npm install --no-save @electric-sql/pglite
// node tests/annual-extra-fee.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const sql = readFileSync(new URL('../supabase_taxa_extra_anual.sql', import.meta.url), 'utf8')
  .replaceAll("(now() AT TIME ZONE 'America/Sao_Paulo')::date", "current_setting('test.today')::date")
const core = sql.split('-- START SCHEDULER')[0]
const scheduler = sql.split('-- START SCHEDULER')[1].split('-- END SCHEDULER')[0]
  .replace(/^CREATE EXTENSION.*$/gm, '')
const companyA = '00000000-0000-0000-0000-000000000001'
const companyB = '00000000-0000-0000-0000-000000000002'
const user = '00000000-0000-0000-0000-000000000003'
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated;
  CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE SCHEMA cron;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
    $$ SELECT nullif(current_setting('test.actor', true), '')::uuid $$;
  CREATE TABLE companies (id uuid PRIMARY KEY, active boolean DEFAULT true);
  CREATE TABLE profiles (id uuid PRIMARY KEY, company_id uuid, role text);
  CREATE TABLE patients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid,
    nome text, cpf text, resp_cpf text, status text, data_entrada date);
  CREATE TABLE incomes (id uuid PRIMARY KEY, company_id uuid, descricao text NOT NULL,
    categoria text, valor numeric, vencimento date, status text, valor_pago numeric DEFAULT 0, payment_date date, bank_transaction_id uuid);
  CREATE TABLE invoices (id uuid PRIMARY KEY, company_id uuid, patient_id uuid REFERENCES patients(id),
    client_name text NOT NULL, client_document text, date_issued date, due_date date,
    total_amount numeric, status text, items jsonb, income_id uuid REFERENCES incomes(id),
    valor_pago numeric DEFAULT 0, payment_date date, bank_transaction_id uuid);
  CREATE TABLE cron.jobs (name text PRIMARY KEY, schedule text, command text);
  CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$
    INSERT INTO cron.jobs VALUES ($1,$2,$3) ON CONFLICT(name) DO UPDATE SET schedule=$2, command=$3 RETURNING 1::bigint
  $$;
  CREATE TABLE extensions.mock_bcb (status integer, content text);
  CREATE FUNCTION extensions.http_get(text) RETURNS TABLE(status integer, content text)
    LANGUAGE sql AS $$ SELECT * FROM extensions.mock_bcb $$;
  SET test.today = '2026-11-02';
  INSERT INTO companies VALUES ('${companyA}',true), ('${companyB}',true);
  INSERT INTO profiles VALUES ('${user}', '${companyA}', 'admin');
  SET test.actor = '${user}';
  INSERT INTO patients (company_id, nome, status, data_entrada) VALUES
    ('${companyA}', 'Ativo A', 'ativo', '2025-01-01'),
    ('${companyA}', 'Inativo A', 'inativo', '2025-01-01'),
    ('${companyA}', 'Futuro A', 'ativo', '2027-01-01'),
    ('${companyB}', 'Ativo B', 'ativo', '2025-01-01');
`)
const scalar = async query => (await db.query(query)).rows[0].value
const ensure = () => scalar('SELECT public.ensure_annual_extra_fees() AS value')
const exitSql = readFileSync(new URL('../supabase_paciente_inativacao.sql', import.meta.url), 'utf8')
  .replaceAll("(now() AT TIME ZONE 'America/Sao_Paulo')::date", "current_setting('test.today')::date")
await db.exec(exitSql)
await db.exec(exitSql) // Reaplicação da migração de saída.
await db.exec(core)
await db.exec(core) // Reaplicação da migração.
const first = await ensure()
assert.equal(first.generated, 1)
assert.equal(first.amount, 810.5)
assert.equal(first.minimum_wage, 1621)
assert.equal(first.due_date, '2026-12-15')
assert.equal(await scalar('SELECT count(*)::int AS value FROM incomes'), 1)
assert.equal(await scalar(`SELECT count(*)::int AS value FROM invoices i JOIN incomes r ON r.id=i.income_id
  WHERE i.company_id=r.company_id AND i.total_amount=r.valor AND i.due_date=r.vencimento
    AND (i.items->0->>'price')::numeric=r.valor`), 1)
assert.equal((await ensure()).generated, 0)
await db.exec("UPDATE invoices SET status='pago'; UPDATE incomes SET status='recebido'")
assert.equal((await ensure()).generated, 0)
await db.exec("UPDATE invoices SET status='cancelado'")
assert.equal((await ensure()).generated, 0)
await db.exec('DELETE FROM invoices; DELETE FROM incomes')
assert.equal((await ensure()).generated, 0)
await db.exec(`INSERT INTO patients(company_id,nome,status) VALUES ('${companyA}', 'Novo A', 'ativo')`)
assert.equal((await ensure()).generated, 1)

// Um erro na fatura reverte também a receita e a reserva de unicidade.
await db.exec(`INSERT INTO patients(company_id,nome,status) VALUES ('${companyA}', 'Erro', 'ativo');
  ALTER TABLE invoices ADD CONSTRAINT test_invoice_failure CHECK (client_name <> 'Erro')`)
await assert.rejects(ensure)
assert.equal(await scalar('SELECT count(*)::int AS value FROM private.annual_extra_fees'), 2)
assert.equal(await scalar('SELECT count(*)::int AS value FROM incomes'), 1)
await db.exec('ALTER TABLE invoices DROP CONSTRAINT test_invoice_failure')
assert.equal((await ensure()).generated, 1)

// Escopo fixado pelo perfil e bloqueio de execução por usuário comum/anônimo.
await db.exec(`UPDATE profiles SET company_id='${companyB}', role='manager' WHERE id='${user}'`)
assert.equal((await ensure()).generated, 1)
await db.exec("UPDATE profiles SET role='user'")
await assert.rejects(ensure, /Acesso não autorizado/)
await db.exec("SET test.actor = ''")
await assert.rejects(ensure, /Acesso não autorizado/)
assert.equal(await scalar("SELECT has_function_privilege('anon','public.ensure_annual_extra_fees()','EXECUTE') AS value"), false)
assert.equal(await scalar("SELECT has_function_privilege('authenticated','private.generate_annual_extra_fees(uuid)','EXECUTE') AS value"), false)

// Novo ano nunca reutiliza o salário mínimo anterior.
await db.exec(`SET test.actor = '${user}'; UPDATE profiles SET role='admin'; SET test.today = '2027-01-01'`)
await assert.rejects(ensure, /Salário mínimo de 2027/)
await db.exec(scheduler)
await db.exec(scheduler)
assert.equal(await scalar('SELECT count(*)::int AS value FROM cron.jobs'), 1)
await db.exec(`INSERT INTO extensions.mock_bcb VALUES (200, '[{"data":"01/12/2026","valor":"1621.00"}]')`)
await assert.rejects(() => db.exec('SELECT private.sync_annual_extra_fees()'), /ano corrente/)
// Valor fictício do teste: não é previsão de salário mínimo.
await db.exec(`UPDATE extensions.mock_bcb SET content='[{"data":"01/01/2027","valor":"1800.00"}]'`)
await db.exec('SELECT private.sync_annual_extra_fees()')
assert.equal((await ensure()).amount, 900)
assert.equal((await ensure()).due_date, '2027-12-15')
assert.equal((await ensure()).generated, 0)
assert.equal(await scalar('SELECT count(*)::int AS value FROM private.annual_extra_fees WHERE year=2027'), 5)
assert.equal(await scalar('SELECT amount::float AS value FROM private.annual_extra_fees WHERE year=2026 LIMIT 1'), 810.5)
// Indisponibilidade da fonte permite apenas o valor confirmado no mesmo ano.
await db.exec('UPDATE extensions.mock_bcb SET status=503')
await db.exec('SELECT private.sync_annual_extra_fees()')
await db.exec("SET test.today = '2028-01-01'")
await assert.rejects(() => db.exec('SELECT private.sync_annual_extra_fees()'), /BCB HTTP 503/)
// Proporção em meses civis, limites do ano e ausência de entrada legada.
for (const [entry, exit, year, expected] of [
  ['2026-09-01', null, 2026, 4], ['2025-01-01', null, 2026, 12],
  ['2026-12-31', null, 2026, 1], ['2027-01-01', null, 2026, 0],
  ['2026-09-30', '2026-11-01', 2026, 3], [null, null, 2026, 12],
  ['2026-11-01', '2026-10-01', 2026, 0], ['2025-01-01', '2025-12-31', 2026, 0]
]) {
  const result = await db.query('SELECT private.annual_fee_months($1::date,$2::date,$3) AS value', [entry, exit, year])
  assert.equal(result.rows[0].value, expected)
}
await db.exec(`SET test.today='2026-11-05'; UPDATE profiles SET company_id='${companyA}';
  INSERT INTO patients(company_id,nome,status,data_entrada)
  VALUES ('${companyA}','Admissão setembro','ativo','2026-09-01')`)
await ensure()
const september = await scalar("SELECT id AS value FROM patients WHERE nome='Admissão setembro'")
const annualValue = () => scalar(`SELECT amount::float AS value FROM private.annual_extra_fees WHERE patient_id='${september}' AND year=2026`)
assert.equal(await annualValue(), 270.17)
// Corrige taxa integral já emitida, mantendo IDs e vínculo financeiro.
await db.exec(`UPDATE private.annual_extra_fees SET amount=810.50 WHERE patient_id='${september}';
  UPDATE invoices SET total_amount=810.50 WHERE patient_id='${september}';
  UPDATE incomes SET valor=810.50 WHERE id IN (SELECT income_id FROM invoices WHERE patient_id='${september}')`)
await ensure()
assert.equal(await annualValue(), 270.17)
assert.equal(await scalar(`SELECT total_amount::float AS value FROM invoices WHERE patient_id='${september}'`), 270.17)
assert.equal(await scalar(`SELECT valor::float AS value FROM incomes WHERE id IN (SELECT income_id FROM invoices WHERE patient_id='${september}')`), 270.17)
// Já pago: alteração de entrada não reescreve o valor original.
await db.exec(`UPDATE invoices SET status='pago',valor_pago=270.17 WHERE patient_id='${september}';
  UPDATE incomes SET status='recebido',valor_pago=270.17 WHERE id IN (SELECT income_id FROM invoices WHERE patient_id='${september}');
  UPDATE patients SET data_entrada='2026-08-01' WHERE id='${september}'`)
await ensure()
assert.equal(await annualValue(), 270.17)

// Inativação: passado, próprio dia, futuro, parcial, recebido e outra empresa.
const exitPatient = '00000000-0000-0000-0000-000000000100'
await db.exec(`INSERT INTO patients(id,company_id,nome,status,data_entrada)
  VALUES ('${exitPatient}','${companyA}','Saída','ativo','2026-09-01')`)
await ensure()
for (const [suffix, due, invStatus, incStatus, paid, company, patient] of [
  ['101','2026-10-01','pendente','pendente',0,companyA,exitPatient],
  ['102','2026-11-05','pendente','pendente',0,companyA,exitPatient],
  ['103','2026-12-01','pendente','pendente',0,companyA,exitPatient],
  ['104','2026-12-01','parcial','parcial',50,companyA,exitPatient],
  ['105','2026-12-01','pago','recebido',100,companyA,exitPatient],
  ['106','2026-12-01','pendente','pendente',0,companyB,exitPatient],
  ['107','2026-12-01','pendente','recebido',100,companyA,exitPatient]
]) {
  const id = '00000000-0000-0000-0000-000000000'+suffix
  await db.query('INSERT INTO incomes(id,company_id,descricao,valor,vencimento,status,valor_pago) VALUES($1,$2,$3,100,$4,$5,$6)', [id,company,'Teste saída',due,incStatus,paid])
  await db.query('INSERT INTO invoices(id,company_id,patient_id,client_name,due_date,status,valor_pago,income_id) VALUES($1,$2,$3,$4,$5,$6,$7,$1)', [id,company,patient,'Teste saída',due,invStatus,paid])
}
await assert.rejects(() => db.exec(`UPDATE patients SET status='inativo' WHERE id='${exitPatient}'`), /Informe a data/)
await assert.rejects(() => db.exec(`UPDATE patients SET status='inativo',data_saida='2026-08-01' WHERE id='${exitPatient}'`), /entre a entrada e hoje/)
await assert.rejects(() => db.exec(`UPDATE patients SET status='inativo',data_saida='2026-12-01' WHERE id='${exitPatient}'`), /entre a entrada e hoje/)
// Falha no cancelamento reverte data/status e as receitas da mesma transação.
await db.exec(`ALTER TABLE invoices ADD CONSTRAINT test_cancel_failure
  CHECK (id <> '00000000-0000-0000-0000-000000000103' OR status <> 'cancelado')`)
await assert.rejects(() => db.exec(`UPDATE patients SET status='inativo',data_saida='2026-11-05' WHERE id='${exitPatient}'`))
assert.equal(await scalar(`SELECT status AS value FROM patients WHERE id='${exitPatient}'`),'ativo')
assert.equal(await scalar("SELECT status AS value FROM incomes WHERE id='00000000-0000-0000-0000-000000000103'"),'pendente')
await db.exec('ALTER TABLE invoices DROP CONSTRAINT test_cancel_failure')
await db.exec(`UPDATE patients SET status='inativo',data_saida='2026-11-05' WHERE id='${exitPatient}'`)
for (const [suffix, expected] of [['101','pendente'],['102','pendente'],['103','cancelado'],['104','parcial'],['105','pago'],['106','pendente'],['107','pendente']]) {
  assert.equal(await scalar(`SELECT status AS value FROM invoices WHERE id='00000000-0000-0000-0000-000000000${suffix}'`),expected)
}
assert.equal(await scalar("SELECT status AS value FROM incomes WHERE id='00000000-0000-0000-0000-000000000103'"),'cancelado')
assert.equal(await scalar(`SELECT status AS value FROM invoices WHERE patient_id='${exitPatient}' AND due_date='2026-12-15'`),'cancelado')
await ensure()
assert.equal(await scalar(`SELECT count(*)::int AS value FROM private.annual_extra_fees WHERE patient_id='${exitPatient}'`),1)
// Nova fatura de sessão antiga já nasce cancelada junto da receita.
await db.exec(`INSERT INTO incomes(id,company_id,descricao,valor,vencimento,status)
  VALUES ('00000000-0000-0000-0000-000000000108','${companyA}','Sessão antiga',100,'2026-12-01','pendente');
  INSERT INTO invoices(id,company_id,patient_id,client_name,due_date,status,income_id)
  VALUES ('00000000-0000-0000-0000-000000000108','${companyA}','${exitPatient}','Sessão antiga','2026-12-01','pendente','00000000-0000-0000-0000-000000000108')`)
assert.equal(await scalar("SELECT status AS value FROM invoices WHERE id='00000000-0000-0000-0000-000000000108'"),'cancelado')
assert.equal(await scalar("SELECT status AS value FROM incomes WHERE id='00000000-0000-0000-0000-000000000108'"),'cancelado')
// Ajustar saída retroativa cancela somente o novo intervalo; reativar não recria cobranças.
await db.exec(`UPDATE patients SET data_saida='2026-10-31' WHERE id='${exitPatient}'`)
assert.equal(await scalar("SELECT status AS value FROM invoices WHERE id='00000000-0000-0000-0000-000000000102'"),'cancelado')
await db.exec(`UPDATE patients SET status='ativo' WHERE id='${exitPatient}'`)
assert.equal(await scalar(`SELECT data_saida AS value FROM patients WHERE id='${exitPatient}'`),null)
await ensure()
assert.equal(await scalar(`SELECT count(*)::int AS value FROM private.annual_extra_fees WHERE patient_id='${exitPatient}'`),1)
await db.close()
console.log('OK: proporcionalidade, correção de pendentes, saída com data, cancelamento futuro, preservação de pagamentos, reativação, proteção de sessão antiga, valor anual, vencimento, vínculos, pacientes ativos, escopo, autorização, duplicidade, rollback, agendamento e mudança de ano.')
