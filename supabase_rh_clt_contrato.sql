ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS tipo_contrato_inicial TEXT,
  ADD COLUMN IF NOT EXISTS data_inicio_clt DATE;

UPDATE employees
SET tipo_contrato_inicial = tipo_contrato
WHERE tipo_contrato_inicial IS NULL;
