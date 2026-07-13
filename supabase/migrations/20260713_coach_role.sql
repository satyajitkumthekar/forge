/**
 * Coach Role Migration
 *
 * Admin sees and does everything, exactly as before. A coach sees and
 * manages ONLY the clients whose user_profiles.coach_id points at them:
 * the weekly grid, day timelines, cookbooks, reflections, macros and the
 * practice toggle. Everything else (access grants, tiers, client flags,
 * coach assignment, deletion, app-wide metrics) stays admin-only.
 *
 * The scoping is enforced server-side in every staff function via
 * is_staff_for(target): admin passes for anyone; a coach passes only for
 * their assigned clients. Demoting a coach instantly voids their reach
 * (the helper re-checks the tier), and deleting a coach unassigns their
 * clients (FK ON DELETE SET NULL).
 *
 * Requires 20260713_add_coach_tier.sql (the enum value) applied first.
 */

-- ============================================
-- COLUMN: user_profiles.coach_id
-- ============================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS coach_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_profiles_coach
  ON user_profiles(coach_id) WHERE coach_id IS NOT NULL;

-- ============================================
-- RATE-LIMIT TRIGGER: coach branch (staff limits).
-- Without this, switching a tier to coach would null the limits.
-- ============================================

CREATE OR REPLACE FUNCTION update_daily_limit_on_tier_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.account_type != OLD.account_type THEN
    NEW.daily_api_limit := CASE NEW.account_type
      WHEN 'basic' THEN 50
      WHEN 'pro' THEN 500
      WHEN 'coach' THEN 999999
      WHEN 'admin' THEN 999999
    END;
    NEW.daily_coach_limit := CASE NEW.account_type
      WHEN 'basic' THEN 10
      WHEN 'pro' THEN 25
      WHEN 'coach' THEN 100
      WHEN 'admin' THEN 100
    END;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================
-- HELPERS
-- ============================================

CREATE OR REPLACE FUNCTION is_coach()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = auth.uid() AND account_type = 'coach'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_staff()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = auth.uid() AND account_type IN ('admin', 'coach')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- The caller is a coach AND the target is assigned to them. Re-checking
-- the tier here means a demoted coach loses reach even if stale
-- assignments linger.
CREATE OR REPLACE FUNCTION coaches_user(target uuid)
RETURNS boolean AS $$
BEGIN
  RETURN is_coach() AND EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = target AND coach_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- The one gate every scoped staff function uses
CREATE OR REPLACE FUNCTION is_staff_for(target uuid)
RETURNS boolean AS $$
BEGIN
  RETURN is_admin() OR coaches_user(target);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- FUNCTION: admin_assign_coach (admin only)
-- ============================================

CREATE OR REPLACE FUNCTION admin_assign_coach(target_user_id UUID, coach_user_id UUID)
RETURNS void AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  IF coach_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = coach_user_id AND account_type = 'coach'
  ) THEN
    RAISE EXCEPTION 'Assignee must hold the coach tier';
  END IF;

  UPDATE user_profiles
  SET coach_id = coach_user_id
  WHERE user_id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', target_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- SCOPED STAFF FUNCTIONS
-- Pattern everywhere: admin = everything, coach = assigned clients only
-- ============================================

-- Food entries for the timelines
CREATE OR REPLACE FUNCTION public.admin_get_user_food_entries(target_user_id uuid, start_date date, end_date date)
RETURNS SETOF food_entries
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
  FROM food_entries
  WHERE user_id = target_user_id
    AND entry_date >= start_date
    AND entry_date <= end_date
  ORDER BY created_at ASC;
END;
$$;

-- Macros
CREATE OR REPLACE FUNCTION public.admin_update_user_macros(target_user_id uuid, maintenance_cal integer, target_cal integer, target_pro integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_staff_for(target_user_id) THEN
    RAISE EXCEPTION 'Not authorized for this user';
  END IF;

  UPDATE user_settings
  SET
    maintenance_calories = maintenance_cal,
    target_calories = target_cal,
    target_protein = target_pro,
    updated_at = NOW()
  WHERE user_id = target_user_id;

  IF NOT FOUND THEN
    INSERT INTO user_settings (user_id, maintenance_calories, target_calories, target_protein)
    VALUES (target_user_id, maintenance_cal, target_cal, target_pro);
  END IF;
END;
$$;

-- Practice toggle
CREATE OR REPLACE FUNCTION admin_toggle_reflections(target_user_id UUID, new_enabled_value BOOLEAN)
RETURNS void AS $$
BEGIN
  IF NOT is_staff_for(target_user_id) THEN
    RAISE EXCEPTION 'Not authorized for this user';
  END IF;

  UPDATE user_profiles
  SET reflections_enabled = new_enabled_value
  WHERE user_id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', target_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Cookbook publish/unpublish: authorize against the cookbook's owner
CREATE OR REPLACE FUNCTION public.admin_publish_anchor_cookbook(p_cookbook_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cookbook anchor_cookbooks%ROWTYPE;
  v_meal JSONB;
  v_item JSONB;
  v_meal_id UUID;
  v_meal_pos INTEGER := 0;
  v_item_pos INTEGER;
BEGIN
  SELECT * INTO v_cookbook FROM anchor_cookbooks WHERE id = p_cookbook_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cookbook not found';
  END IF;

  IF NOT is_staff_for(v_cookbook.user_id) THEN
    RAISE EXCEPTION 'Not authorized for this user';
  END IF;

  UPDATE anchor_cookbooks SET status = 'published' WHERE id = p_cookbook_id;

  DELETE FROM meals WHERE cookbook_id = p_cookbook_id;

  FOR v_meal IN SELECT * FROM jsonb_array_elements(v_cookbook.content->'meals') LOOP
    INSERT INTO meals (user_id, name, is_anchor, cookbook_id, created_by, position)
    VALUES (v_cookbook.user_id, v_meal->>'name', true, p_cookbook_id, auth.uid(), v_meal_pos)
    RETURNING id INTO v_meal_id;

    v_item_pos := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_meal->'ingredients') LOOP
      INSERT INTO meal_items (meal_id, user_id, name, calories, protein, position)
      VALUES (
        v_meal_id,
        v_cookbook.user_id,
        v_item->>'text',
        COALESCE(ROUND((v_item->>'calories')::numeric), 0)::integer,
        COALESCE((v_item->>'protein')::numeric, 0),
        v_item_pos
      );
      v_item_pos := v_item_pos + 1;
    END LOOP;

    v_meal_pos := v_meal_pos + 1;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unpublish_anchor_cookbook(p_cookbook_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
BEGIN
  SELECT user_id INTO v_owner FROM anchor_cookbooks WHERE id = p_cookbook_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cookbook not found';
  END IF;

  IF NOT is_staff_for(v_owner) THEN
    RAISE EXCEPTION 'Not authorized for this user';
  END IF;

  UPDATE anchor_cookbooks SET status = 'draft' WHERE id = p_cookbook_id;
  DELETE FROM meals WHERE cookbook_id = p_cookbook_id;
END;
$$;

-- Reflections: week markers + per-client rows
CREATE OR REPLACE FUNCTION get_week_reflections(p_week_start DATE)
RETURNS TABLE(
  user_id UUID,
  reflection_date DATE,
  status TEXT,
  verdict TEXT
) AS $$
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Access denied: staff privileges required';
  END IF;

  RETURN QUERY
  SELECT dr.user_id, dr.reflection_date, dr.status, dr.verdict
  FROM daily_reflections dr
  WHERE dr.reflection_date >= p_week_start
    AND dr.reflection_date < p_week_start + 7
    AND is_staff_for(dr.user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_client_reflections(p_user_id UUID, p_start DATE, p_end DATE)
RETURNS SETOF daily_reflections AS $$
BEGIN
  IF NOT is_staff_for(p_user_id) THEN
    RAISE EXCEPTION 'Not authorized for this user';
  END IF;

  RETURN QUERY
  SELECT *
  FROM daily_reflections dr
  WHERE dr.user_id = p_user_id
    AND dr.reflection_date BETWEEN p_start AND p_end
  ORDER BY dr.reflection_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- The weekly grid: coaches get only their assigned clients
CREATE OR REPLACE FUNCTION get_coach_analytics(week_start_date date DEFAULT NULL::date, today_date date DEFAULT NULL::date)
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
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Access denied: staff privileges required';
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
      AND (is_admin() OR up.coach_id = auth.uid())
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

-- User metrics: admin gets everyone (+ coach assignments), a coach gets
-- only their clients. Return-shape change (coach_id) = drop + recreate.
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
  coach_id uuid
) AS $$
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
    up.coach_id
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- RLS: coaches manage their clients' cookbooks
-- (Admin ALL policy already exists; policies are permissive, so this adds)
-- ============================================

CREATE POLICY "Coaches manage their clients cookbooks" ON anchor_cookbooks
  FOR ALL
  USING (coaches_user(user_id))
  WITH CHECK (coaches_user(user_id));

-- ============================================
-- GRANTS
-- ============================================

GRANT EXECUTE ON FUNCTION is_coach() TO authenticated;
GRANT EXECUTE ON FUNCTION is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION coaches_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_staff_for(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_assign_coach(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_metrics() TO authenticated;

REVOKE EXECUTE ON FUNCTION admin_assign_coach(UUID, UUID) FROM anon, public;
REVOKE EXECUTE ON FUNCTION get_user_metrics() FROM anon, public;
