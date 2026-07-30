ALTER TABLE schedule_exceptions
  ADD COLUMN IF NOT EXISTS is_dobra BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tipo_lancamento TEXT DEFAULT 'trabalho',
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME;

UPDATE schedule_exceptions
SET tipo_lancamento = CASE
  WHEN is_working = FALSE THEN 'falta'
  WHEN COALESCE(is_dobra, FALSE) = TRUE THEN 'plantao_12h'
  ELSE 'trabalho'
END
WHERE tipo_lancamento IS NULL;
