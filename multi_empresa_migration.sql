-- Multiempresa - executar pelo setor de desenvolvimento no SQL Editor do Supabase.
-- O app não possui tela para cadastrar/liberar CNPJ de empresa.

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  cnpj_digits TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO companies (name, cnpj, cnpj_digits, active)
VALUES ('Residencial Vida Serena Demo', '00.000.000/0001-91', '00000000000191', TRUE)
ON CONFLICT (cnpj_digits) DO UPDATE SET
  name = EXCLUDED.name,
  cnpj = EXCLUDED.cnpj,
  active = TRUE;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

UPDATE profiles
SET company_id = (SELECT id FROM companies WHERE cnpj_digits = '00000000000191')
WHERE company_id IS NULL;

ALTER TABLE profiles
  ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON profiles(company_id);

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
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
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id)', table_name);
      EXECUTE format(
        'UPDATE %I SET company_id = (SELECT id FROM companies WHERE cnpj_digits = %L) WHERE company_id IS NULL',
        table_name,
        '00000000000191'
      );
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(company_id)', 'idx_' || table_name || '_company_id', table_name);
    END IF;
  END LOOP;
END $$;
