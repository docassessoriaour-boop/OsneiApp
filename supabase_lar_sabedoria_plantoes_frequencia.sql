-- Campos para o Lar de Convivencia da Sabedoria:
-- salario por pacote de plantoes 12h e valor fixo da hora extra no cadastro.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS valor_hora_extra NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_plantao_12h NUMERIC DEFAULT 0;
