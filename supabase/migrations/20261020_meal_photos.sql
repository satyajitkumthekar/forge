-- Meal photos: one picture per meal segment (meal_group_id), so a coach can
-- see what the meal looked like. Display only: never sent to the AI and
-- never touches calories or protein.
--
-- Files live in the private `meal-photos` bucket at {user_id}/{meal_group_id}.jpg
-- (shrunk on the device to ~150 KB). Photos are kept for 7 days: a daily
-- pg_cron job calls the purge-meal-photos edge function, which removes the
-- files through the Storage API (plain SQL can't delete storage files) and
-- then the rows. Clients and the staff RPC also hide anything older than
-- 7 days, so a late purge never shows a stale photo.

-- ============================================
-- TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.meal_photos (
  meal_group_id uuid PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meal_photos_user_date_idx ON public.meal_photos (user_id, entry_date);
CREATE INDEX IF NOT EXISTS meal_photos_created_at_idx ON public.meal_photos (created_at);

ALTER TABLE public.meal_photos ENABLE ROW LEVEL SECURITY;

-- Owner only. The path must be the owner's own file for this meal, so a row
-- can never point at someone else's photo.
CREATE POLICY "Users read own meal photos" ON public.meal_photos
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users add own meal photos" ON public.meal_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = user_id
    AND path = (select auth.uid())::text || '/' || meal_group_id::text || '.jpg'
  );

CREATE POLICY "Users replace own meal photos" ON public.meal_photos
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK (
    (select auth.uid()) = user_id
    AND path = (select auth.uid())::text || '/' || meal_group_id::text || '.jpg'
  );

CREATE POLICY "Users remove own meal photos" ON public.meal_photos
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_photos TO authenticated;

-- ============================================
-- STORAGE BUCKET + POLICIES
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('meal-photos', 'meal-photos', false, 2097152, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;

-- Owner: full control of their own folder
CREATE POLICY "Users read own meal photo files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'meal-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text);

CREATE POLICY "Users upload own meal photo files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'meal-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text);

CREATE POLICY "Users replace own meal photo files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'meal-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text)
  WITH CHECK (bucket_id = 'meal-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text);

CREATE POLICY "Users remove own meal photo files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'meal-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text);

-- Staff: read-only, same gate as food logs (admin = everyone, coach = own clients)
CREATE POLICY "Staff read client meal photo files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'meal-photos' AND public.is_staff_for(((storage.foldername(name))[1])::uuid));

-- ============================================
-- STAFF RPC
-- ============================================

CREATE OR REPLACE FUNCTION public.admin_get_meal_photos(target_user_id uuid, start_date date, end_date date)
RETURNS SETOF meal_photos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_staff_for(target_user_id) THEN
    RAISE EXCEPTION 'Not authorized for this user';
  END IF;

  RETURN QUERY
  SELECT *
  FROM meal_photos
  WHERE user_id = target_user_id
    AND entry_date >= start_date
    AND entry_date <= end_date
    AND created_at > now() - interval '7 days';
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_meal_photos(uuid, date, date) TO authenticated;

-- ============================================
-- 7-DAY PURGE (daily, 3 AM IST = 21:30 UTC)
-- A random shared secret is generated into Vault; the cron job sends it and
-- the edge function checks it through check_meal_photos_purge_secret, so
-- the value never leaves the database.
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'meal_photos_purge_secret') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'meal_photos_purge_secret');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.check_meal_photos_purge_secret(candidate text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'meal_photos_purge_secret' AND decrypted_secret = candidate
  );
$$;

REVOKE ALL ON FUNCTION public.check_meal_photos_purge_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_meal_photos_purge_secret(text) TO service_role;

SELECT cron.schedule(
  'purge-meal-photos',
  '30 21 * * *',
  $$
  SELECT net.http_post(
    url := 'https://latzjmxvpiddypfnovaw.supabase.co/functions/v1/purge-meal-photos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-purge-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'meal_photos_purge_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
