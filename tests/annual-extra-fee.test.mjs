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
    categoria text, valor numeric, vencimento date, status text);
  CREATE TABLE invoices (id uuid PRIMARY KEY, company_id uuid, patient_id uuid REFERENCES patients(id),
    client_name text NOT NULL, client_document text, date_issued date, due_date date,
    total_amount numeric, status text, items jsonb, income_id uuid REFERENCES incomes(id));
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
await db.close()
console.log('OK: valor anual, vencimento, vínculos, pacientes ativos, escopo, autorização, duplicidade, rollback, agendamento e mudança de ano.')
