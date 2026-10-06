-- Cartão de ponto por funcionário, com até dois períodos de trabalho por dia.
CREATE TABLE IF NOT EXISTS public.time_card_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  entry_1 TIME,
  exit_1 TIME,
  entry_2 TIME,
  exit_2 TIME,
  status TEXT NOT NULL DEFAULT 'trabalho'
    CHECK (status IN ('trabalho', 'falta', 'folga', 'ferias', 'afastamento')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, employee_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_time_card_entries_company_date
  ON public.time_card_entries (company_id, work_date);

CREATE INDEX IF NOT EXISTS idx_time_card_entries_employee_date
  ON public.time_card_entries (employee_id, work_date);

ALTER TABLE public.time_card_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_card_entries TO authenticated;

DROP POLICY IF EXISTS "time_card_entries_select_company" ON public.time_card_entries;
CREATE POLICY "time_card_entries_select_company" ON public.time_card_entries
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "time_card_entries_insert_company" ON public.time_card_entries;
CREATE POLICY "time_card_entries_insert_company" ON public.time_card_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

DROP POLICY IF EXISTS "time_card_entries_update_company" ON public.time_card_entries;
CREATE POLICY "time_card_entries_update_company" ON public.time_card_entries
  FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  )
  WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "time_card_entries_delete_company" ON public.time_card_entries;
CREATE POLICY "time_card_entries_delete_company" ON public.time_card_entries
  FOR DELETE TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );
