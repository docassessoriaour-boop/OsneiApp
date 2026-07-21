-- Liberacao de acesso - administrador D.O.C. Assessoria
-- Execute no SQL Editor do Supabase.
--
-- Empresa:
--   Nome fantasia: Lar de Convivencia da Sabedoria
--   Razao social: LAR DE CONVIVENCIA DA SABEDORIA LTDA
--   CNPJ: 52.502.750/0001-65
--
-- Antes ou depois deste SQL, confirme em Authentication > Users:
--   Email: docassessoria.our@gmail.com
--   Senha: usar a senha combinada diretamente com o responsavel
--   Email confirmed: sim
--
-- Login no app:
--   CNPJ: 52.502.750/0001-65
--   Email: docassessoria.our@gmail.com

CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  cnpj_digits TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);

DO $$
DECLARE
  target_company_id UUID;
  affected_rows INTEGER;
BEGIN
  SELECT id INTO target_company_id
  FROM public.companies
  WHERE cnpj_digits = '52502750000165'
  ORDER BY created_at NULLS LAST
  LIMIT 1;

  IF target_company_id IS NULL THEN
    INSERT INTO public.companies (name, cnpj, cnpj_digits, active)
    VALUES (
      'Lar de Convivencia da Sabedoria',
      '52.502.750/0001-65',
      '52502750000165',
      TRUE
    )
    RETURNING id INTO target_company_id;
  ELSE
    UPDATE public.companies
    SET
      name = 'Lar de Convivencia da Sabedoria',
      cnpj = '52.502.750/0001-65',
      active = TRUE
    WHERE id = target_company_id;
  END IF;

  IF to_regclass('public.company_info') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.company_info ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id)';

    UPDATE public.company_info
    SET
      nome_fantasia = 'Lar de Convivencia da Sabedoria',
      razao_social = 'LAR DE CONVIVENCIA DA SABEDORIA LTDA',
      endereco = 'Avenida Horacio Soares, 163, Jardim Ouro Verde, Ourinhos (SP)',
      telefone = '',
      email = 'docassessoria.our@gmail.com',
      website = NULL,
      cep = '19906-015',
      company_id = target_company_id
    WHERE cnpj = '52.502.750/0001-65';

    GET DIAGNOSTICS affected_rows = ROW_COUNT;

    IF affected_rows = 0 THEN
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
        'Lar de Convivencia da Sabedoria',
        'LAR DE CONVIVENCIA DA SABEDORIA LTDA',
        '52.502.750/0001-65',
        'Avenida Horacio Soares, 163, Jardim Ouro Verde, Ourinhos (SP)',
        '',
        'docassessoria.our@gmail.com',
        NULL,
        '19906-015',
        target_company_id
      );
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users
    WHERE lower(email) = 'docassessoria.our@gmail.com'
  ) THEN
    INSERT INTO public.profiles (
      id,
      full_name,
      email,
      role,
      company_id
    )
    SELECT
      u.id,
      COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), 'D.O.C. Assessoria'),
      'docassessoria.our@gmail.com',
      'admin',
      target_company_id
    FROM auth.users u
    WHERE lower(u.email) = 'docassessoria.our@gmail.com'
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      role = 'admin',
      company_id = EXCLUDED.company_id;
  ELSE
    RAISE NOTICE 'Empresa criada/liberada. Falta criar docassessoria.our@gmail.com em Authentication > Users e confirmar o email.';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles(company_id);

SELECT
  c.name AS empresa,
  c.cnpj,
  c.active,
  p.email,
  p.full_name,
  p.role
FROM public.companies c
LEFT JOIN public.profiles p
  ON p.company_id = c.id
  AND lower(p.email) = 'docassessoria.our@gmail.com'
WHERE c.cnpj_digits = '52502750000165';
