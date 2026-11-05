-- Aplicar antes de supabase_taxa_extra_anual.sql (também em instalações existentes).
BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS data_saida DATE;

CREATE OR REPLACE FUNCTION private.validate_patient_exit()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'ativo' THEN
    NEW.data_saida := NULL;
  ELSIF NEW.status = 'inativo' THEN
    IF NEW.data_saida IS NULL THEN
      RAISE EXCEPTION 'Informe a data de inativação do paciente.';
    END IF;
    IF NEW.data_saida > (now() AT TIME ZONE 'America/Sao_Paulo')::date
      OR NEW.data_saida < NEW.data_entrada THEN
      RAISE EXCEPTION 'A data de inativação deve estar entre a entrada e hoje.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.validate_patient_exit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS validate_patient_exit ON public.patients;
CREATE TRIGGER validate_patient_exit BEFORE INSERT OR UPDATE OF status, data_saida, data_entrada
  ON public.patients FOR EACH ROW EXECUTE FUNCTION private.validate_patient_exit();

CREATE OR REPLACE FUNCTION private.cancel_patient_future_charges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status <> 'inativo' OR NEW.data_saida IS NULL THEN RETURN NEW; END IF;
  -- Somente vínculos explícitos e da mesma empresa. Nunca inferir pelo nome.
  -- Bloqueia as faturas antes das receitas, na mesma ordem usada pela emissão.
  PERFORM 1 FROM public.invoices i
    WHERE i.company_id = NEW.company_id AND i.patient_id = NEW.id
      AND i.due_date > NEW.data_saida ORDER BY i.id FOR UPDATE;
  UPDATE public.incomes r SET status = 'cancelado'
  WHERE r.company_id = NEW.company_id AND r.status IN ('pendente', 'vencido')
    AND r.vencimento > NEW.data_saida AND coalesce(r.valor_pago, 0) = 0
    AND r.payment_date IS NULL AND r.bank_transaction_id IS NULL
    AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.income_id = r.id
      AND i.company_id = NEW.company_id AND i.patient_id = NEW.id
      AND i.due_date > NEW.data_saida AND i.status IN ('pendente', 'cancelado')
      AND coalesce(i.valor_pago, 0) = 0 AND i.payment_date IS NULL AND i.bank_transaction_id IS NULL);
  UPDATE public.invoices i SET status = 'cancelado'
  WHERE i.company_id = NEW.company_id AND i.patient_id = NEW.id
    AND i.due_date > NEW.data_saida AND i.status = 'pendente'
    AND coalesce(i.valor_pago, 0) = 0 AND i.payment_date IS NULL AND i.bank_transaction_id IS NULL
    AND (i.income_id IS NULL OR EXISTS (SELECT 1 FROM public.incomes r
      WHERE r.id = i.income_id AND r.company_id = NEW.company_id AND r.status = 'cancelado'));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.cancel_patient_future_charges() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS cancel_patient_future_charges ON public.patients;
CREATE TRIGGER cancel_patient_future_charges AFTER INSERT OR UPDATE OF status, data_saida
  ON public.patients FOR EACH ROW EXECUTE FUNCTION private.cancel_patient_future_charges();

-- Evita novas cobranças posteriores à saída, inclusive em outra sessão aberta.
-- A fatura e sua receita ficam canceladas. O lote também exclui pacientes inativos.
CREATE OR REPLACE FUNCTION private.guard_inactive_patient_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p RECORD;
BEGIN
  SELECT status, data_saida INTO p FROM public.patients
    WHERE id = NEW.patient_id AND company_id = NEW.company_id FOR UPDATE;
  IF FOUND AND p.status = 'inativo'
    AND NEW.due_date > coalesce(p.data_saida, (now() AT TIME ZONE 'America/Sao_Paulo')::date)
    AND NEW.status = 'pendente' THEN
    -- Cancelar também a receita já criada pelo cliente evita órfãos financeiros.
    IF NEW.income_id IS NOT NULL THEN
      UPDATE public.incomes SET status = 'cancelado'
        WHERE id = NEW.income_id AND company_id = NEW.company_id
          AND status IN ('pendente', 'vencido') AND coalesce(valor_pago, 0) = 0
          AND payment_date IS NULL AND bank_transaction_id IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Não é possível gerar cobrança futura para paciente inativo com receita já recebida.';
      END IF;
    END IF;
    NEW.status := 'cancelado';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_inactive_patient_invoice() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_inactive_patient_invoice ON public.invoices;
CREATE TRIGGER guard_inactive_patient_invoice BEFORE INSERT OR UPDATE OF patient_id, due_date, status, income_id
  ON public.invoices FOR EACH ROW EXECUTE FUNCTION private.guard_inactive_patient_invoice();
COMMIT;
-- Pacientes já inativos sem data não são alterados retroativamente.
-- Editar o cadastro e informar a saída efetiva executa o cancelamento acima.
