-- Histórico imutável e anexos PDF dos contratos de pacientes.
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS numero_contrato TEXT,
  ADD COLUMN IF NOT EXISTS valor_extra NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descricao_extra TEXT,
  ADD COLUMN IF NOT EXISTS contrato_renovado_de UUID REFERENCES public.contracts(id),
  ADD COLUMN IF NOT EXISTS motivo_alteracao TEXT,
  ADD COLUMN IF NOT EXISTS tipo_alteracao TEXT,
  ADD COLUMN IF NOT EXISTS pdf_path TEXT,
  ADD COLUMN IF NOT EXISTS pdf_nome TEXT;

-- Impede alteração silenciosa do conteúdo de um contrato já lançado.
-- Apenas status, motivo/tipo da movimentação e anexo PDF podem mudar.
CREATE OR REPLACE FUNCTION public.bloquear_edicao_contrato_lancado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.paciente_id IS DISTINCT FROM OLD.paciente_id
    OR NEW.paciente_nome IS DISTINCT FROM OLD.paciente_nome
    OR NEW.valor IS DISTINCT FROM OLD.valor
    OR NEW.valor_extra IS DISTINCT FROM OLD.valor_extra
    OR NEW.descricao_extra IS DISTINCT FROM OLD.descricao_extra
    OR NEW.data_inicio IS DISTINCT FROM OLD.data_inicio
    OR NEW.data_fim IS DISTINCT FROM OLD.data_fim
    OR NEW.numero_contrato IS DISTINCT FROM OLD.numero_contrato
    OR NEW.contrato_renovado_de IS DISTINCT FROM OLD.contrato_renovado_de
    OR NEW.observacoes IS DISTINCT FROM OLD.observacoes
  THEN
    RAISE EXCEPTION 'Contrato lançado não pode ser editado; crie uma nova versão.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_edicao_contrato_lancado ON public.contracts;
CREATE TRIGGER trg_bloquear_edicao_contrato_lancado
BEFORE UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.bloquear_edicao_contrato_lancado();

INSERT INTO storage.buckets (id, name, public)
VALUES ('contratos-pdf', 'contratos-pdf', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "contratos_pdf_select" ON storage.objects;
CREATE POLICY "contratos_pdf_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'contratos-pdf'
  AND (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

DROP POLICY IF EXISTS "contratos_pdf_insert" ON storage.objects;
CREATE POLICY "contratos_pdf_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'contratos-pdf'
  AND (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

DROP POLICY IF EXISTS "contratos_pdf_update" ON storage.objects;
CREATE POLICY "contratos_pdf_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'contratos-pdf'
  AND (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'contratos-pdf'
  AND (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
);
