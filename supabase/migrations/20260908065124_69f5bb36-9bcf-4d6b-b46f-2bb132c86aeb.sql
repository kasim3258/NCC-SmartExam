
CREATE TYPE public.certificate_level AS ENUM ('B','C','BOTH');
CREATE TYPE public.practice_question_status AS ENUM ('PENDING_REVIEW','APPROVED','REJECTED','DRAFT','ARCHIVED');
CREATE TYPE public.content_import_status AS ENUM ('PENDING','RUNNING','COMPLETED','FAILED','ROLLED_BACK');

CREATE TABLE public.content_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  base_url text NOT NULL,
  source_type text NOT NULL DEFAULT 'WEBSITE',
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_sources TO authenticated;
GRANT ALL ON public.content_sources TO service_role;
ALTER TABLE public.content_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read sources" ON public.content_sources FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff write sources" ON public.content_sources FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff update sources" ON public.content_sources FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Main admin delete sources" ON public.content_sources FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'MAIN_ADMIN'));
CREATE TRIGGER trg_content_sources_updated BEFORE UPDATE ON public.content_sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.content_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_source_id uuid NOT NULL REFERENCES public.content_sources(id) ON DELETE CASCADE,
  started_by uuid REFERENCES auth.users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status content_import_status NOT NULL DEFAULT 'PENDING',
  items_found integer NOT NULL DEFAULT 0,
  questions_found integer NOT NULL DEFAULT 0,
  questions_approved integer NOT NULL DEFAULT 0,
  questions_rejected integer NOT NULL DEFAULT 0,
  duplicates_found integer NOT NULL DEFAULT 0,
  subjects_found integer NOT NULL DEFAULT 0,
  topics_found integer NOT NULL DEFAULT 0,
  blocked_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  log jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_imports TO authenticated;
GRANT ALL ON public.content_imports TO service_role;
ALTER TABLE public.content_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read imports" ON public.content_imports FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff write imports" ON public.content_imports FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff update imports" ON public.content_imports FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Main admin delete imports" ON public.content_imports FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'MAIN_ADMIN'));
CREATE INDEX idx_content_imports_source ON public.content_imports(content_source_id, started_at DESC);
CREATE TRIGGER trg_content_imports_updated BEFORE UPDATE ON public.content_imports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.practice_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wing text NOT NULL DEFAULT 'ARMY',
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX practice_subjects_wing_name_key ON public.practice_subjects(wing, lower(name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_subjects TO authenticated;
GRANT ALL ON public.practice_subjects TO service_role;
ALTER TABLE public.practice_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in reads practice subjects" ON public.practice_subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff write practice subjects" ON public.practice_subjects FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff update practice subjects" ON public.practice_subjects FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Main admin delete practice subjects" ON public.practice_subjects FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'MAIN_ADMIN'));
CREATE TRIGGER trg_practice_subjects_updated BEFORE UPDATE ON public.practice_subjects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.practice_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.practice_subjects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX practice_topics_subject_name_key ON public.practice_topics(subject_id, lower(name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_topics TO authenticated;
GRANT ALL ON public.practice_topics TO service_role;
ALTER TABLE public.practice_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in reads practice topics" ON public.practice_topics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff write practice topics" ON public.practice_topics FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff update practice topics" ON public.practice_topics FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Main admin delete practice topics" ON public.practice_topics FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'MAIN_ADMIN'));
CREATE TRIGGER trg_practice_topics_updated BEFORE UPDATE ON public.practice_topics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.practice_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wing text NOT NULL DEFAULT 'ARMY',
  certificate_level certificate_level NOT NULL DEFAULT 'BOTH',
  subject_id uuid REFERENCES public.practice_subjects(id) ON DELETE SET NULL,
  topic_id uuid REFERENCES public.practice_topics(id) ON DELETE SET NULL,
  question_text text NOT NULL,
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text NOT NULL,
  option_d text NOT NULL,
  correct_answer char(1),
  explanation text,
  difficulty difficulty_level NOT NULL DEFAULT 'Medium',
  repetition_count integer NOT NULL DEFAULT 1,
  source_type text NOT NULL DEFAULT 'EXTERNAL',
  source_name text,
  source_url text,
  source_reference text,
  content_hash text NOT NULL,
  status practice_question_status NOT NULL DEFAULT 'PENDING_REVIEW',
  needs_review boolean NOT NULL DEFAULT true,
  ai_confidence numeric,
  import_id uuid REFERENCES public.content_imports(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX practice_questions_hash_key ON public.practice_questions(content_hash);
CREATE INDEX idx_practice_questions_lookup ON public.practice_questions(wing, certificate_level, status, subject_id);
CREATE INDEX idx_practice_questions_topic ON public.practice_questions(topic_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_questions TO authenticated;
GRANT ALL ON public.practice_questions TO service_role;
ALTER TABLE public.practice_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read all practice questions" ON public.practice_questions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Cadets read approved practice questions" ON public.practice_questions FOR SELECT TO authenticated USING (status = 'APPROVED');
CREATE POLICY "Staff write practice questions" ON public.practice_questions FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff update practice questions" ON public.practice_questions FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Main admin delete practice questions" ON public.practice_questions FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'MAIN_ADMIN'));
CREATE TRIGGER trg_practice_questions_updated BEFORE UPDATE ON public.practice_questions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.question_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.practice_questions(id) ON DELETE CASCADE,
  source_name text NOT NULL,
  source_url text,
  source_reference text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_question_sources_question ON public.question_sources(question_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_sources TO authenticated;
GRANT ALL ON public.question_sources TO service_role;
ALTER TABLE public.question_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read question sources" ON public.question_sources FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff write question sources" ON public.question_sources FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff update question sources" ON public.question_sources FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Main admin delete question sources" ON public.question_sources FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'MAIN_ADMIN'));

CREATE TABLE public.content_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid REFERENCES public.practice_questions(id) ON DELETE CASCADE,
  reviewer_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  notes text,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_content_reviews_question ON public.content_reviews(question_id, reviewed_at DESC);
GRANT SELECT, INSERT ON public.content_reviews TO authenticated;
GRANT ALL ON public.content_reviews TO service_role;
ALTER TABLE public.content_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read reviews" ON public.content_reviews FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff write reviews" ON public.content_reviews FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  object_type text,
  object_id uuid,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_audit_created ON public.admin_audit_log(created_at DESC);
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read audit log" ON public.admin_audit_log FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff write audit log" ON public.admin_audit_log FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
