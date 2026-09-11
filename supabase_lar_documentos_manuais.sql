-- Executar no SQL Editor do Supabase antes de usar a pasta.
-- Tabela independente: não altera cadastros nem documentos de outras empresas.
BEGIN;
CREATE TABLE IF NOT EXISTS public.lar_manual_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  tipo text NOT NULL CHECK (tipo IN ('escala', 'recibo_funcionario', 'recibo_paciente', 'prontuario_funcionario', 'prontuario_paciente', 'contrato_funcionario', 'contrato_paciente')),
  titulo text NOT NULL CHECK (length(trim(titulo)) > 0),
  pessoa text NOT NULL CHECK (length(trim(pessoa)) > 0),
  data_documento date NOT NULL,
  campos jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(campos) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lar_manual_documents_company_created ON public.lar_manual_documents(company_id, created_at DESC);
ALTER TABLE public.lar_manual_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lar_manual_documents_access ON public.lar_manual_documents;
CREATE POLICY lar_manual_documents_access ON public.lar_manual_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p JOIN public.companies c ON c.id = p.company_id
      WHERE p.id = auth.uid() AND p.company_id = lar_manual_documents.company_id
        AND p.role IN ('admin', 'manager') AND c.cnpj_digits = '52502750000165' AND c.active
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p JOIN public.companies c ON c.id = p.company_id
      WHERE p.id = auth.uid() AND p.company_id = lar_manual_documents.company_id
        AND p.role IN ('admin', 'manager') AND c.cnpj_digits = '52502750000165' AND c.active
    )
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lar_manual_documents TO authenticated;
REVOKE ALL ON public.lar_manual_documents FROM anon;
COMMIT;
