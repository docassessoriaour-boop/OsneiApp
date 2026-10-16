-- Modelos administrativos Word e Excel, separados por empresa.
CREATE TABLE IF NOT EXISTS public.administrative_file_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('word', 'excel')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_administrative_file_templates_company ON public.administrative_file_templates(company_id);
ALTER TABLE public.administrative_file_templates ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.administrative_file_templates TO authenticated;

DROP POLICY IF EXISTS "admin_templates_select_company" ON public.administrative_file_templates;
CREATE POLICY "admin_templates_select_company" ON public.administrative_file_templates FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "admin_templates_insert_company" ON public.administrative_file_templates;
CREATE POLICY "admin_templates_insert_company" ON public.administrative_file_templates FOR INSERT TO authenticated
WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "admin_templates_delete_company" ON public.administrative_file_templates;
CREATE POLICY "admin_templates_delete_company" ON public.administrative_file_templates FOR DELETE TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

INSERT INTO storage.buckets (id, name, public) VALUES ('modelos-administrativos', 'modelos-administrativos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "modelos_administrativos_select" ON storage.objects;
CREATE POLICY "modelos_administrativos_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'modelos-administrativos' AND (storage.foldername(name))[1] = (SELECT company_id::text FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "modelos_administrativos_insert" ON storage.objects;
CREATE POLICY "modelos_administrativos_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'modelos-administrativos' AND (storage.foldername(name))[1] = (SELECT company_id::text FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "modelos_administrativos_delete" ON storage.objects;
CREATE POLICY "modelos_administrativos_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'modelos-administrativos' AND (storage.foldername(name))[1] = (SELECT company_id::text FROM public.profiles WHERE id = auth.uid()));
