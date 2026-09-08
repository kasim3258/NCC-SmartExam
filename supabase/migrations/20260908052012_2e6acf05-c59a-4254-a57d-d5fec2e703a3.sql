CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid REFERENCES public.exams(id) ON DELETE CASCADE,
  pdf_document_id uuid REFERENCES public.pdf_documents(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_page integer,
  end_page integer,
  page_count integer NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  approved boolean NOT NULL DEFAULT false,
  subject_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX subjects_exam_name_key ON public.subjects (exam_id, lower(name));
CREATE INDEX subjects_pdf_idx ON public.subjects (pdf_document_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
GRANT ALL ON public.subjects TO service_role;

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage subjects" ON public.subjects
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER trg_subjects_updated
  BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.questions
  ADD COLUMN subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL;

CREATE INDEX questions_subject_idx ON public.questions (subject_id);