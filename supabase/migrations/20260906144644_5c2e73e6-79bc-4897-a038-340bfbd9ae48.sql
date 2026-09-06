ALTER TABLE public.ai_practice_sessions ADD COLUMN IF NOT EXISTS topic text;
ALTER TABLE public.ai_practice_questions ADD COLUMN IF NOT EXISTS question_order integer NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_practice_questions_session_order ON public.ai_practice_questions (session_id, question_order);