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
  data_admissao DATE,
  telefone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Medicamentos
CREATE TABLE IF NOT EXISTS medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  paciente_nome TEXT,
  medicamento TEXT NOT NULL,
  dosagem TEXT,
  horario TEXT,
  frequencia TEXT,
  observacoes TEXT,
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

-- Habilitar RLS (Opcional, mas recomendado)
-- Por enquanto, como você está usando a service_role key, o RLS será ignorado.
-- Mas no futuro, você deve configurar as Policies.
