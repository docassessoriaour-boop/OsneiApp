-- Conciliação atômica de extratos e transferências. Executar no SQL Editor.
BEGIN;
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS reconciliation_account_id UUID REFERENCES public.bank_accounts(id);
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS statement_id TEXT,
  ADD COLUMN IF NOT EXISTS reconciliation_key TEXT,
  ADD COLUMN IF NOT EXISTS transfer_id UUID,
  ADD COLUMN IF NOT EXISTS counterpart_account_id UUID REFERENCES public.bank_accounts(id);
CREATE UNIQUE INDEX IF NOT EXISTS bank_statement_unique
  ON public.bank_transactions(company_id, bank_account_id, reconciliation_key) WHERE reconciliation_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bank_fitid_unique
  ON public.bank_transactions(company_id, bank_account_id, statement_id) WHERE statement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bank_transfer_group ON public.bank_transactions(company_id, transfer_id) WHERE transfer_id IS NOT NULL;

-- O trigger legado usa nomes sem schema e falha em RPCs com search_path vazio.
-- Mantém a regra de saldo, qualificando as tabelas e respeitando a empresa.
CREATE OR REPLACE FUNCTION public.update_bank_balance()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    UPDATE public.bank_accounts SET saldo_atual=coalesce(saldo_atual,0)
      - CASE WHEN OLD.tipo='credito' THEN OLD.valor ELSE -OLD.valor END
    WHERE id=OLD.bank_account_id AND company_id IS NOT DISTINCT FROM OLD.company_id;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    UPDATE public.bank_accounts SET saldo_atual=coalesce(saldo_atual,0)
      + CASE WHEN NEW.tipo='credito' THEN NEW.valor ELSE -NEW.valor END
    WHERE id=NEW.bank_account_id AND company_id IS NOT DISTINCT FROM NEW.company_id;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS tr_update_bank_balance ON public.bank_transactions;
CREATE TRIGGER tr_update_bank_balance AFTER INSERT OR UPDATE OR DELETE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_bank_balance();

-- O auditor legado também usa audit_logs sem schema. Fixa sua resolução para
-- preservar a auditoria quando acionada pelas funções com search_path vazio.
DO $$ BEGIN
  IF to_regprocedure('public.process_audit_log()') IS NOT NULL THEN
    ALTER FUNCTION public.process_audit_log() SET search_path = pg_catalog, public, pg_temp;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.save_reconciliation_account(p_account_id UUID, p_counterpart_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE company UUID;
BEGIN
  SELECT company_id INTO company FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','manager');
  IF company IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501'; END IF;
  IF p_account_id = p_counterpart_id OR NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id=p_account_id AND company_id=company)
    OR (p_counterpart_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id=p_counterpart_id AND company_id=company)) THEN
    RAISE EXCEPTION 'Selecione duas contas diferentes da mesma empresa.';
  END IF;
  UPDATE public.bank_accounts SET reconciliation_account_id=p_counterpart_id WHERE id=p_account_id AND company_id=company;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_statement_transaction(
  p_transaction JSONB, p_counterpart_id UUID DEFAULT NULL, p_item_id UUID DEFAULT NULL, p_create_entry BOOLEAN DEFAULT true
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  company UUID;
  account UUID := (p_transaction->>'bank_account_id')::uuid;
  amount NUMERIC := (p_transaction->>'valor')::numeric;
  posted DATE := (p_transaction->>'data')::date;
  direction TEXT := p_transaction->>'tipo';
  description TEXT := trim(p_transaction->>'descricao');
  origin TEXT := p_transaction->>'origem';
  statement TEXT := nullif(p_transaction->>'statement_id','');
  fingerprint TEXT := nullif(p_transaction->>'reconciliation_key','');
  category UUID := nullif(p_transaction->>'category_id','')::uuid;
  category_name TEXT := coalesce(nullif(p_transaction->>'categoria',''),'Sem Categoria');
  tx public.bank_transactions%ROWTYPE;
  opposite public.bank_transactions%ROWTYPE;
  group_id UUID;
  entry RECORD;
  source_table TEXT;
  entry_id UUID;
  status_paid TEXT;
  possibilities INTEGER;
  has_financial_candidate BOOLEAN;
BEGIN
  SELECT company_id INTO company FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','manager');
  IF company IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501'; END IF;
  IF amount IS NULL OR amount <= 0 OR amount <> round(amount,2) OR amount::text IN ('NaN','Infinity','-Infinity')
    OR posted IS NULL OR coalesce(description,'')='' OR direction IS NULL OR direction NOT IN ('credito','debito')
    OR origin IS NULL OR origin NOT IN ('csv','ofx') OR fingerprint IS NULL THEN
    RAISE EXCEPTION 'Transação inválida. Confira data, descrição, valor e identificação do extrato.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id=account AND company_id=company)
    OR (p_counterpart_id IS NOT NULL AND (p_counterpart_id=account OR NOT EXISTS
      (SELECT 1 FROM public.bank_accounts WHERE id=p_counterpart_id AND company_id=company))) THEN
    RAISE EXCEPTION 'Conta bancária não pertence à empresa ou origem e destino são iguais.';
  END IF;
  IF category IS NOT NULL THEN
    SELECT nome INTO category_name FROM public.transaction_categories WHERE id=category AND company_id=company;
    IF NOT FOUND THEN RAISE EXCEPTION 'Categoria não pertence à empresa.'; END IF;
  END IF;

  -- Serialização por empresa também protege duas importações das pernas opostas.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(company::text, 86731));
  SELECT * INTO tx FROM public.bank_transactions WHERE company_id=company AND bank_account_id=account
    AND (reconciliation_key=fingerprint OR (statement IS NOT NULL AND statement_id=statement)) FOR UPDATE;
  IF FOUND THEN
    IF tx.data <> posted OR tx.valor <> amount OR tx.tipo <> direction THEN
      RAISE EXCEPTION 'A identificação já existe com data, valor ou sentido diferentes. Revise o extrato.';
    END IF;
    IF p_counterpart_id IS NOT NULL AND (tx.transfer_id IS NULL OR tx.counterpart_account_id IS DISTINCT FROM p_counterpart_id) THEN
      RAISE EXCEPTION 'O lançamento já foi registrado com outro tratamento. Revise o vínculo existente.';
    END IF;
    RETURN jsonb_build_object('id',tx.id,'result','duplicate','transfer_id',tx.transfer_id);
  END IF;

  IF p_counterpart_id IS NOT NULL THEN
    IF p_item_id IS NOT NULL THEN RAISE EXCEPTION 'Transferências não podem quitar receitas ou despesas.'; END IF;
    -- Uma perna criada automaticamente aguarda seu extrato: apenas acrescentar FITID/descrição.
    SELECT * INTO tx FROM public.bank_transactions WHERE company_id=company AND bank_account_id=account
      AND counterpart_account_id=p_counterpart_id AND transfer_id IS NOT NULL
      AND reconciliation_key IS NULL AND statement_id IS NULL AND data=posted AND valor=amount AND tipo=direction
      ORDER BY created_at,id LIMIT 1 FOR UPDATE;
    IF tx.id IS NULL THEN
      SELECT count(*) INTO possibilities FROM public.bank_transactions WHERE company_id=company AND bank_account_id=account
        AND counterpart_account_id=p_counterpart_id AND transfer_id IS NOT NULL
        AND reconciliation_key IS NULL AND statement_id IS NULL AND abs(data-posted)<=3 AND valor=amount AND tipo=direction;
      IF possibilities > 1 THEN RAISE EXCEPTION 'Mais de uma contrapartida com datas próximas. Revise as transferências antes de continuar.'; END IF;
      IF possibilities=1 THEN
        SELECT * INTO tx FROM public.bank_transactions WHERE company_id=company AND bank_account_id=account
          AND counterpart_account_id=p_counterpart_id AND transfer_id IS NOT NULL
          AND reconciliation_key IS NULL AND statement_id IS NULL AND abs(data-posted)<=3 AND valor=amount AND tipo=direction FOR UPDATE;
      END IF;
    END IF;
    IF tx.id IS NOT NULL THEN
      UPDATE public.bank_transactions SET statement_id=statement, reconciliation_key=fingerprint,
        data=posted, descricao=description, origem=origin, status='conciliado' WHERE id=tx.id;
      RETURN jsonb_build_object('id',tx.id,'result','paired','transfer_id',tx.transfer_id);
    END IF;
    -- Transferências antigas feitas na tela Bancos têm duas pernas manuais sem grupo.
    SELECT count(*) INTO possibilities FROM public.bank_transactions WHERE company_id=company AND bank_account_id=account
      AND data=posted AND valor=amount AND tipo=direction AND origem='manual' AND transfer_id IS NULL
      AND categoria IN ('Transferência','Transferência entre contas','Aplicação Financeira','Resgate Aplicação Financeira');
    IF possibilities>1 THEN RAISE EXCEPTION 'Há mais de uma transferência manual correspondente. Revise os movimentos existentes.'; END IF;
    IF possibilities=1 THEN
      SELECT * INTO tx FROM public.bank_transactions WHERE company_id=company AND bank_account_id=account
        AND data=posted AND valor=amount AND tipo=direction AND origem='manual' AND transfer_id IS NULL
        AND categoria IN ('Transferência','Transferência entre contas','Aplicação Financeira','Resgate Aplicação Financeira') FOR UPDATE;
      IF EXISTS(SELECT 1 FROM public.incomes WHERE bank_transaction_id=tx.id)
        OR EXISTS(SELECT 1 FROM public.bills WHERE bank_transaction_id=tx.id)
        OR EXISTS(SELECT 1 FROM public.invoices WHERE bank_transaction_id=tx.id) THEN
        RAISE EXCEPTION 'A transferência antiga possui vínculo financeiro. Revise esse vínculo antes de conciliar, para evitar duplicidade.';
      END IF;
      SELECT count(*) INTO possibilities FROM public.bank_transactions WHERE company_id=company AND bank_account_id=p_counterpart_id
        AND data=posted AND valor=amount AND tipo=CASE WHEN direction='credito' THEN 'debito' ELSE 'credito' END
        AND origem='manual' AND transfer_id IS NULL AND categoria=tx.categoria
        AND NOT EXISTS(SELECT 1 FROM public.incomes WHERE bank_transaction_id=bank_transactions.id)
        AND NOT EXISTS(SELECT 1 FROM public.bills WHERE bank_transaction_id=bank_transactions.id)
        AND NOT EXISTS(SELECT 1 FROM public.invoices WHERE bank_transaction_id=bank_transactions.id);
      IF possibilities<>1 THEN RAISE EXCEPTION 'Confira a contrapartida da transferência manual existente antes de conciliar.'; END IF;
      SELECT * INTO opposite FROM public.bank_transactions WHERE company_id=company AND bank_account_id=p_counterpart_id
        AND data=posted AND valor=amount AND tipo=CASE WHEN direction='credito' THEN 'debito' ELSE 'credito' END
        AND origem='manual' AND transfer_id IS NULL AND categoria=tx.categoria
        AND NOT EXISTS(SELECT 1 FROM public.incomes WHERE bank_transaction_id=bank_transactions.id)
        AND NOT EXISTS(SELECT 1 FROM public.bills WHERE bank_transaction_id=bank_transactions.id)
        AND NOT EXISTS(SELECT 1 FROM public.invoices WHERE bank_transaction_id=bank_transactions.id) FOR UPDATE;
      group_id:=gen_random_uuid();
      UPDATE public.bank_transactions SET transfer_id=group_id,counterpart_account_id=p_counterpart_id,
        categoria='Transferência entre contas',statement_id=statement,reconciliation_key=fingerprint,
        descricao=description,origem=origin,status='conciliado' WHERE id=tx.id;
      UPDATE public.bank_transactions SET transfer_id=group_id,counterpart_account_id=account,
        categoria='Transferência entre contas',status='aguardando_extrato' WHERE id=opposite.id;
      RETURN jsonb_build_object('id',tx.id,'result','paired','transfer_id',group_id);
    END IF;
    -- Vincula também a outra perna se ela foi salva como movimento bancário sem financeiro.
    SELECT * INTO opposite FROM public.bank_transactions WHERE company_id=company AND bank_account_id=p_counterpart_id
      AND data=posted AND valor=amount AND tipo=CASE WHEN direction='credito' THEN 'debito' ELSE 'credito' END
      AND transfer_id IS NULL AND categoria='Transferência entre contas'
      AND NOT EXISTS (SELECT 1 FROM public.incomes WHERE bank_transaction_id=bank_transactions.id)
      AND NOT EXISTS (SELECT 1 FROM public.bills WHERE bank_transaction_id=bank_transactions.id)
      ORDER BY created_at,id LIMIT 1 FOR UPDATE;
    group_id := gen_random_uuid();
    INSERT INTO public.bank_transactions(company_id, bank_account_id, data, descricao, valor, tipo, origem,
      categoria,status,statement_id,reconciliation_key,transfer_id,counterpart_account_id)
    VALUES (company,account,posted,description,amount,direction,origin,'Transferência entre contas','conciliado',
      statement,fingerprint,group_id,p_counterpart_id) RETURNING * INTO tx;
    IF opposite.id IS NOT NULL THEN
      UPDATE public.bank_transactions SET transfer_id=group_id,counterpart_account_id=account WHERE id=opposite.id;
    ELSE
      INSERT INTO public.bank_transactions(company_id,bank_account_id,data,descricao,valor,tipo,origem,categoria,status,transfer_id,counterpart_account_id)
      VALUES(company,p_counterpart_id,posted,'Contrapartida: '||description,amount,
        CASE WHEN direction='credito' THEN 'debito' ELSE 'credito' END,'manual','Transferência entre contas','aguardando_extrato',group_id,account);
    END IF;
    RETURN jsonb_build_object('id',tx.id,'result','transfer','transfer_id',group_id);
  END IF;

  source_table := CASE WHEN direction='credito' THEN 'incomes' ELSE 'bills' END;
  status_paid := CASE WHEN direction='credito' THEN 'recebido' ELSE 'pago' END;
  IF p_item_id IS NOT NULL THEN
    EXECUTE format('SELECT id,valor,status,bank_account_id,bank_transaction_id,category_id,categoria FROM public.%I WHERE id=$1 AND company_id=$2 FOR UPDATE',source_table)
      INTO entry USING p_item_id,company;
    IF entry.id IS NULL OR entry.status IS NULL OR entry.status NOT IN ('pendente','vencido',status_paid)
      OR entry.valor IS DISTINCT FROM amount OR (entry.bank_account_id IS NOT NULL AND entry.bank_account_id <> account) THEN
      RAISE EXCEPTION 'Lançamento indisponível ou incompatível. Atualize a lista e revise a conciliação.';
    END IF;
    category := coalesce(entry.category_id,category);
    category_name := coalesce(nullif(entry.categoria,''),category_name);
    IF entry.bank_transaction_id IS NOT NULL THEN
      SELECT * INTO tx FROM public.bank_transactions WHERE id=entry.bank_transaction_id AND company_id=company FOR UPDATE;
      IF tx.id IS NULL OR tx.origem IS DISTINCT FROM 'manual' OR tx.transfer_id IS NOT NULL OR tx.reconciliation_key IS NOT NULL
        OR tx.valor IS DISTINCT FROM amount OR tx.tipo IS DISTINCT FROM direction OR tx.bank_account_id IS DISTINCT FROM account OR entry.status <> status_paid THEN
        RAISE EXCEPTION 'O lançamento já possui outra conciliação. Revise o vínculo existente.';
      END IF;
    ELSIF entry.status=status_paid THEN
      RAISE EXCEPTION 'Pagamento já registrado sem movimentação bancária correspondente. Revise o lançamento.';
    END IF;
  ELSIF NOT p_create_entry THEN
    RAISE EXCEPTION 'Escolha um lançamento financeiro para conciliar.';
  ELSE
    -- A lista do navegador pode estar desatualizada ou limitada pela paginação.
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I f WHERE company_id=$1 AND valor=$2
      AND (bank_account_id IS NULL OR bank_account_id=$3)
      AND ((status IN (''pendente'',''vencido'') AND bank_transaction_id IS NULL)
        OR (status=$4 AND EXISTS(SELECT 1 FROM public.bank_transactions t WHERE t.id=f.bank_transaction_id
          AND t.company_id=$1 AND t.bank_account_id=$3 AND t.origem=''manual'' AND t.transfer_id IS NULL
          AND abs(t.data-$5)<=7 AND t.valor=$2 AND t.tipo=$6))))',source_table)
      INTO has_financial_candidate USING company,amount,account,status_paid,posted,direction;
    IF has_financial_candidate THEN
      RAISE EXCEPTION 'Existe um lançamento financeiro compatível que precisa de revisão. Atualize a lista e vincule antes de criar outro.';
    END IF;
  END IF;
  IF tx.id IS NOT NULL THEN
    UPDATE public.bank_transactions SET data=posted,descricao=description,origem=origin,categoria=category_name,
      category_id=category,status='conciliado',statement_id=statement,reconciliation_key=fingerprint WHERE id=tx.id RETURNING * INTO tx;
  ELSE
    INSERT INTO public.bank_transactions(company_id,bank_account_id,data,descricao,valor,tipo,origem,categoria,category_id,status,statement_id,reconciliation_key)
      VALUES(company,account,posted,description,amount,direction,origin,category_name,category,'conciliado',statement,fingerprint) RETURNING * INTO tx;
  END IF;
  IF p_item_id IS NOT NULL THEN
    EXECUTE format('UPDATE public.%I SET status=$1,bank_transaction_id=$2,bank_account_id=$3,payment_date=$4,category_id=$5,categoria=$6 WHERE id=$7 AND company_id=$8',source_table)
      USING status_paid,tx.id,account,posted,category,category_name,p_item_id,company;
    entry_id := p_item_id;
  ELSE
    EXECUTE format('INSERT INTO public.%I(company_id,descricao,categoria,category_id,valor,vencimento,status,payment_date,bank_account_id,bank_transaction_id) VALUES($1,$2,$3,$4,$5,$6,$7,$6,$8,$9) RETURNING id',source_table)
      INTO entry_id USING company,description,category_name,category,amount,posted,status_paid,account,tx.id;
  END IF;
  IF direction='credito' THEN
    UPDATE public.invoices SET status='pago',payment_date=posted,bank_account_id=account,bank_transaction_id=tx.id
      WHERE company_id=company AND income_id=entry_id AND status <> 'cancelado';
  END IF;
  RETURN jsonb_build_object('id',tx.id,'result',CASE WHEN p_item_id IS NULL THEN 'created' ELSE 'matched' END,'entry_id',entry_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_reconciled_transfer(p_transfer_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE company UUID;
BEGIN
  SELECT company_id INTO company FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','manager');
  IF company IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(company::text,86731));
  IF NOT EXISTS (SELECT 1 FROM public.bank_transactions WHERE company_id=company AND transfer_id=p_transfer_id) THEN
    RAISE EXCEPTION 'Transferência não encontrada.';
  END IF;
  DELETE FROM public.bank_transactions WHERE company_id=company AND transfer_id=p_transfer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_reconciliation_account(UUID,UUID) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.reconcile_statement_transaction(JSONB,UUID,UUID,BOOLEAN) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.delete_reconciled_transfer(UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_reconciliation_account(UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_statement_transaction(JSONB,UUID,UUID,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_reconciled_transfer(UUID) TO authenticated;
COMMIT;
