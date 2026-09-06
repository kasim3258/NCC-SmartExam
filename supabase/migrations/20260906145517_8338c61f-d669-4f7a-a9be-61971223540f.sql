CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role app_role;
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', ''), NEW.email)
  ON CONFLICT (id) DO NOTHING;

  IF EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN
    v_role := 'CADET';
  ELSE
    v_role := 'MAIN_ADMIN';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $function$;

-- Bootstrap: if nobody is a main admin yet, promote the earliest registered account.
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'MAIN_ADMIN'::app_role
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'MAIN_ADMIN')
ORDER BY p.created_at
LIMIT 1
ON CONFLICT DO NOTHING;