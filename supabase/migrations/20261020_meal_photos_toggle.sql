-- Meal photos are opt-in per client.
--
-- Staff (admin, or the client's coach) switch meal photos on for chosen
-- clients from the user table; off by default. The flag is enforced here,
-- not just hidden in the app: a client without it can't add or replace a
-- photo row or file. Removing stays allowed so switching off never strands
-- a photo the client wants gone. Clients cannot flip it themselves
-- (user_profiles has no self-UPDATE policy).

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS meal_photos_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION meal_photos_enabled_for(target uuid)
RETURNS boolean AS $$
  SELECT COALESCE((SELECT meal_photos_enabled FROM user_profiles WHERE user_id = target), FALSE);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION admin_set_meal_photos_enabled(target_user_id UUID, new_enabled_value BOOLEAN)
RETURNS void AS $$
BEGIN
  IF NOT is_staff_for(target_user_id) THEN
    RAISE EXCEPTION 'Not authorized for this user';
  END IF;

  UPDATE user_profiles SET meal_photos_enabled = new_enabled_value WHERE user_id = target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', target_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION admin_set_meal_photos_enabled(UUID, BOOLEAN) TO authenticated;
REVOKE EXECUTE ON FUNCTION admin_set_meal_photos_enabled(UUID, BOOLEAN) FROM anon, public;

-- Gate adding and replacing on the flag (table rows and storage files)
DROP POLICY IF EXISTS "Users add own meal photos" ON public.meal_photos;
CREATE POLICY "Users add own meal photos" ON public.meal_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = user_id
    AND path = (select auth.uid())::text || '/' || meal_group_id::text || '.jpg'
    AND meal_photos_enabled_for((select auth.uid()))
  );

DROP POLICY IF EXISTS "Users replace own meal photos" ON public.meal_photos;
CREATE POLICY "Users replace own meal photos" ON public.meal_photos
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK (
    (select auth.uid()) = user_id
    AND path = (select auth.uid())::text || '/' || meal_group_id::text || '.jpg'
    AND meal_photos_enabled_for((select auth.uid()))
  );

DROP POLICY IF EXISTS "Users upload own meal photo files" ON storage.objects;
CREATE POLICY "Users upload own meal photo files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'meal-photos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
    AND public.meal_photos_enabled_for((select auth.uid()))
  );

DROP POLICY IF EXISTS "Users replace own meal photo files" ON storage.objects;
CREATE POLICY "Users replace own meal photo files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'meal-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text)
  WITH CHECK (
    bucket_id = 'meal-photos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
    AND public.meal_photos_enabled_for((select auth.uid()))
  );

-- Expose the flag to staff. Return shape changes, so drop + recreate
-- (body otherwise identical to 20261019_hide_macros.sql).
DROP FUNCTION IF EXISTS get_user_metrics();

CREATE FUNCTION get_user_metrics()
RETURNS TABLE(
  user_id uuid,
  email text,
  full_name text,
  user_rank integer,
  account_type text,
  food_logs_count bigint,
  coach_calls_count bigint,
  last_active timestamp with time zone,
  client boolean,
  maintenance_calories integer,
  target_calories integer,
  target_protein integer,
  coach_reminder text,
  timezone text,
  reflections_enabled boolean,
  access_granted boolean,
  signed_up_at timestamp with time zone,
  coach_id uuid,
  macros_hidden boolean,
  meal_photos_enabled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Access denied: staff privileges required';
  END IF;

  RETURN QUERY
  SELECT
    up.user_id,
    au.email::TEXT,
    up.full_name,
    up.user_number as user_rank,
    up.account_type::TEXT,
    COALESCE(fe.food_count, 0) as food_logs_count,
    COALESCE(cc.coach_count, 0) as coach_calls_count,
    up.last_active,
    up.client,
    COALESCE(us.maintenance_calories, 2000) as maintenance_calories,
    COALESCE(us.target_calories, 2000) as target_calories,
    COALESCE(us.target_protein, 150) as target_protein,
    up.coach_reminder,
    us.timezone,
    up.reflections_enabled,
    up.access_granted,
    up.created_at as signed_up_at,
    up.coach_id,
    up.macros_hidden,
    up.meal_photos_enabled
  FROM user_profiles up
  LEFT JOIN auth.users au ON up.user_id = au.id
  LEFT JOIN user_settings us ON up.user_id = us.user_id
  LEFT JOIN (
    SELECT fe_inner.user_id, COUNT(*) as food_count
    FROM food_entries fe_inner
    GROUP BY fe_inner.user_id
  ) fe ON up.user_id = fe.user_id
  LEFT JOIN (
    SELECT aul.user_id, COUNT(*) as coach_count
    FROM api_usage_log aul
    WHERE aul.action_type = 'coach_conversation'
    GROUP BY aul.user_id
  ) cc ON up.user_id = cc.user_id
  WHERE is_admin() OR up.coach_id = auth.uid()
  ORDER BY up.user_number ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION get_user_metrics() TO authenticated;
REVOKE EXECUTE ON FUNCTION get_user_metrics() FROM anon, public;
