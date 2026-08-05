-- Campos para lançar horas extras pela tela de Escalas
-- e enviar o valor automaticamente para a Folha de Pagamento.

ALTER TABLE schedule_exceptions
  ADD COLUMN IF NOT EXISTS horas_extras NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_hora_extra NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_hora_extra_total NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observacoes TEXT;
