ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_id text;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_id_format
  CHECK (display_id IS NULL OR display_id ~ '^[A-Za-z0-9_-]{3,30}$');

CREATE UNIQUE INDEX IF NOT EXISTS profiles_display_id_unique_idx
  ON public.profiles (lower(display_id))
  WHERE display_id IS NOT NULL;