-- Liberação de acesso - Novo Horizonte
-- Execute este roteiro pelo setor de desenvolvimento após multi_empresa_migration.sql.
--
-- Dados:
--   Empresa/CNPJ: Novo Horizonte - 56.956.061/0001-81
--   Usuário: nhci@docconsultoria.com.br
--
-- 1) No Supabase Dashboard, acesse Authentication > Users e crie/atualize:
--      Email: nhci@docconsultoria.com.br
--      Senha: informada diretamente ao setor de desenvolvimento
--      Email confirmed: sim
--
-- 2) Depois execute o SQL abaixo para vincular o usuário à empresa.

INSERT INTO companies (name, cnpj, cnpj_digits, active)
VALUES ('Novo Horizonte', '56.956.061/0001-81', '56956061000181', TRUE)
ON CONFLICT (cnpj_digits) DO UPDATE SET
  name = EXCLUDED.name,
  cnpj = EXCLUDED.cnpj,
  active = TRUE;

UPDATE profiles
SET
  full_name = COALESCE(NULLIF(full_name, ''), 'Novo Horizonte'),
  email = 'nhci@docconsultoria.com.br',
  role = 'admin',
  company_id = (SELECT id FROM companies WHERE cnpj_digits = '56956061000181')
WHERE email = 'nhci@docconsultoria.com.br';

-- Conferência final: deve retornar o usuário com role admin e a empresa Novo Horizonte.
SELECT
  p.email,
  p.role,
  c.name AS empresa,
  c.cnpj
FROM profiles p
JOIN companies c ON c.id = p.company_id
WHERE p.email = 'nhci@docconsultoria.com.br';
