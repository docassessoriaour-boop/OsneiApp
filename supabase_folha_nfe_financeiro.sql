ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS valor_plantao_12h NUMERIC DEFAULT 0;

ALTER TABLE schedule_exceptions
  ADD COLUMN IF NOT EXISTS tipo_lancamento TEXT DEFAULT 'trabalho';

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS category_id UUID,
  ADD COLUMN IF NOT EXISTS payment_date DATE,
  ADD COLUMN IF NOT EXISTS bank_account_id UUID,
  ADD COLUMN IF NOT EXISTS bank_transaction_id UUID,
  ADD COLUMN IF NOT EXISTS payroll_id UUID,
  ADD COLUMN IF NOT EXISTS termination_id UUID;

CREATE TABLE IF NOT EXISTS nfe_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  access_key TEXT,
  supplier_name TEXT,
  supplier_document TEXT,
  issue_date DATE,
  total_amount NUMERIC DEFAULT 0,
  product_snapshots JSONB DEFAULT '[]',
  bill_ids JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nfe_entries_access_key ON nfe_entries(access_key);
CREATE INDEX IF NOT EXISTS idx_nfe_entries_company_id ON nfe_entries(company_id);
