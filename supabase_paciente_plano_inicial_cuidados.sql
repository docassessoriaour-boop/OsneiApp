ALTER TABLE IF EXISTS public.patients
  ADD COLUMN IF NOT EXISTS grau_dependencia TEXT,
  ADD COLUMN IF NOT EXISTS plano_cuidados_data DATE,
  ADD COLUMN IF NOT EXISTS plano_cuidados_responsavel TEXT,
  ADD COLUMN IF NOT EXISTS plano_cuidados_risco_queda TEXT,
  ADD COLUMN IF NOT EXISTS plano_cuidados_risco_lesao TEXT,
  ADD COLUMN IF NOT EXISTS plano_cuidados_higiene TEXT,
  ADD COLUMN IF NOT EXISTS plano_cuidados_mobilidade TEXT,
  ADD COLUMN IF NOT EXISTS plano_cuidados_alimentacao TEXT,
  ADD COLUMN IF NOT EXISTS plano_cuidados_restricoes TEXT,
  ADD COLUMN IF NOT EXISTS plano_cuidados_prioridades TEXT,
  ADD COLUMN IF NOT EXISTS plano_cuidados_metas TEXT,
  ADD COLUMN IF NOT EXISTS plano_cuidados_observacoes TEXT;
