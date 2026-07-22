-- Campos adicionais para salário por diária, vale-transporte por dia trabalhado
-- e horários editáveis do turno no cadastro de funcionários.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS salario_tipo TEXT DEFAULT 'mensal',
  ADD COLUMN IF NOT EXISTS turno_inicio TIME,
  ADD COLUMN IF NOT EXISTS turno_fim TIME;

UPDATE employees
SET salario_tipo = 'mensal'
WHERE salario_tipo IS NULL;
