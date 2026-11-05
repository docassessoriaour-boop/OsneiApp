-- Executar no SQL Editor após multi_empresa_migration.sql e supabase_paciente_inativacao.sql.
-- Reaplicar em instalações existentes para corrigir taxas pendentes para valor proporcional.
-- Cláusula 2.3: uma cobrança por paciente ativo/empresa/ano, vencimento 15/12.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS public.annual_minimum_wages (
  year INTEGER PRIMARY KEY CHECK (year BETWEEN 2026 AND 9999),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  source TEXT NOT NULL,
  effective_date DATE NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (extract(year FROM effective_date) = year)
);
ALTER TABLE public.annual_minimum_wages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.annual_minimum_wages FROM anon, authenticated;

-- Decreto 12.797/2025. Nunca utilizar este valor como fallback de outro ano.
INSERT INTO public.annual_minimum_wages (year, amount, source, effective_date)
VALUES (2026, 1621.00,
  'https://www2.camara.leg.br/legin/fed/decret/2025/decreto-12797-23-dezembro-2025-798569-publicacaooriginal-177587-pe.html',
  '2026-01-01')
ON CONFLICT (year) DO NOTHING;

-- Registro independente: excluir/cancelar uma fatura não autoriza outra cobrança.
CREATE TABLE IF NOT EXISTS private.annual_extra_fees (
  company_id UUID NOT NULL REFERENCES public.companies(id),
  patient_id UUID NOT NULL,
  year INTEGER NOT NULL REFERENCES public.annual_minimum_wages(year),
  minimum_wage NUMERIC(12,2) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  income_id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, patient_id, year)
);
REVOKE ALL ON private.annual_extra_fees FROM PUBLIC, anon, authenticated;

-- Regra comercial: 1/12 por mês civil, incluindo os meses de entrada e saída.
-- Ausência da entrada legada considera janeiro; ativo projeta permanência até dezembro.
CREATE OR REPLACE FUNCTION private.annual_fee_months(p_entry DATE, p_exit DATE, p_year INTEGER)
RETURNS INTEGER LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN coalesce(p_entry, make_date(p_year, 1, 1)) > make_date(p_year, 12, 31)
    OR coalesce(p_exit, make_date(p_year, 12, 31)) < make_date(p_year, 1, 1)
    OR (p_entry IS NOT NULL AND p_exit IS NOT NULL AND p_exit < p_entry) THEN 0
    ELSE greatest(0, extract(month FROM least(coalesce(p_exit, make_date(p_year, 12, 31)), make_date(p_year, 12, 31)))::int
      - extract(month FROM greatest(coalesce(p_entry, make_date(p_year, 1, 1)), make_date(p_year, 1, 1)))::int + 1) END;
$$;
REVOKE ALL ON FUNCTION private.annual_fee_months(DATE, DATE, INTEGER) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.generate_annual_extra_fees(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  today DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  current_year INTEGER := extract(year FROM today);
  wage NUMERIC(12,2);
  fee NUMERIC(12,2);
  patient RECORD;
  new_income UUID;
  new_invoice UUID;
  claimed INTEGER;
  generated INTEGER := 0;
  description TEXT;
  months INTEGER;
  existing_fee RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id AND active) THEN
    RAISE EXCEPTION 'Empresa não disponível.';
  END IF;
  SELECT amount INTO wage FROM public.annual_minimum_wages WHERE year = current_year;
  IF wage IS NULL THEN
    RAISE EXCEPTION 'Salário mínimo de % ainda não disponível. A taxa anual será gerada após a atualização oficial.', current_year;
  END IF;
  fee := round(wage / 2, 2);


  FOR patient IN
    SELECT p.id, p.nome, p.cpf, p.resp_cpf, p.data_entrada, p.data_saida FROM public.patients p
    WHERE p.company_id = p_company_id AND p.status = 'ativo'
      AND (p.data_entrada IS NULL OR p.data_entrada <= today)
    ORDER BY p.id FOR UPDATE
  LOOP
    months := private.annual_fee_months(patient.data_entrada, patient.data_saida, current_year);
    fee := round(wage / 2 * months / 12, 2);
    IF months = 0 THEN CONTINUE; END IF;
    description := format('Taxa extra anual %s — cláusula 2.3 — proporcional %s/12 de ½ salário mínimo', current_year, months);
    new_income := gen_random_uuid();
    new_invoice := gen_random_uuid();
    INSERT INTO private.annual_extra_fees
      (company_id, patient_id, year, minimum_wage, amount, income_id, invoice_id)
    VALUES (p_company_id, patient.id, current_year, wage, fee, new_income, new_invoice)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS claimed = ROW_COUNT;
    IF claimed = 0 THEN
      -- Corrige cobranças antigas ainda integralmente pendentes, sem recriar
      -- faturas canceladas/excluídas e sem alterar pagamentos ou recebimentos.
      SELECT f.*, i.id AS linked_invoice, r.id AS linked_income INTO existing_fee
      FROM private.annual_extra_fees f
      JOIN public.invoices i ON i.id = f.invoice_id AND i.company_id = f.company_id
      JOIN public.incomes r ON r.id = f.income_id AND r.company_id = f.company_id
      WHERE f.company_id = p_company_id AND f.patient_id = patient.id AND f.year = current_year
        AND i.income_id = r.id AND i.patient_id = patient.id
        AND i.status = 'pendente' AND r.status IN ('pendente', 'vencido')
        AND coalesce(i.valor_pago, 0) = 0 AND coalesce(r.valor_pago, 0) = 0
        AND i.payment_date IS NULL AND r.payment_date IS NULL
        AND i.bank_transaction_id IS NULL AND r.bank_transaction_id IS NULL
      FOR UPDATE OF f, i, r;
      IF FOUND THEN
        fee := round(existing_fee.minimum_wage / 2 * months / 12, 2);
        UPDATE public.invoices SET total_amount = fee,
          items = jsonb_build_array(jsonb_build_object('description', description, 'quantity', 1, 'price', fee))
          WHERE id = existing_fee.linked_invoice;
        UPDATE public.incomes SET valor = fee, descricao = description || ': ' || patient.nome
          WHERE id = existing_fee.linked_income;
        UPDATE private.annual_extra_fees SET amount = fee
          WHERE company_id = p_company_id AND patient_id = patient.id AND year = current_year;
      END IF;
      CONTINUE;
    END IF;

    INSERT INTO public.incomes (id, company_id, descricao, categoria, valor, vencimento, status)
    VALUES (new_income, p_company_id, description || ': ' || patient.nome,
      'Taxa extra anual', fee, make_date(current_year, 12, 15), 'pendente');
    INSERT INTO public.invoices (id, company_id, patient_id, client_name, client_document,
      date_issued, due_date, total_amount, status, items, income_id)
    VALUES (new_invoice, p_company_id, patient.id, patient.nome,
      coalesce(nullif(patient.cpf, ''), patient.resp_cpf, ''), today,
      make_date(current_year, 12, 15), fee, 'pendente',
      jsonb_build_array(jsonb_build_object('description', description, 'quantity', 1, 'price', fee)), new_income);
    generated := generated + 1;
  END LOOP;
  RETURN jsonb_build_object('year', current_year, 'minimum_wage', wage, 'amount', round(wage / 2, 2),
    'due_date', make_date(current_year, 12, 15), 'generated', generated);
END;
$$;
REVOKE ALL ON FUNCTION private.generate_annual_extra_fees(UUID) FROM PUBLIC, anon, authenticated;

-- RPC sem parâmetros: o cliente não pode escolher outra empresa ou outro ano.
CREATE OR REPLACE FUNCTION public.ensure_annual_extra_fees()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  company UUID;
BEGIN
  SELECT company_id INTO company FROM public.profiles
  WHERE id = auth.uid() AND role IN ('admin', 'manager');
  IF company IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE = '42501'; END IF;
  RETURN private.generate_annual_extra_fees(company);
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_annual_extra_fees() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_annual_extra_fees() TO authenticated;

COMMIT;

-- Agendamento no servidor. A extensão http consulta somente dados públicos do BCB.
-- START SCHEDULER
BEGIN;
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE OR REPLACE FUNCTION private.sync_annual_extra_fees()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  today DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  current_year INTEGER := extract(year FROM today);
  response RECORD;
  observation JSONB;
  observation_date DATE;
  wage NUMERIC(12,2);
  company RECORD;
  source_url TEXT := format('https://api.bcb.gov.br/dados/serie/bcdata.sgs.1619/dados?formato=json&dataInicial=01/01/%s&dataFinal=%s',
    current_year, to_char(today, 'DD/MM/YYYY'));
BEGIN
  -- Atualização diária; rejeita observações de anos anteriores e datas futuras.
  BEGIN
    SELECT status, content INTO response FROM extensions.http_get(source_url);
    IF response.status <> 200 THEN RAISE EXCEPTION 'BCB HTTP %', response.status; END IF;
    SELECT value INTO observation FROM jsonb_array_elements(response.content::jsonb)
    ORDER BY to_date(value->>'data', 'DD/MM/YYYY') DESC LIMIT 1;
    observation_date := to_date(observation->>'data', 'DD/MM/YYYY');
    wage := (observation->>'valor')::numeric;
    IF observation_date IS NULL OR wage IS NULL OR wage <= 0
       OR extract(year FROM observation_date) <> current_year OR observation_date > today THEN
      RAISE EXCEPTION 'Observação do BCB não corresponde ao ano corrente.';
    END IF;
    INSERT INTO public.annual_minimum_wages (year, amount, source, effective_date)
    VALUES (current_year, wage, source_url, observation_date)
    ON CONFLICT (year) DO UPDATE SET amount = EXCLUDED.amount, source = EXCLUDED.source,
      effective_date = EXCLUDED.effective_date, updated_at = now();
  EXCEPTION WHEN OTHERS THEN
    -- Apenas um valor já confirmado para este mesmo ano permite continuar.
    IF NOT EXISTS (SELECT 1 FROM public.annual_minimum_wages WHERE year = current_year) THEN
      RAISE;
    END IF;
    RAISE WARNING 'BCB indisponível; utilizando salário mínimo confirmado de %: %', current_year, SQLERRM;
  END;
  FOR company IN SELECT id FROM public.companies WHERE active ORDER BY id LOOP
    PERFORM private.generate_annual_extra_fees(company.id);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION private.sync_annual_extra_fees() FROM PUBLIC, anon, authenticated;

-- 09:00 UTC = 06:00 de São Paulo. Reexecução diária inclui novos pacientes ativos.
-- schedule com nome é idempotente: reaplicar não cria jobs duplicados.
SELECT cron.schedule('taxa-extra-anual-pacientes', '0 9 * * *',
  'SELECT private.sync_annual_extra_fees();');
COMMIT;
-- END SCHEDULER

-- Gera os lançamentos do ano atual imediatamente, sem aguardar o próximo job.
SELECT private.sync_annual_extra_fees();
