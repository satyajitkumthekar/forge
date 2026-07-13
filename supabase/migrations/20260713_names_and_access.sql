/**
 * Full Names + Access List Migration
 *
 * Names: user_profiles.full_name, captured at sign-up (trigger copies it
 * from auth metadata) or via the one-time required popup for existing users
 * (set_my_full_name — users have no direct UPDATE on their profile row).
 *
 * Access: replaces the rank-based waitlist (first N signups get in) with an
 * explicit per-user grant. access_granted defaults FALSE so every future
 * signup waits for the coach. The backfill grants access to exactly the
 * users who pass the OLD rule today, so nobody currently inside gets locked
 * out and the currently-waitlisted users appear as pending.
 *
 * Boot = admin_set_access(false) — the existing app-open gate
 * (check_user_access) sends them to the holding screen on next open.
 * Delete = admin_delete_user — removes the auth account; every app table
 * cascades (verified FK delete rules), refuses self and other admins.
 */

-- ============================================
-- COLUMNS
-- ============================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT NULL;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS access_granted BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================
-- BACKFILL: preserve today's reality exactly.
-- Old rule: signup rank (cumulative count by created_at, ties included)
-- <= system_settings.max_allowed_users.
-- ============================================

WITH ranked AS (
  SELECT
    up.user_id,
    COUNT(*) OVER (ORDER BY up.created_at RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS signup_rank
  FROM user_profiles up
)
UPDATE user_profiles up
SET access_granted = TRUE
FROM ranked r, system_settings s
WHERE up.user_id = r.user_id
  AND s.id = 1
  AND r.signup_rank <= s.max_allowed_users;

-- ============================================
-- TRIGGER: create_user_profile now copies the sign-up name
-- (body otherwise identical to the deployed version)
-- ============================================

CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
BEGIN
  -- Explicitly reference the public schema and copy email + sign-up name
  INSERT INTO public.user_profiles (user_id, user_email, full_name, account_type, daily_api_limit, last_active)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), ''),
    'basic',
    50,
    NOW()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ============================================
-- FUNCTION: set_my_full_name
-- Self-scoped: a user can only ever name themself
-- ============================================

CREATE OR REPLACE FUNCTION set_my_full_name(p_name TEXT)
RETURNS void AS $$
DECLARE
  v_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_name := TRIM(p_name);
  IF v_name IS NULL OR length(v_name) < 2 OR length(v_name) > 80 THEN
    RAISE EXCEPTION 'Name must be between 2 and 80 characters';
  END IF;

  UPDATE user_profiles
  SET full_name = v_name
  WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- FUNCTION: check_user_access (rewritten)
-- The doorman rule: explicit grant, admins always in
-- ============================================

CREATE OR REPLACE FUNCTION check_user_access(user_uuid uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = user_uuid
      AND (access_granted OR account_type = 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- FUNCTION: admin_set_access (grant or boot)
-- ============================================

CREATE OR REPLACE FUNCTION admin_set_access(target_user_id UUID, new_access_value BOOLEAN)
RETURNS void AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  UPDATE user_profiles
  SET access_granted = new_access_value
  WHERE user_id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', target_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- FUNCTION: admin_delete_user (permanent)
-- Deleting the auth account cascades through every app table.
-- Refuses self-deletion and other admins.
-- ============================================

CREATE OR REPLACE FUNCTION admin_delete_user(target_user_id UUID)
RETURNS void AS $$
DECLARE
  v_target_type account_type;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account';
  END IF;

  SELECT up.account_type INTO v_target_type
  FROM user_profiles up
  WHERE up.user_id = target_user_id;

  IF v_target_type = 'admin' THEN
    RAISE EXCEPTION 'Admin accounts cannot be deleted from the panel';
  END IF;

  DELETE FROM auth.users WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', target_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- ============================================
-- FUNCTION: get_user_metrics (recreated with full_name + access_granted)
-- Return-shape change requires DROP + CREATE
-- ============================================

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
  signed_up_at timestamp with time zone
) AS $$
BEGIN
  -- Verify admin
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
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
    up.created_at as signed_up_at
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
  ORDER BY up.user_number ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- FUNCTION: get_coach_analytics (recreated with full_name)
-- Both old overloads dropped; the two-param version the app calls is
-- recreated identically with full_name added.
-- ============================================

DROP FUNCTION IF EXISTS get_coach_analytics(date);
DROP FUNCTION IF EXISTS get_coach_analytics(date, date);

CREATE FUNCTION get_coach_analytics(week_start_date date DEFAULT NULL::date, today_date date DEFAULT NULL::date)
RETURNS TABLE(
  user_id uuid,
  email text,
  full_name text,
  target_calories integer,
  target_protein integer,
  maintenance_calories integer,
  d1_calories integer, d1_protein numeric,
  d2_calories integer, d2_protein numeric,
  d3_calories integer, d3_protein numeric,
  d4_calories integer, d4_protein numeric,
  d5_calories integer, d5_protein numeric,
  d6_calories integer, d6_protein numeric,
  d7_calories integer, d7_protein numeric,
  avg_calories integer,
  avg_protein integer,
  daily_deficit integer,
  weekly_deficit integer,
  days_logged integer
) AS $$
DECLARE
  week_start DATE;
  today DATE;
BEGIN
  -- Verify admin
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  IF today_date IS NULL THEN
    today := CURRENT_DATE;
  ELSE
    today := today_date;
  END IF;

  IF week_start_date IS NULL THEN
    week_start := DATE_TRUNC('week', today) + INTERVAL '1 day';
  ELSE
    week_start := week_start_date;
  END IF;

  RETURN QUERY
  WITH user_settings AS (
    SELECT
      up.user_id as uid,
      au.email::TEXT as user_email,
      up.full_name as user_full_name,
      COALESCE(us.target_calories, 2000) as target_calories,
      COALESCE(us.target_protein, 150) as target_protein,
      COALESCE(us.maintenance_calories, 2000) as maintenance_calories
    FROM user_profiles up
    LEFT JOIN auth.users au ON up.user_id = au.id
    LEFT JOIN user_settings us ON up.user_id = us.user_id
    WHERE up.client = true  -- ONLY SHOW CLIENTS
  ),
  daily_totals AS (
    SELECT
      fe.user_id as uid,
      fe.entry_date as edate,
      SUM(fe.calories) as total_calories,
      SUM(fe.protein) as total_protein
    FROM food_entries fe
    WHERE fe.entry_date >= week_start
      AND fe.entry_date < week_start + INTERVAL '7 days'
    GROUP BY fe.user_id, fe.entry_date
  ),
  -- Pre-calculate the days count to use consistently
  completed_days AS (
    SELECT
      dt.uid,
      COUNT(*) as day_count,
      COALESCE(ROUND(AVG(dt.total_calories)), 0)::INTEGER as avg_cals,
      COALESCE(ROUND(AVG(dt.total_protein)), 0)::INTEGER as avg_prot
    FROM daily_totals dt
    WHERE dt.edate < today
      AND dt.total_calories > 0
    GROUP BY dt.uid
  )
  SELECT
    us.uid,
    us.user_email,
    us.user_full_name,
    us.target_calories,
    us.target_protein,
    us.maintenance_calories,
    COALESCE((SELECT total_calories FROM daily_totals dt WHERE dt.uid = us.uid AND dt.edate = week_start), 0)::INTEGER,
    COALESCE((SELECT total_protein FROM daily_totals dt WHERE dt.uid = us.uid AND dt.edate = week_start), 0),
    COALESCE((SELECT total_calories FROM daily_totals dt WHERE dt.uid = us.uid AND dt.edate = week_start + INTERVAL '1 day'), 0)::INTEGER,
    COALESCE((SELECT total_protein FROM daily_totals dt WHERE dt.uid = us.uid AND dt.edate = week_start + INTERVAL '1 day'), 0),
    COALESCE((SELECT total_calories FROM daily_totals dt WHERE dt.uid = us.uid AND dt.edate = week_start + INTERVAL '2 days'), 0)::INTEGER,
    COALESCE((SELECT total_protein FROM daily_totals dt WHERE dt.uid = us.uid AND dt.edate = week_start + INTERVAL '2 days'), 0),
    COALESCE((SELECT total_calories FROM daily_totals dt WHERE dt.uid = us.uid AND dt.edate = week_start + INTERVAL '3 days'), 0)::INTEGER,
    COALESCE((SELECT total_protein FROM daily_totals dt WHERE dt.uid = us.uid AND dt.edate = week_start + INTERVAL '3 days'), 0),
    COALESCE((SELECT total_calories FROM daily_totals dt WHERE dt.uid = us.uid AND dt.edate = week_start + INTERVAL '4 days'), 0)::INTEGER,
    COALESCE((SELECT total_protein FROM daily_totals dt WHERE dt.uid = us.uid AND dt.edate = week_start + INTERVAL '4 days'), 0),
    COALESCE((SELECT total_calories FROM daily_totals dt WHERE dt.uid = us.uid AND dt.edate = week_start + INTERVAL '5 days'), 0)::INTEGER,
    COALESCE((SELECT total_protein FROM daily_totals dt WHERE dt.uid = us.uid AND dt.edate = week_start + INTERVAL '5 days'), 0),
    COALESCE((SELECT total_calories FROM daily_totals dt WHERE dt.uid = us.uid AND dt.edate = week_start + INTERVAL '6 days'), 0)::INTEGER,
    COALESCE((SELECT total_protein FROM daily_totals dt WHERE dt.uid = us.uid AND dt.edate = week_start + INTERVAL '6 days'), 0),
    COALESCE(cd.avg_cals, 0),
    COALESCE(cd.avg_prot, 0),
    COALESCE(cd.avg_cals, 0) - us.maintenance_calories,
    (COALESCE(cd.avg_cals, 0) - us.maintenance_calories) * COALESCE(cd.day_count, 0)::INTEGER,
    COALESCE(cd.day_count, 0)::INTEGER
  FROM user_settings us
  LEFT JOIN completed_days cd ON cd.uid = us.uid
  ORDER BY us.user_email ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- GRANTS
-- ============================================

GRANT EXECUTE ON FUNCTION set_my_full_name(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_access(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION get_coach_analytics(date, date) TO authenticated;

REVOKE EXECUTE ON FUNCTION set_my_full_name(TEXT) FROM anon, public;
REVOKE EXECUTE ON FUNCTION admin_set_access(UUID, BOOLEAN) FROM anon, public;
REVOKE EXECUTE ON FUNCTION admin_delete_user(UUID) FROM anon, public;
REVOKE EXECUTE ON FUNCTION get_user_metrics() FROM anon, public;
REVOKE EXECUTE ON FUNCTION get_coach_analytics(date, date) FROM anon, public;
