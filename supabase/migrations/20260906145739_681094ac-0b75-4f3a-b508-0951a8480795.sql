DELETE FROM public.user_roles ur
WHERE ur.role = 'CADET'
  AND EXISTS (
    SELECT 1 FROM public.user_roles s
    WHERE s.user_id = ur.user_id AND s.role IN ('ADMIN','MAIN_ADMIN')
  );