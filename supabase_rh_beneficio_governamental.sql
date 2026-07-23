-- Campo para indicar se o prestador autônomo possui Bolsa Família
-- ou outro benefício governamental.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS possui_beneficio_governamental BOOLEAN DEFAULT FALSE;

UPDATE employees
SET possui_beneficio_governamental = FALSE
WHERE possui_beneficio_governamental IS NULL;
