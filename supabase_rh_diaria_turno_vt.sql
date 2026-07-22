-- Campos adicionais para salário por diária, vale-transporte por dia trabalhado,
-- contrato, dados familiares, escolaridade e horários editáveis do funcionário.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS salario_tipo TEXT DEFAULT 'mensal',
  ADD COLUMN IF NOT EXISTS tipo_contrato TEXT DEFAULT 'autonomo',
  ADD COLUMN IF NOT EXISTS turno_inicio TIME,
  ADD COLUMN IF NOT EXISTS turno_fim TIME,
  ADD COLUMN IF NOT EXISTS estado_civil TEXT,
  ADD COLUMN IF NOT EXISTS nome_conjuge TEXT,
  ADD COLUMN IF NOT EXISTS possui_filhos_menores_14 BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS quantidade_filhos_menores_14 INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grau_escolaridade TEXT,
  ADD COLUMN IF NOT EXISTS situacao_escolaridade TEXT,
  ADD COLUMN IF NOT EXISTS contrato_experiencia TEXT DEFAULT 'nao',
  ADD COLUMN IF NOT EXISTS mei_razao_social TEXT,
  ADD COLUMN IF NOT EXISTS mei_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS mei_inscricao_municipal TEXT,
  ADD COLUMN IF NOT EXISTS mei_endereco TEXT,
  ADD COLUMN IF NOT EXISTS mei_responsavel_nome TEXT,
  ADD COLUMN IF NOT EXISTS mei_responsavel_cpf TEXT,
  ADD COLUMN IF NOT EXISTS mei_responsavel_rg TEXT;

UPDATE employees
SET salario_tipo = 'mensal'
WHERE salario_tipo IS NULL;

UPDATE employees
SET tipo_contrato = 'autonomo'
WHERE tipo_contrato IS NULL;

UPDATE employees
SET possui_filhos_menores_14 = FALSE
WHERE possui_filhos_menores_14 IS NULL;

UPDATE employees
SET quantidade_filhos_menores_14 = 0
WHERE quantidade_filhos_menores_14 IS NULL;

UPDATE employees
SET contrato_experiencia = 'nao'
WHERE contrato_experiencia IS NULL;
