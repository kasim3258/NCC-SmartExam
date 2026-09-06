
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('MAIN_ADMIN','ADMIN','CADET');
CREATE TYPE public.cadet_category AS ENUM ('NCC B','NCC C');
CREATE TYPE public.difficulty_level AS ENUM ('Easy','Medium','Hard');
CREATE TYPE public.question_source_type AS ENUM ('MANUAL','PDF_EXISTING_QUESTION','AI_GENERATED');
CREATE TYPE public.review_status AS ENUM ('PENDING','APPROVED','REJECTED');
CREATE TYPE public.assignment_status AS ENUM ('assigned','started','completed','expired');
CREATE TYPE public.attempt_status AS ENUM ('in_progress','completed','expired');
CREATE TYPE public.practice_status AS ENUM ('in_progress','completed','abandoned');
CREATE TYPE public.location_event_type AS ENUM ('LOGIN','EXAM_START','EXAM_SUBMIT');
CREATE TYPE public.pdf_status AS ENUM ('UPLOADED','EXTRACTING','ANALYZING','GENERATING','REVIEW','COMPLETED','FAILED');
CREATE TYPE public.concept_priority AS ENUM ('VERY_HIGH','HIGH','NORMAL','LOW');

-- SHARED TRIGGER FN
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  cadet_category public.cadet_category,
  exam_participant BOOLEAN NOT NULL DEFAULT true,
  exam_required BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_profiles_email ON public.profiles (lower(email));
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('ADMIN','MAIN_ADMIN'));
$$;

CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "main admin manages roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'MAIN_ADMIN')) WITH CHECK (public.has_role(auth.uid(),'MAIN_ADMIN'));

CREATE POLICY "read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "staff update profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- SIGNUP TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'CADET')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- EXAMS
CREATE TABLE public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  cadet_category public.cadet_category NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  marks_per_question NUMERIC(6,2) NOT NULL DEFAULT 1 CHECK (marks_per_question > 0),
  negative_mark NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (negative_mark >= 0),
  published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_exams_category ON public.exams(cadet_category);
CREATE INDEX idx_exams_published ON public.exams(published);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exams TO authenticated;
GRANT ALL ON public.exams TO service_role;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_exams_updated BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "staff manage exams" ON public.exams FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- EXAM SECTIONS
CREATE TABLE public.exam_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  section_name TEXT NOT NULL,
  marks_per_question NUMERIC(6,2) NOT NULL DEFAULT 1 CHECK (marks_per_question > 0),
  negative_mark NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (negative_mark >= 0),
  section_order INTEGER NOT NULL DEFAULT 1,
  source_start_page INTEGER,
  source_end_page INTEGER,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sections_exam ON public.exam_sections(exam_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_sections TO authenticated;
GRANT ALL ON public.exam_sections TO service_role;
ALTER TABLE public.exam_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage sections" ON public.exam_sections FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- EXAM ASSIGNMENTS
CREATE TABLE public.exam_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  mandatory BOOLEAN NOT NULL DEFAULT false,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deadline TIMESTAMPTZ,
  status public.assignment_status NOT NULL DEFAULT 'assigned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, exam_id)
);
CREATE INDEX idx_assign_user ON public.exam_assignments(user_id);
CREATE INDEX idx_assign_exam ON public.exam_assignments(exam_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_assignments TO authenticated;
GRANT ALL ON public.exam_assignments TO service_role;
ALTER TABLE public.exam_assignments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_assign_updated BEFORE UPDATE ON public.exam_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "staff manage assignments" ON public.exam_assignments FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "cadet reads own assignments" ON public.exam_assignments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- exams visible to assigned cadets
CREATE POLICY "cadet reads assigned published exams" ON public.exams FOR SELECT TO authenticated
  USING (published AND EXISTS (
    SELECT 1 FROM public.exam_assignments a WHERE a.exam_id = exams.id AND a.user_id = auth.uid()
  ));
CREATE POLICY "cadet reads sections of assigned exams" ON public.exam_sections FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.exam_assignments a JOIN public.exams e ON e.id = a.exam_id
    WHERE a.exam_id = exam_sections.exam_id AND a.user_id = auth.uid() AND e.published
  ));

-- QUESTIONS
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.exam_sections(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_answer CHAR(1) NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
  subject TEXT,
  topic TEXT,
  difficulty public.difficulty_level NOT NULL DEFAULT 'Medium',
  explanation TEXT,
  source_page INTEGER,
  source_section TEXT,
  source_type public.question_source_type NOT NULL DEFAULT 'MANUAL',
  review_status public.review_status NOT NULL DEFAULT 'APPROVED',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  repetition_priority public.concept_priority,
  repetition_count INTEGER NOT NULL DEFAULT 0,
  repetition_evidence JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_q_exam ON public.questions(exam_id);
CREATE INDEX idx_q_section ON public.questions(section_id);
CREATE INDEX idx_q_topic ON public.questions(topic);
CREATE INDEX idx_q_subject ON public.questions(subject);
CREATE INDEX idx_q_review ON public.questions(review_status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_q_updated BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "staff manage questions" ON public.questions FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- EXAM ATTEMPTS
CREATE TABLE public.exam_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  status public.attempt_status NOT NULL DEFAULT 'in_progress',
  total_questions INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  wrong_answers INTEGER NOT NULL DEFAULT 0,
  unanswered INTEGER NOT NULL DEFAULT 0,
  score NUMERIC(8,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_att_user ON public.exam_attempts(user_id);
CREATE INDEX idx_att_exam ON public.exam_attempts(exam_id);
GRANT SELECT, INSERT, UPDATE ON public.exam_attempts TO authenticated;
GRANT ALL ON public.exam_attempts TO service_role;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cadet own attempts" ON public.exam_attempts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "cadet creates own attempt" ON public.exam_attempts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "cadet updates own attempt" ON public.exam_attempts FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- cadets read questions of exams they have an attempt for (answers hidden at app layer)
CREATE POLICY "cadet reads questions of own attempts" ON public.questions FOR SELECT TO authenticated
  USING (review_status = 'APPROVED' AND EXISTS (
    SELECT 1 FROM public.exam_attempts t WHERE t.exam_id = questions.exam_id AND t.user_id = auth.uid()
  ));

-- ANSWERS
CREATE TABLE public.answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_answer CHAR(1) CHECK (selected_answer IN ('A','B','C','D')),
  is_correct BOOLEAN,
  marks_obtained NUMERIC(8,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);
CREATE INDEX idx_ans_attempt ON public.answers(attempt_id);
CREATE INDEX idx_ans_question ON public.answers(question_id);
GRANT SELECT, INSERT, UPDATE ON public.answers TO authenticated;
GRANT ALL ON public.answers TO service_role;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own answers" ON public.answers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exam_attempts t WHERE t.id = answers.attempt_id
    AND (t.user_id = auth.uid() OR public.is_staff(auth.uid()))));
CREATE POLICY "insert own answers" ON public.answers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.exam_attempts t WHERE t.id = answers.attempt_id AND t.user_id = auth.uid()));
CREATE POLICY "update own answers" ON public.answers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exam_attempts t WHERE t.id = answers.attempt_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.exam_attempts t WHERE t.id = answers.attempt_id AND t.user_id = auth.uid()));

-- AI PRACTICE
CREATE TABLE public.ai_practice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.practice_status NOT NULL DEFAULT 'in_progress',
  total_questions INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  wrong_answers INTEGER NOT NULL DEFAULT 0,
  unanswered INTEGER NOT NULL DEFAULT 0,
  score NUMERIC(8,2) NOT NULL DEFAULT 0,
  accuracy NUMERIC(5,2) NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_prac_user ON public.ai_practice_sessions(user_id);
GRANT SELECT, INSERT, UPDATE ON public.ai_practice_sessions TO authenticated;
GRANT ALL ON public.ai_practice_sessions TO service_role;
ALTER TABLE public.ai_practice_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own practice sessions" ON public.ai_practice_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "create own practice session" ON public.ai_practice_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "update own practice session" ON public.ai_practice_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.ai_practice_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.ai_practice_sessions(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  topic TEXT,
  difficulty public.difficulty_level NOT NULL DEFAULT 'Medium',
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_answer CHAR(1) NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
  explanation TEXT,
  selected_answer CHAR(1) CHECK (selected_answer IN ('A','B','C','D')),
  is_correct BOOLEAN,
  marks_obtained NUMERIC(8,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pracq_session ON public.ai_practice_questions(session_id);
GRANT SELECT, INSERT, UPDATE ON public.ai_practice_questions TO authenticated;
GRANT ALL ON public.ai_practice_questions TO service_role;
ALTER TABLE public.ai_practice_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own practice questions" ON public.ai_practice_questions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ai_practice_sessions s WHERE s.id = ai_practice_questions.session_id
    AND (s.user_id = auth.uid() OR public.is_staff(auth.uid()))));
CREATE POLICY "update own practice questions" ON public.ai_practice_questions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ai_practice_sessions s WHERE s.id = ai_practice_questions.session_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ai_practice_sessions s WHERE s.id = ai_practice_questions.session_id AND s.user_id = auth.uid()));

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  notification_type TEXT NOT NULL DEFAULT 'GENERAL',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user ON public.notifications(user_id);
CREATE INDEX idx_notif_read ON public.notifications(is_read);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "update own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "staff create notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

-- LOCATION EVENTS
CREATE TABLE public.location_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
  attempt_id UUID REFERENCES public.exam_attempts(id) ON DELETE SET NULL,
  event_type public.location_event_type NOT NULL,
  latitude DOUBLE PRECISION CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION CHECK (longitude BETWEEN -180 AND 180),
  accuracy DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_loc_user ON public.location_events(user_id);
CREATE INDEX idx_loc_exam ON public.location_events(exam_id);
CREATE INDEX idx_loc_attempt ON public.location_events(attempt_id);
CREATE INDEX idx_loc_type ON public.location_events(event_type);
CREATE INDEX idx_loc_created ON public.location_events(created_at);
GRANT SELECT, INSERT ON public.location_events TO authenticated;
GRANT ALL ON public.location_events TO service_role;
ALTER TABLE public.location_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own location events" ON public.location_events FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "insert own location event" ON public.location_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- PDF DOCUMENTS
CREATE TABLE public.pdf_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT,
  file_size BIGINT NOT NULL DEFAULT 0,
  total_pages INTEGER NOT NULL DEFAULT 0,
  processed_pages INTEGER NOT NULL DEFAULT 0,
  failed_pages INTEGER NOT NULL DEFAULT 0,
  status public.pdf_status NOT NULL DEFAULT 'UPLOADED',
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pdf_exam ON public.pdf_documents(exam_id);
CREATE INDEX idx_pdf_status ON public.pdf_documents(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdf_documents TO authenticated;
GRANT ALL ON public.pdf_documents TO service_role;
ALTER TABLE public.pdf_documents ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_pdf_updated BEFORE UPDATE ON public.pdf_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "staff manage pdfs" ON public.pdf_documents FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- DOCUMENT SECTIONS (AI detected)
ALTER TABLE public.exam_sections
  ADD COLUMN pdf_document_id UUID REFERENCES public.pdf_documents(id) ON DELETE SET NULL,
  ADD COLUMN topics JSONB;
CREATE INDEX idx_sections_pdf ON public.exam_sections(pdf_document_id);

-- HIGH FREQUENCY CONCEPTS
CREATE TABLE public.high_frequency_concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_document_id UUID REFERENCES public.pdf_documents(id) ON DELETE CASCADE,
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
  concept TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count >= 0),
  pages JSONB,
  sections JSONB,
  priority public.concept_priority NOT NULL DEFAULT 'NORMAL',
  source_document TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hfc_pdf ON public.high_frequency_concepts(pdf_document_id);
CREATE INDEX idx_hfc_exam ON public.high_frequency_concepts(exam_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.high_frequency_concepts TO authenticated;
GRANT ALL ON public.high_frequency_concepts TO service_role;
ALTER TABLE public.high_frequency_concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage concepts" ON public.high_frequency_concepts FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
