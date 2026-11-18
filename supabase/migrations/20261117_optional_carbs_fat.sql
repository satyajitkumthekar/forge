-- Carbs and fat as optional numbers, with four switches per client.
--
-- Logged food and saved-meal items can now hold carbs and fat next to
-- calories and protein. Both are NULLABLE with no default: NULL means
-- "unknown" (logged before the app tracked it, or an estimate that failed),
-- never zero. Nothing that already exists is filled in or changed.
--
-- The single macros_hidden flag becomes four switches per client: calories,
-- protein, carbs, fat. Staff (admin, or the client's coach) flip them from
-- the user table. Defaults are on, on, off, off, so nobody sees a change
-- until a switch is flipped. Like macros_hidden this is a presentation
-- choice, not a security boundary: the client still owns their rows.
-- Clients cannot flip the switches themselves (user_profiles has no
-- self-UPDATE policy).
--
-- macros_hidden stays, always equal to NOT (show_calories AND show_protein),
-- so a copy of the app that only knows the single flag keeps hiding numbers
-- (too many for a short while, never too few).

-- Fail fast instead of queueing behind a long transaction on a live table
SET LOCAL lock_timeout = '5s';

-- ============================================
-- 1. Carbs and fat on logged food and saved-meal items
-- ============================================

ALTER TABLE public.food_entries
  ADD COLUMN IF NOT EXISTS carbs NUMERIC(5,1) CHECK (carbs >= 0),
  ADD COLUMN IF NOT EXISTS fat NUMERIC(5,1) CHECK (fat >= 0);

ALTER TABLE public.meal_items
  ADD COLUMN IF NOT EXISTS carbs NUMERIC(5,1) CHECK (carbs >= 0),
  ADD COLUMN IF NOT EXISTS fat NUMERIC(5,1) CHECK (fat >= 0);

COMMENT ON COLUMN public.food_entries.carbs IS 'Grams. NULL = unknown, never zero-filled';
COMMENT ON COLUMN public.food_entries.fat IS 'Grams. NULL = unknown, never zero-filled';
COMMENT ON COLUMN public.meal_items.carbs IS 'Grams. NULL = unknown, never zero-filled';
COMMENT ON COLUMN public.meal_items.fat IS 'Grams. NULL = unknown, never zero-filled';

-- ============================================
-- 2. Four visibility switches per client
-- ============================================

DO $$
BEGIN
  -- Guarded as one step so a re-run never overwrites switches staff have
  -- flipped since
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_profiles'
      AND column_name = 'show_calories'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD COLUMN show_calories BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN show_protein BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN show_carbs BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN show_fat BOOLEAN NOT NULL DEFAULT FALSE;

    -- Carry today's hide setting across: clients whose numbers are hidden
    -- start with calories and protein off, so nothing changes for them
    UPDATE public.user_profiles
    SET show_calories = FALSE, show_protein = FALSE
    WHERE macros_hidden;
  END IF;
END $$;

-- ============================================
-- FUNCTION: admin_set_macro_visibility (staff for this client)
-- Flips one of the four switches
-- ============================================

CREATE OR REPLACE FUNCTION admin_set_macro_visibility(target_user_id UUID, macro TEXT, visible BOOLEAN)
RETURNS void AS $$
BEGIN
  IF NOT is_staff_for(target_user_id) THEN
    RAISE EXCEPTION 'Not authorized for this user';
  END IF;

  IF visible IS NULL THEN
    RAISE EXCEPTION 'visible must be true or false';
  END IF;

  IF macro = 'calories' THEN
    UPDATE user_profiles SET show_calories = visible WHERE user_id = target_user_id;
  ELSIF macro = 'protein' THEN
    UPDATE user_profiles SET show_protein = visible WHERE user_id = target_user_id;
  ELSIF macro = 'carbs' THEN
    UPDATE user_profiles SET show_carbs = visible WHERE user_id = target_user_id;
  ELSIF macro = 'fat' THEN
    UPDATE user_profiles SET show_fat = visible WHERE user_id = target_user_id;
  ELSE
    RAISE EXCEPTION 'Unknown macro: %', macro;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', target_user_id;
  END IF;

  -- Keep the single flag older copies of the app read in step
  UPDATE user_profiles
  SET macros_hidden = NOT (show_calories AND show_protein)
  WHERE user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION admin_set_macro_visibility(UUID, TEXT, BOOLEAN) TO authenticated;
REVOKE EXECUTE ON FUNCTION admin_set_macro_visibility(UUID, TEXT, BOOLEAN) FROM anon, public;

-- ============================================
-- FUNCTION: admin_set_macros_hidden (the older single switch)
-- Still called by copies of the app that predate the four switches; it now
-- moves calories and protein together so both models agree
-- ============================================

CREATE OR REPLACE FUNCTION admin_set_macros_hidden(target_user_id UUID, new_hidden_value BOOLEAN)
RETURNS void AS $$
BEGIN
  IF NOT is_staff_for(target_user_id) THEN
    RAISE EXCEPTION 'Not authorized for this user';
  END IF;

  UPDATE user_profiles
  SET macros_hidden = new_hidden_value,
      show_calories = NOT new_hidden_value,
      show_protein = NOT new_hidden_value
  WHERE user_id = target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', target_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION admin_set_macros_hidden(UUID, BOOLEAN) TO authenticated;
REVOKE EXECUTE ON FUNCTION admin_set_macros_hidden(UUID, BOOLEAN) FROM anon, public;

-- ============================================
-- FUNCTION: get_user_metrics
-- Expose the four switches to staff. Return shape changes, so drop + recreate
-- (body otherwise identical to 20261020_meal_photos_toggle.sql).
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
  signed_up_at timestamp with time zone,
  coach_id uuid,
  macros_hidden boolean,
  meal_photos_enabled boolean,
  show_calories boolean,
  show_protein boolean,
  show_carbs boolean,
  show_fat boolean
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
    up.meal_photos_enabled,
    up.show_calories,
    up.show_protein,
    up.show_carbs,
    up.show_fat
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

-- Not in this migration, on purpose: admin_publish_anchor_cookbook. Baking
-- carbs and fat into cookbook presets only matters once the cookbook
-- converter produces them, so that function is left exactly as it is and
-- changes together with the converter.
