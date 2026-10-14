-- Empresa de demonstracao isolada das empresas reais.
--
-- 1. Crie demo@osneiapp.com.br no Supabase Authentication (senha temporaria).
-- 2. Execute este arquivo inteiro no SQL Editor.
-- 3. Entre com o CNPJ 00.000.000/0001-91 e o usuario acima.
--
-- Idempotente: restaura somente os registros ficticios de IDs iniciados por
-- "d" abaixo. Nenhum dado e lido ou copiado de outra empresa.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  name = EXCLUDED.name, cnpj = EXCLUDED.cnpj, active = TRUE;

-- Todas as tabelas da demonstracao recebem o identificador da empresa.
DO $$
DECLARE demo_table TEXT;
BEGIN
  FOREACH demo_table IN ARRAY ARRAY[
    'company_info', 'patients', 'employees', 'medications', 'appointments',
    'contracts', 'products', 'transaction_categories', 'bank_accounts',
    'bills', 'incomes'
  ] LOOP
    IF to_regclass('public.' || demo_table) IS NULL THEN
      RAISE EXCEPTION 'Tabela obrigatoria ausente: %', demo_table;
    END IF;
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id)',
      demo_table
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I(company_id)',
      'idx_' || demo_table || '_company_id', demo_table
    );
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles(company_id);

-- Remove somente a configuracao anterior desta mesma empresa demo. O banco de
-- producao nao possui restricao UNIQUE em company_info.cnpj, portanto o upsert
-- abaixo usa a chave primaria fixa em vez de depender desse campo.
DELETE FROM public.company_info
WHERE company_id = (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')
   OR cnpj = '00.000.000/0001-91';

INSERT INTO public.company_info (
  id, nome_fantasia, razao_social, cnpj, endereco, telefone, email, website,
  cep, configuracoes_adicionais, company_id
)
VALUES (
  'd0000000-0000-4000-8000-000000000001',
  'Residencial Vida Serena Demo', 'RESIDENCIAL VIDA SERENA DEMO LTDA',
  '00.000.000/0001-91', 'Rua das Flores, 100, Centro, Ourinhos (SP)',
  '(14) 3000-0000', 'demo@osneiapp.com.br', 'https://demo.osneiapp.com.br',
  '19900-000', '{"ambiente":"demonstracao","dados":"100% ficticios"}'::jsonb,
  (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')
)
ON CONFLICT (id) DO UPDATE SET
  nome_fantasia = EXCLUDED.nome_fantasia, razao_social = EXCLUDED.razao_social,
  endereco = EXCLUDED.endereco, telefone = EXCLUDED.telefone,
  email = EXCLUDED.email, website = EXCLUDED.website, cep = EXCLUDED.cep,
  configuracoes_adicionais = EXCLUDED.configuracoes_adicionais,
  company_id = EXCLUDED.company_id;

-- Pacientes ficticios. Documentos reservados exclusivamente para demonstracao.
INSERT INTO public.patients (
  id, nome, cpf, rg, idade, data_nascimento, responsavel,
  telefone_responsavel, resp_rg, resp_cpf, resp_endereco, resp_cidade,
  resp_uf, resp_cep, resp_email, status, unidade, data_entrada, observacoes,
  grau_dependencia, company_id
)
VALUES
  ('d1000000-0000-4000-8000-000000000001', 'Helena Duarte (Demo)', '900.000.000-01', 'DEMO-01', 82, '1944-03-12', 'Marina Duarte (Demo)', '(14) 3000-0101', 'DEMO-R01', '910.000.000-01', 'Rua Exemplo, 10', 'Ourinhos', 'SP', '19900-000', 'marina.demo@example.com', 'ativo', 'Vida Serena Demo', CURRENT_DATE - 420, 'Registro inteiramente ficticio.', 'II', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')),
  ('d1000000-0000-4000-8000-000000000002', 'Antonio Ribeiro (Demo)', '900.000.000-02', 'DEMO-02', 77, '1949-07-21', 'Paulo Ribeiro (Demo)', '(14) 3000-0102', 'DEMO-R02', '910.000.000-02', 'Avenida Modelo, 20', 'Ourinhos', 'SP', '19900-000', 'paulo.demo@example.com', 'ativo', 'Vida Serena Demo', CURRENT_DATE - 260, 'Registro inteiramente ficticio.', 'I', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')),
  ('d1000000-0000-4000-8000-000000000003', 'Celia Martins (Demo)', '900.000.000-03', 'DEMO-03', 89, '1937-11-08', 'Luciana Martins (Demo)', '(14) 3000-0103', 'DEMO-R03', '910.000.000-03', 'Praca Ilustrativa, 30', 'Ourinhos', 'SP', '19900-000', 'luciana.demo@example.com', 'ativo', 'Vida Serena Demo', CURRENT_DATE - 95, 'Registro inteiramente ficticio.', 'III', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191'))
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome, status = EXCLUDED.status, unidade = EXCLUDED.unidade,
  observacoes = EXCLUDED.observacoes, company_id = EXCLUDED.company_id;

INSERT INTO public.employees (
  id, nome, cpf, rg, cargo, escala, salario, status, tipo_contrato,
  data_admissao, telefone, email, unidade, turno, company_id
)
VALUES
  ('d2000000-0000-4000-8000-000000000001', 'Ana Souza (Demo)', '920.000.000-01', 'DEMO-F01', 'Cuidadora', '12x36', 2450, 'ativo', 'clt', CURRENT_DATE - 520, '(14) 3000-0201', 'ana.demo@example.com', 'Vida Serena Demo', 'Diurno', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')),
  ('d2000000-0000-4000-8000-000000000002', 'Bruno Lima (Demo)', '920.000.000-02', 'DEMO-F02', 'Cuidador', '12x36', 2450, 'ativo', 'clt', CURRENT_DATE - 410, '(14) 3000-0202', 'bruno.demo@example.com', 'Vida Serena Demo', 'Noturno', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')),
  ('d2000000-0000-4000-8000-000000000003', 'Carla Mendes (Demo)', '920.000.000-03', 'DEMO-F03', 'Enfermeira', '40h', 4800, 'ativo', 'clt', CURRENT_DATE - 680, '(14) 3000-0203', 'carla.demo@example.com', 'Vida Serena Demo', 'Diurno', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')),
  ('d2000000-0000-4000-8000-000000000004', 'Diego Alves (Demo)', '920.000.000-04', 'DEMO-F04', 'Cozinheiro', '40h', 2300, 'ativo', 'clt', CURRENT_DATE - 300, '(14) 3000-0204', 'diego.demo@example.com', 'Vida Serena Demo', 'Diurno', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191'))
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome, cargo = EXCLUDED.cargo, status = EXCLUDED.status,
  unidade = EXCLUDED.unidade, turno = EXCLUDED.turno, company_id = EXCLUDED.company_id;

INSERT INTO public.medications (
  id, paciente_id, paciente_nome, medicamento, dosagem, horario, frequencia,
  observacoes, estoque_atual, estoque_minimo, qtd_por_dose, unidade_medida,
  tipo_escala, dias_semana, company_id
)
VALUES
  ('d3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'Helena Duarte (Demo)', 'Losartana (Demo)', '50 mg', '08:00', '1 vez ao dia', 'Prescricao ficticia.', 30, 10, 1, 'comprimido', 'regular', '[]'::jsonb, (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')),
  ('d3000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'Antonio Ribeiro (Demo)', 'Metformina (Demo)', '500 mg', '08:00,20:00', '2 vezes ao dia', 'Prescricao ficticia.', 48, 14, 1, 'comprimido', 'regular', '[]'::jsonb, (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')),
  ('d3000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000003', 'Celia Martins (Demo)', 'Vitamina D (Demo)', '1.000 UI', '09:00', '1 vez ao dia', 'Prescricao ficticia.', 25, 7, 1, 'capsula', 'regular', '[]'::jsonb, (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191'))
ON CONFLICT (id) DO UPDATE SET
  paciente_nome = EXCLUDED.paciente_nome, medicamento = EXCLUDED.medicamento,
  estoque_atual = EXCLUDED.estoque_atual, company_id = EXCLUDED.company_id;

INSERT INTO public.appointments (
  id, paciente_id, paciente_nome, tipo, data, horario, profissional, status,
  observacoes, company_id
)
VALUES
  ('d4000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'Helena Duarte (Demo)', 'Consulta geriatrica', CURRENT_DATE + 7, '09:30', 'Dra. Laura Campos (Demo)', 'agendado', 'Agendamento ficticio.', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')),
  ('d4000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'Antonio Ribeiro (Demo)', 'Exame de rotina', CURRENT_DATE + 12, '14:00', 'Laboratorio Modelo (Demo)', 'agendado', 'Agendamento ficticio.', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')),
  ('d4000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000003', 'Celia Martins (Demo)', 'Fisioterapia', CURRENT_DATE - 3, '10:00', 'Dr. Rafael Nunes (Demo)', 'realizado', 'Agendamento ficticio.', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191'))
ON CONFLICT (id) DO UPDATE SET
  data = EXCLUDED.data, status = EXCLUDED.status, company_id = EXCLUDED.company_id;

INSERT INTO public.contracts (
  id, paciente_id, paciente_nome, valor, data_inicio, data_fim, status,
  observacoes, company_id
)
VALUES
  ('d5000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'Helena Duarte (Demo)', 4200, CURRENT_DATE - 420, CURRENT_DATE + 310, 'ativo', 'Contrato ficticio.', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')),
  ('d5000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'Antonio Ribeiro (Demo)', 3900, CURRENT_DATE - 260, CURRENT_DATE + 105, 'ativo', 'Contrato ficticio.', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')),
  ('d5000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000003', 'Celia Martins (Demo)', 4600, CURRENT_DATE - 95, CURRENT_DATE + 270, 'ativo', 'Contrato ficticio.', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191'))
ON CONFLICT (id) DO UPDATE SET
  valor = EXCLUDED.valor, status = EXCLUDED.status, company_id = EXCLUDED.company_id;

INSERT INTO public.products (
  id, nome, tipo, estoque, unidade, fornecedor, estoque_minimo, company_id
)
VALUES
  ('d6000000-0000-4000-8000-000000000001', 'Fralda geriatrica G (Demo)', 'higiene', 120, 'unidade', 'Fornecedor Modelo', 40, (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')),
  ('d6000000-0000-4000-8000-000000000002', 'Luva descartavel M (Demo)', 'EPI', 250, 'unidade', 'Fornecedor Modelo', 80, (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')),
  ('d6000000-0000-4000-8000-000000000003', 'Sabonete liquido (Demo)', 'higiene', 18, 'frasco', 'Fornecedor Modelo', 6, (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')),
  ('d6000000-0000-4000-8000-000000000004', 'Leite integral (Demo)', 'alimento', 36, 'litro', 'Fornecedor Modelo', 12, (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191'))
ON CONFLICT (id) DO UPDATE SET
  estoque = EXCLUDED.estoque, estoque_minimo = EXCLUDED.estoque_minimo,
  company_id = EXCLUDED.company_id;

INSERT INTO public.transaction_categories (id, nome, tipo, cor, company_id)
VALUES
  ('d7000000-0000-4000-8000-000000000001', 'Mensalidades (Demo)', 'receita', '#22c55e', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')),
  ('d7000000-0000-4000-8000-000000000002', 'Alimentacao (Demo)', 'despesa', '#f59e0b', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')),
  ('d7000000-0000-4000-8000-000000000003', 'Higiene (Demo)', 'despesa', '#3b82f6', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191'))
ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id;

INSERT INTO public.bank_accounts (
  id, nome, banco, tipo, saldo_inicial, saldo_atual, cor_identificacao, company_id
)
VALUES (
  'd8000000-0000-4000-8000-000000000001', 'Conta demonstracao', 'Banco Ficticio',
  'corrente', 12500, 15680, '#2563eb',
  (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')
)
ON CONFLICT (id) DO UPDATE SET
  saldo_atual = EXCLUDED.saldo_atual, company_id = EXCLUDED.company_id;

INSERT INTO public.bills (
  id, descricao, categoria, category_id, valor, vencimento, status, company_id
)
VALUES
  ('d9000000-0000-4000-8000-000000000001', 'Compra de alimentos (Demo)', 'Alimentacao', 'd7000000-0000-4000-8000-000000000002', 1850, CURRENT_DATE + 5, 'pendente', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')),
  ('d9000000-0000-4000-8000-000000000002', 'Materiais de higiene (Demo)', 'Higiene', 'd7000000-0000-4000-8000-000000000003', 780, CURRENT_DATE - 2, 'pago', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')),
  ('d9000000-0000-4000-8000-000000000003', 'Energia eletrica (Demo)', 'Utilidades', NULL, 1260, CURRENT_DATE + 10, 'pendente', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191'))
ON CONFLICT (id) DO UPDATE SET
  valor = EXCLUDED.valor, vencimento = EXCLUDED.vencimento,
  status = EXCLUDED.status, company_id = EXCLUDED.company_id;

INSERT INTO public.incomes (
  id, descricao, categoria, category_id, valor, vencimento, status, company_id
)
VALUES
  ('da000000-0000-4000-8000-000000000001', 'Mensalidade Helena (Demo)', 'Mensalidades', 'd7000000-0000-4000-8000-000000000001', 4200, CURRENT_DATE - 8, 'recebido', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')),
  ('da000000-0000-4000-8000-000000000002', 'Mensalidade Antonio (Demo)', 'Mensalidades', 'd7000000-0000-4000-8000-000000000001', 3900, CURRENT_DATE + 3, 'pendente', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')),
  ('da000000-0000-4000-8000-000000000003', 'Mensalidade Celia (Demo)', 'Mensalidades', 'd7000000-0000-4000-8000-000000000001', 4600, CURRENT_DATE + 6, 'pendente', (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191'))
ON CONFLICT (id) DO UPDATE SET
  valor = EXCLUDED.valor, vencimento = EXCLUDED.vencimento,
  status = EXCLUDED.status, company_id = EXCLUDED.company_id;

-- O usuario precisa existir antes no Auth. Este UPDATE nao cria nem salva senha.
UPDATE public.profiles
SET full_name = COALESCE(NULLIF(full_name, ''), 'Administrador Demo'),
    role = 'admin', active = TRUE,
    company_id = (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')
WHERE lower(email) = 'demo@osneiapp.com.br';

-- Aborta e desfaz tudo se o usuario ainda nao existir.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(email) = 'demo@osneiapp.com.br'
      AND company_id = (SELECT id FROM public.companies WHERE cnpj_digits = '00000000000191')
  ) THEN
    RAISE EXCEPTION 'Crie demo@osneiapp.com.br no Authentication e execute novamente.';
  END IF;
END $$;

COMMIT;

-- Conferencia final, sempre limitada ao company_id da empresa demo.
SELECT
  c.name AS empresa, c.cnpj, p.email AS usuario,
  (SELECT count(*) FROM public.patients x WHERE x.company_id = c.id) AS pacientes,
  (SELECT count(*) FROM public.employees x WHERE x.company_id = c.id) AS funcionarios,
  (SELECT count(*) FROM public.products x WHERE x.company_id = c.id) AS produtos,
  (SELECT count(*) FROM public.bills x WHERE x.company_id = c.id) AS contas_pagar,
  (SELECT count(*) FROM public.incomes x WHERE x.company_id = c.id) AS contas_receber
FROM public.companies c
JOIN public.profiles p ON p.company_id = c.id
WHERE c.cnpj_digits = '00000000000191';
