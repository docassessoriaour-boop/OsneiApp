import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseBankStatement, investmentMovement, sameStatementTransaction, safeAutomaticMatch, suggestCounterpart } from '../src/lib/bankReconciliation.ts'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const company = '10000000-0000-0000-0000-000000000001'
const foreignCompany = '10000000-0000-0000-0000-000000000002'
const user = '10000000-0000-0000-0000-000000000003'
const current = '20000000-0000-0000-0000-000000000001'
const investment = '20000000-0000-0000-0000-000000000002'
const foreignAccount = '20000000-0000-0000-0000-000000000003'
const account = { id: current, tipo: 'corrente', banco: 'Banco Teste' }
const invest = { id: investment, tipo: 'investimento', banco: 'Banco Teste' }
const ofx = (id, amount, memo, date = '20261102') => `<STMTTRN><DTPOSTED>${date}120000[-3:BRT]<TRNAMT>${amount}<FITID>${id}<MEMO>${memo}</STMTTRN>`
const parse = (id, amount, memo, acc = current, date) => parseBankStatement(ofx(id, amount, memo, date), 'ofx', acc).transactions[0]
assert.deepEqual(investmentMovement(parse('a', -1000, 'APLIC. AUTOMATICA CDB'), account), { kind:'aplicacao', validDirection:true })
assert.deepEqual(investmentMovement(parse('a', -1000, 'Aplicação RDB'), account), { kind:'aplicacao', validDirection:true })
assert.deepEqual(investmentMovement(parse('a', 1000, 'APLICAÇÃO RDB'), invest), { kind:'aplicacao', validDirection:true })
assert.deepEqual(investmentMovement(parse('a', 1000, 'Resgate RDB'), account), { kind:'resgate', validDirection:true })
assert.deepEqual(investmentMovement(parse('a', -1000, 'Resgate RDB'), invest), { kind:'resgate', validDirection:true })
assert.equal(investmentMovement(parse('a', 100, 'RESGATE AUTOMATICO'), account).validDirection, true)
assert.equal(investmentMovement(parse('a', -100, 'RESG APLIC'), invest).validDirection, true)
assert.equal(investmentMovement(parse('a', 100, 'APLICACAO'), invest).validDirection, true)
assert.equal(investmentMovement(parse('a', 100, 'APLICACAO'), account).validDirection, false)
assert.equal(investmentMovement(parse('a', 100, 'ESTORNO APLICACAO'), account).validDirection, false)
for (const text of ['RENDIMENTO APLICACAO','IOF RESGATE','IRRF APLICACAO','JUROS CDB']) assert.equal(investmentMovement(parse('a', 1, text), account), null)
assert.equal(suggestCounterpart(account, [account, invest]), investment)
assert.equal(suggestCounterpart(account, [account, invest, {...invest,id:foreignAccount}]), '')
assert.equal(suggestCounterpart(account, [account, {...invest,banco:'Outro banco'}]), '')
const csv = parseBankStatement('Data;Descrição;Valor;Tipo\r\n02/11/2026;"APLICACAO; CDB";1.234,56;D\r\n2026-11-03;Resgate;100.50;C\r\n31/02/2026;Inválido;10,00;C', 'csv', current)
assert.equal(csv.ignored, 1)
assert.equal(csv.transactions[0].valor, 1234.56)
assert.equal(csv.transactions[0].tipo, 'debito')
assert.equal(csv.transactions[0].descricao, 'APLICACAO; CDB')
assert.equal(csv.transactions[1].valor, 100.5)
assert.equal(csv.transactions[1].data, '2026-11-03')
const separate = parseBankStatement('Data;Histórico;Crédito;Débito;Saldo\n02/11/2026;Aplicação RDB;;1.000,00;9.000,00\n02/11/2026;Resgate RDB;500,00;;9.500,00','csv',current).transactions
assert.equal(separate[0].valor,1000); assert.equal(separate[0].tipo,'debito')
assert.equal(separate[1].valor,500); assert.equal(separate[1].tipo,'credito')
const repeated = parseBankStatement(ofx('one', -10, 'Compra')+ofx('two', -10, 'Compra'), 'ofx', current).transactions
assert.equal(sameStatementTransaction(repeated[0],repeated[1]), false)
assert.equal(sameStatementTransaction(repeated[0],{...repeated[0],bank_account_id:investment}), false)
assert.equal(sameStatementTransaction(repeated[0],{...repeated[0],id:'saved'}), true)
const generic = parse('g', -100, 'PAGAMENTO FORNECEDOR TESTECOM')
const bill = {id:'bill',descricao:'Fornecedor Testecom',valor:100,vencimento:'2026-11-04',status:'pendente'}
assert.equal(safeAutomaticMatch(generic,[bill])?.id,'bill')
assert.equal(safeAutomaticMatch(generic,[bill,{...bill,id:'other'}]),undefined)
assert.equal(safeAutomaticMatch(generic,[{...bill,bank_account_id:investment}]),undefined)
assert.equal(safeAutomaticMatch(generic,[{...bill,vencimento:'2026-10-01'}]),undefined)
assert.equal(safeAutomaticMatch({...generic,descricao:'PAGAMENTO BOLETO'},[bill]),undefined)

await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('test.actor')::uuid $$;
  SET test.actor='${user}';
  CREATE TABLE profiles(id uuid PRIMARY KEY,company_id uuid,role text);
  INSERT INTO profiles VALUES('${user}','${company}','admin');
  CREATE TABLE bank_accounts(id uuid PRIMARY KEY,company_id uuid,saldo_atual numeric DEFAULT 0);
  INSERT INTO bank_accounts VALUES('${current}','${company}',10000),('${investment}','${company}',5000),('${foreignAccount}','${foreignCompany}',500);
  CREATE TABLE transaction_categories(id uuid PRIMARY KEY,company_id uuid,nome text);
  CREATE TABLE bank_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,bank_account_id uuid REFERENCES bank_accounts(id),
    data date,descricao text,valor numeric,tipo text,origem text,categoria text,category_id uuid,status text,created_at timestamptz DEFAULT now());
  CREATE TABLE incomes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,descricao text,valor numeric,vencimento date,status text,
    payment_date date,category_id uuid,categoria text,bank_account_id uuid,bank_transaction_id uuid REFERENCES bank_transactions(id));
  CREATE TABLE bills(LIKE incomes INCLUDING ALL);
  CREATE TABLE invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,income_id uuid,status text,payment_date date,bank_account_id uuid,bank_transaction_id uuid REFERENCES bank_transactions(id));
  CREATE TABLE audit_logs(action text,record_id uuid);
  CREATE FUNCTION public.process_audit_log() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN INSERT INTO audit_logs VALUES(TG_OP,coalesce(NEW.id,OLD.id)); RETURN coalesce(NEW,OLD); END;
  $$;
  CREATE TRIGGER audit_tx AFTER INSERT OR UPDATE OR DELETE ON bank_transactions FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
  CREATE TRIGGER audit_account AFTER UPDATE ON bank_accounts FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
  CREATE TRIGGER audit_income AFTER INSERT OR UPDATE ON incomes FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
  CREATE TRIGGER audit_bill AFTER INSERT OR UPDATE ON bills FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
`)
const migration = readFileSync(new URL('../supabase_conciliacao_transferencias.sql',import.meta.url),'utf8')
await db.exec(migration); await db.exec(migration)
const scalar = async sql => (await db.query(sql)).rows[0].value
const ingest = async (tx, counterpart = null, item = null) => (await db.query('SELECT public.reconcile_statement_transaction($1::jsonb,$2::uuid,$3::uuid) AS value',[JSON.stringify(tx),counterpart,item])).rows[0].value
const balance = acc => scalar(`SELECT saldo_atual::float AS value FROM bank_accounts WHERE id='${acc}'`)
await db.query('SELECT public.save_reconciliation_account($1,$2)',[current,investment])
await assert.rejects(() => db.query('SELECT public.save_reconciliation_account($1,$2)',[current,foreignAccount]),/mesma empresa/)
const application = parse('app1', -1000, 'Aplicação RDB')
const applied = await ingest(application,investment)
assert.equal(applied.result,'transfer')
assert.equal(await balance(current),9000); assert.equal(await balance(investment),6000)
assert.equal(await scalar('SELECT count(*)::int AS value FROM incomes'),0)
assert.equal(await scalar('SELECT count(*)::int AS value FROM bills'),0)
assert.equal((await ingest(application,investment)).result,'duplicate')
assert.equal(await scalar('SELECT count(*)::int AS value FROM bank_transactions'),2)
// Contrapartida com um dia de diferença: atualiza apenas a perna já criada.
assert.equal((await ingest(parse('app-other',1000,'APLICACAO CDB',investment,'20261103'),current)).result,'paired')
assert.equal(await scalar('SELECT count(*)::int AS value FROM bank_transactions'),2)
assert.equal(await balance(current)+await balance(investment),15000)
const redemption = parse('res1',500,'RESGATE AUTOMATICO')
await ingest(redemption,investment)
assert.equal(await balance(current),9500); assert.equal(await balance(investment),5500)
assert.equal((await ingest(parse('res-other',-500,'RESGATE CDB',investment),current)).result,'paired')
// Dois movimentos legítimos iguais com FITIDs diferentes continuam distintos.
await ingest(parse('app2',-100,'APLICACAO CDB'),investment)
await ingest(parse('app3',-100,'APLICACAO CDB'),investment)
assert.equal(await scalar('SELECT count(*)::int AS value FROM bank_transactions'),8)
await ingest(parse('app2b',100,'APLICACAO CDB',investment),current)
await ingest(parse('app3b',100,'APLICACAO CDB',investment),current)
assert.equal(await scalar('SELECT count(*)::int AS value FROM bank_transactions'),8)
await assert.rejects(() => ingest({...application,valor:1001},investment),/identificação já existe/)
await assert.rejects(() => ingest(parse('bad',-10,'APLICACAO'),foreignAccount),/não pertence/)
await assert.rejects(() => ingest(parse('bad',-10,'APLICACAO'),current),/iguais/)
const before = await balance(current)
await db.exec(`ALTER TABLE bank_transactions ADD CONSTRAINT reject_counterpart CHECK (descricao NOT LIKE '%FALHA%' OR bank_account_id='${current}')`)
await assert.rejects(() => ingest(parse('failure',-300,'APLICACAO FALHA'),investment))
assert.equal(await balance(current),before)
assert.equal(await scalar("SELECT count(*)::int AS value FROM bank_transactions WHERE statement_id='failure'"),0)
await db.exec('ALTER TABLE bank_transactions DROP CONSTRAINT reject_counterpart')
// Baixa atômica de conta pendente e sincronização da fatura.
const incomeId = '30000000-0000-0000-0000-000000000001'
await db.exec(`INSERT INTO incomes(id,company_id,descricao,valor,vencimento,status) VALUES('${incomeId}','${company}','Mensalidade Teste',200,'2026-11-02','pendente');
  INSERT INTO invoices(company_id,income_id,status) VALUES('${company}','${incomeId}','pendente')`)
assert.equal((await ingest(parse('income',200,'PIX MENSALIDADE TESTE'),null,incomeId)).result,'matched')
assert.equal(await scalar(`SELECT status AS value FROM incomes WHERE id='${incomeId}'`),'recebido')
assert.equal(await scalar(`SELECT status AS value FROM invoices WHERE income_id='${incomeId}'`),'pago')
await assert.rejects(() => ingest(parse('income2',200,'PIX MENSALIDADE TESTE'),null,incomeId),/outra conciliação/)
await db.exec(`INSERT INTO bills(company_id,descricao,valor,vencimento,status) VALUES('${company}','Pendência não carregada',17,'2026-01-01','pendente')`)
await assert.rejects(() => ingest(parse('hidden',-17,'Pagamento sem descrição')),/precisa de revisão/)
assert.equal(await scalar("SELECT count(*)::int AS value FROM bank_transactions WHERE statement_id='hidden'"),0)
// Pagamento manual já registrado: reutiliza o mesmo movimento e não altera o saldo.
const paidBill = '30000000-0000-0000-0000-000000000002'
await db.exec(`WITH tx AS (INSERT INTO bank_transactions(company_id,bank_account_id,data,descricao,valor,tipo,origem) VALUES('${company}','${current}','2026-11-02','Pagamento: Fornecedor Testecom',100,'debito','manual') RETURNING id)
  INSERT INTO bills(id,company_id,descricao,valor,vencimento,payment_date,status,bank_account_id,bank_transaction_id)
  SELECT '${paidBill}','${company}','Fornecedor Testecom',100,'2026-11-02','2026-11-02','pago','${current}',id FROM tx`)
const paidBalance=await balance(current), txCount=await scalar('SELECT count(*)::int AS value FROM bank_transactions')
assert.equal((await ingest(generic,null,paidBill)).result,'matched')
assert.equal(await balance(current),paidBalance)
assert.equal(await scalar('SELECT count(*)::int AS value FROM bank_transactions'),txCount)
// Transferência manual antiga: as duas pernas são adotadas sem somar novamente.
await db.exec(`INSERT INTO bank_transactions(company_id,bank_account_id,data,descricao,valor,tipo,origem,categoria)
  VALUES('${company}','${current}','2026-11-02','Aplicação (Saída)',75,'debito','manual','Transferência'),
  ('${company}','${investment}','2026-11-02','Aplicação (Entrada)',75,'credito','manual','Transferência')`)
const manualBalance=await balance(current), manualCount=await scalar('SELECT count(*)::int AS value FROM bank_transactions')
assert.equal((await ingest(parse('old-manual',-75,'APLICACAO CDB'),investment)).result,'paired')
assert.equal(await balance(current),manualBalance)
assert.equal(await scalar('SELECT count(*)::int AS value FROM bank_transactions'),manualCount)
assert.equal((await ingest(parse('old-manual-other',75,'APLICACAO CDB',investment),current)).result,'paired')
// A exclusão da transferência reverte ambas as contas na mesma transação.
await db.query('SELECT public.delete_reconciled_transfer($1)',[applied.transfer_id])
assert.equal(await scalar(`SELECT count(*)::int AS value FROM bank_transactions WHERE transfer_id='${applied.transfer_id}'`),0)
await db.exec("UPDATE profiles SET role='user'")
await assert.rejects(() => ingest(parse('unauthorized',1,'Teste')),/não autorizado/)
assert.equal(await scalar("SELECT has_function_privilege('anon','public.reconcile_statement_transaction(jsonb,uuid,uuid,boolean)','EXECUTE') AS value"),false)
assert.ok(await scalar('SELECT count(*)::int AS value FROM audit_logs') > 0)
await db.close()
console.log('OK: leitura OFX/CSV, aplicações, resgates, saldos, reimportação, contrapartidas, atomicidade, baixas, pagamentos manuais e isolamento entre empresas.')
