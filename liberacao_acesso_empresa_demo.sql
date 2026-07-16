-- Liberacao de acesso - empresa ficticia para demonstracao a clientes.
-- Execute no SQL Editor do Supabase depois de criar o usuario demo no Auth.
-- Dados de acesso sugeridos:
--   Empresa/CNPJ: Residencial Vida Serena Demo - 00.000.000/0001-91
--   E-mail demo: demo@osneiapp.com.br
--
-- Observacao: este roteiro cria uma empresa separada. Ele nao vincula o usuario
-- nem os dados de demonstracao ao CNPJ real da Novo Horizonte.

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
VALUES ('Residencial Vida Serena Demo', '00.000.000/0001-91', '00000000000191', TRUE)
ON CONFLICT (cnpj_digits) DO UPDATE SET
  name = EXCLUDED.name,
  cnpj = EXCLUDED.cnpj,
  active = TRUE;

INSERT INTO public.company_info (
  nome_fantasia,
  razao_social,
  cnpj,
  endereco,
  telefone,
  email,
  website,
  cep,
  company_id
)
VALUES (
  'Residencial Vida Serena Demo',
  'RESIDENCIAL VIDA SERENA DEMO LTDA',
  '00.000.000/0001-91',
  'Rua das Flores, 100, Centro, Ourinhos (SP)',
  '(14) 3000-0000',
  'demo@osneiapp.com.br',
  'https://demo.osneiapp.com.br',
  '19900-000',
  (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')
)
ON CONFLICT (cnpj) DO UPDATE SET
  nome_fantasia = EXCLUDED.nome_fantasia,
  razao_social = EXCLUDED.razao_social,
  endereco = EXCLUDED.endereco,
  telefone = EXCLUDED.telefone,
  email = EXCLUDED.email,
  website = EXCLUDED.website,
  cep = EXCLUDED.cep,
  company_id = EXCLUDED.company_id;

UPDATE public.profiles
SET
  full_name = COALESCE(NULLIF(full_name, ''), 'Usuario Demo'),
  role = COALESCE(role, 'admin'),
  active = TRUE,
  company_id = (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')
WHERE email = 'demo@osneiapp.com.br';

CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles(company_id);

SELECT
  p.email,
  p.full_name,
  p.role,
  c.name AS empresa,
  c.cnpj
FROM public.profiles p
JOIN public.companies c ON c.id = p.company_id
WHERE c.cnpj_digits = '00000000000191';
