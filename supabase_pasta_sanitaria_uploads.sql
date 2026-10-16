-- Um PDF persistente para cada documento da Pasta Sanitária, separado por empresa.
CREATE TABLE IF NOT EXISTS public.sanitary_document_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_sanitary_document_files_company
  ON public.sanitary_document_files(company_id);

ALTER TABLE public.sanitary_document_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sanitary_files_select_company" ON public.sanitary_document_files;
CREATE POLICY "sanitary_files_select_company" ON public.sanitary_document_files
FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "sanitary_files_insert_company" ON public.sanitary_document_files;
CREATE POLICY "sanitary_files_insert_company" ON public.sanitary_document_files
FOR INSERT TO authenticated
WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "sanitary_files_update_company" ON public.sanitary_document_files;
CREATE POLICY "sanitary_files_update_company" ON public.sanitary_document_files
FOR UPDATE TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

INSERT INTO storage.buckets (id, name, public)
VALUES ('pasta-sanitaria-pdf', 'pasta-sanitaria-pdf', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "pasta_sanitaria_pdf_select" ON storage.objects;
CREATE POLICY "pasta_sanitaria_pdf_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'pasta-sanitaria-pdf'
  AND (storage.foldername(name))[1] = (SELECT company_id::text FROM public.profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "pasta_sanitaria_pdf_insert" ON storage.objects;
CREATE POLICY "pasta_sanitaria_pdf_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'pasta-sanitaria-pdf'
  AND (storage.foldername(name))[1] = (SELECT company_id::text FROM public.profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "pasta_sanitaria_pdf_delete" ON storage.objects;
CREATE POLICY "pasta_sanitaria_pdf_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'pasta-sanitaria-pdf'
  AND (storage.foldername(name))[1] = (SELECT company_id::text FROM public.profiles WHERE id = auth.uid())
);
