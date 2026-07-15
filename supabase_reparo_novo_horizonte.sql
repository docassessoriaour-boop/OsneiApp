-- Reparo de acesso e dados - Novo Horizonte Casa dos Idosos
-- Projeto: https://aeaqqhblkhiqegjubszj.supabase.co
-- Execute este arquivo no Supabase > SQL Editor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  cnpj_digits TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);

INSERT INTO public.companies (name, cnpj, cnpj_digits, active)
VALUES ('Novo Horizonte Casa dos Idosos', '56.956.061/0001-81', '56956061000181', TRUE)
ON CONFLICT (cnpj_digits) DO UPDATE SET
  name = EXCLUDED.name,
  cnpj = EXCLUDED.cnpj,
  active = TRUE;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

UPDATE public.profiles
SET
  role = 'admin',
  company_id = (SELECT id FROM public.companies WHERE cnpj_digits = '56956061000181')
WHERE lower(coalesce(email, '')) = 'nhci@docconsultoria.com.br'
   OR full_name ILIKE '%NHCI%'
   OR full_name ILIKE '%Novo Horizonte%';

DO $$
DECLARE
  table_name TEXT;
  company_uuid UUID;
  tables TEXT[] := ARRAY[
    'appointments',
    'bank_accounts',
    'bank_transactions',
    'base_medications',
    'bills',
    'company_info',
    'contracts',
    'curriculums',
    'employees',
    'entities',
    'incomes',
    'invoices',
    'medication_entries',
    'medications',
    'patient_companionships',
    'patient_personal_items',
    'patient_reports',
    'patients',
    'payrolls',
    'product_categories',
    'products',
    'schedule_exceptions',
    'schedule_histories',
    'technical_professionals',
    'terminations',
    'transaction_categories',
    'vacations'
  ];
BEGIN
  SELECT id INTO company_uuid
  FROM public.companies
  WHERE cnpj_digits = '56956061000181';

  FOREACH table_name IN ARRAY tables
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id)', table_name);
      EXECUTE format('UPDATE public.%I SET company_id = $1', table_name)
      USING company_uuid;
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(company_id)', 'idx_' || table_name || '_company_id', table_name);

      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', table_name);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

      EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated select all" ON public.%I', table_name);
      EXECUTE format('DROP POLICY IF EXISTS "Allow manager insert" ON public.%I', table_name);
      EXECUTE format('DROP POLICY IF EXISTS "Allow manager update" ON public.%I', table_name);
      EXECUTE format('DROP POLICY IF EXISTS "Allow manager delete" ON public.%I', table_name);

      EXECUTE format('CREATE POLICY "Allow authenticated select all" ON public.%I FOR SELECT TO authenticated USING (true)', table_name);
      EXECUTE format('CREATE POLICY "Allow manager insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_manager())', table_name);
      EXECUTE format('CREATE POLICY "Allow manager update" ON public.%I FOR UPDATE TO authenticated USING (public.is_manager()) WITH CHECK (public.is_manager())', table_name);
      EXECUTE format('CREATE POLICY "Allow manager delete" ON public.%I FOR DELETE TO authenticated USING (public.is_manager())', table_name);
    END IF;
  END LOOP;
END $$;

GRANT SELECT ON public.companies TO anon, authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow company lookup" ON public.companies;
DROP POLICY IF EXISTS "Allow manager company changes" ON public.companies;
CREATE POLICY "Allow company lookup" ON public.companies
  FOR SELECT TO anon, authenticated
  USING (active = TRUE);
CREATE POLICY "Allow manager company changes" ON public.companies
  FOR ALL TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can do everything on profiles" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles
  FOR SELECT TO anon, authenticated
  USING (true);
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can do everything on profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

COMMIT;

SELECT
  'patients' AS tabela,
  count(*) AS total
FROM public.patients
UNION ALL
SELECT 'employees', count(*) FROM public.employees
UNION ALL
SELECT 'incomes', count(*) FROM public.incomes
UNION ALL
SELECT 'bills', count(*) FROM public.bills
UNION ALL
SELECT 'products', count(*) FROM public.products
UNION ALL
SELECT 'contracts', count(*) FROM public.contracts;
