-- Script para criar as tabelas no Supabase
-- Copie e cole este código no SQL Editor do seu projeto Supabase

-- Tabela de Pacientes
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cpf TEXT UNIQUE NOT NULL,
  idade INTEGER,
  responsavel TEXT,
  telefone_responsavel TEXT,
  status TEXT DEFAULT 'ativo',
  data_entrada DATE,
  observacoes TEXT,
  grau_dependencia TEXT,
  plano_cuidados_data DATE,
  plano_cuidados_responsavel TEXT,
  plano_cuidados_risco_queda TEXT,
  plano_cuidados_risco_lesao TEXT,
  plano_cuidados_higiene TEXT,
  plano_cuidados_mobilidade TEXT,
  plano_cuidados_alimentacao TEXT,
  plano_cuidados_restricoes TEXT,
  plano_cuidados_prioridades TEXT,
  plano_cuidados_metas TEXT,
  plano_cuidados_observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Residencial/Config (para dados da clínica se necessário)
-- CREATE TABLE IF NOT EXISTS clinic_config (...);

-- Tabela de Funcionários
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cpf TEXT UNIQUE NOT NULL,
  cargo TEXT,
  escala TEXT,
  salario NUMERIC,
  status TEXT DEFAULT 'ativo',
  tipo_contrato TEXT DEFAULT 'autonomo',
  tipo_contrato_inicial TEXT,
  data_inicio_clt DATE,
  possui_beneficio_governamental BOOLEAN DEFAULT FALSE,
  mei_razao_social TEXT,
  mei_cnpj TEXT,
  mei_inscricao_municipal TEXT,
  mei_endereco TEXT,
  mei_responsavel_nome TEXT,
  mei_responsavel_cpf TEXT,
  mei_responsavel_rg TEXT,
  data_admissao DATE,
  telefone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Medicamentos dos Pacientes
CREATE TABLE IF NOT EXISTS medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  paciente_nome TEXT,
  medicamento TEXT NOT NULL,
  dosagem TEXT,
  horario TEXT,
  frequencia TEXT,
  observacoes TEXT,
  estoque_atual INTEGER DEFAULT 0,
  estoque_minimo INTEGER DEFAULT 0,
  qtd_por_dose NUMERIC DEFAULT 1,
  unidade_medida TEXT DEFAULT 'comprimido',
  tipo_escala TEXT DEFAULT 'regular',
  dias_semana JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela Base de Medicamentos (Catálogo)
CREATE TABLE IF NOT EXISTS base_medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  dosagem_padrao TEXT,
  unidade_medida_padrao TEXT DEFAULT 'comprimido',
  indicacao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Agendamentos
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  paciente_nome TEXT,
  tipo TEXT,
  data DATE,
  horario TEXT,
  profissional TEXT,
  status TEXT DEFAULT 'agendado',
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Contratos
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  paciente_nome TEXT,
  valor NUMERIC,
  data_inicio DATE,
  data_fim DATE,
  status TEXT DEFAULT 'ativo',
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Contas a Pagar (Bills)
CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao TEXT NOT NULL,
  categoria TEXT,
  valor NUMERIC,
  vencimento DATE,
  status TEXT DEFAULT 'pendente',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Contas a Receber (Incomes)
CREATE TABLE IF NOT EXISTS incomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao TEXT NOT NULL,
  categoria TEXT,
  valor NUMERIC,
  vencimento DATE,
  status TEXT DEFAULT 'pendente',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Estoque (Products)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo TEXT,
  estoque INTEGER DEFAULT 0,
  unidade TEXT,
  fornecedor TEXT,
  estoque_minimo INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Férias
CREATE TABLE IF NOT EXISTS vacations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  funcionario_nome TEXT,
  data_inicio DATE,
  data_fim DATE,
  status TEXT DEFAULT 'agendada',
  salario_base NUMERIC,
  dias_ferias INTEGER,
  dias_abono INTEGER DEFAULT 0,
  valor_ferias NUMERIC,
  valor_terco_constitucional NUMERIC,
  valor_abono_pecuniario NUMERIC,
  valor_terco_abono NUMERIC,
  descontos_inss NUMERIC DEFAULT 0,
  descontos_irrf NUMERIC DEFAULT 0,
  valor_liquido NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Folha de Pagamento
CREATE TABLE IF NOT EXISTS payrolls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  funcionario_nome TEXT,
  cargo TEXT,
  salario_bruto NUMERIC,
  descontos NUMERIC,
  salario_liquido NUMERIC,
  mes_referencia TEXT,
  status TEXT DEFAULT 'pendente',
  periodo_inicio DATE,
  periodo_fim DATE,
  adicionais JSONB DEFAULT '[]',
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Transações Bancárias
CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE,
  descricao TEXT,
  valor NUMERIC,
  tipo TEXT,
  categoria TEXT,
  origem TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Histórico de Entradas de Medicamentos
CREATE TABLE IF NOT EXISTS medication_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id UUID REFERENCES medications(id) ON DELETE CASCADE,
  paciente_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  quantidade NUMERIC NOT NULL,
  responsavel TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Acompanhamentos
CREATE TABLE IF NOT EXISTS patient_companionships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  paciente_nome TEXT,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  nome_acompanhante TEXT,
  tipo TEXT,
  local TEXT,
  responsavel TEXT,
  valor NUMERIC NOT NULL,
  status TEXT DEFAULT 'ativo',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrações financeiras complementares
ALTER TABLE IF EXISTS bank_transactions ADD COLUMN IF NOT EXISTS bank_account_id UUID;
ALTER TABLE IF EXISTS bank_transactions ADD COLUMN IF NOT EXISTS category_id UUID;
ALTER TABLE IF EXISTS bank_transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pago';

ALTER TABLE IF EXISTS bills ADD COLUMN IF NOT EXISTS category_id UUID;
ALTER TABLE IF EXISTS bills ADD COLUMN IF NOT EXISTS payment_date DATE;

ALTER TABLE IF EXISTS schedule_exceptions ADD COLUMN IF NOT EXISTS horas_extras NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS schedule_exceptions ADD COLUMN IF NOT EXISTS valor_hora_extra NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS schedule_exceptions ADD COLUMN IF NOT EXISTS valor_hora_extra_total NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS schedule_exceptions ADD COLUMN IF NOT EXISTS observacoes TEXT;
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS valor_hora_extra NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS valor_plantao_12h NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS bills ADD COLUMN IF NOT EXISTS bank_account_id UUID;
ALTER TABLE IF EXISTS bills ADD COLUMN IF NOT EXISTS bank_transaction_id UUID;
ALTER TABLE IF EXISTS bills ADD COLUMN IF NOT EXISTS destination_bank_account_id UUID;
ALTER TABLE IF EXISTS bills ADD COLUMN IF NOT EXISTS vacation_id UUID;

ALTER TABLE IF EXISTS incomes ADD COLUMN IF NOT EXISTS category_id UUID;
ALTER TABLE IF EXISTS incomes ADD COLUMN IF NOT EXISTS payment_date DATE;
ALTER TABLE IF EXISTS incomes ADD COLUMN IF NOT EXISTS bank_account_id UUID;
ALTER TABLE IF EXISTS incomes ADD COLUMN IF NOT EXISTS bank_transaction_id UUID;
ALTER TABLE IF EXISTS incomes ADD COLUMN IF NOT EXISTS source_bank_account_id UUID;

-- Habilitar RLS (Opcional, mas recomendado)
-- Por enquanto, como você está usando a service_role key, o RLS será ignorado.
-- Mas no futuro, você deve configurar as Policies.
