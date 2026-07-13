/**
 * Daily Reflections Migration (Next-Day Reflection, Stage 1)
 *
 * A reflection is one row per user per reflected day. Rows are born ONLY via
 * the start_daily_reflection() RPC, which computes the pass/fail verdict
 * server-side from food_entries vs. user_settings — clients can never write
 * the gate snapshot. Answers are then filled in by the client through
 * RLS-guarded, column-restricted UPDATEs, so the row itself is the saved
 * progress (resume after interruption is free).
 *
 * SECURITY: verdict/totals are tamper-proof via column-level grants; the
 * practice is opt-in per client (user_profiles.reflections_enabled, default
 * OFF) and admin-toggled only.
 */

-- ============================================
-- COLUMN: user_profiles.reflections_enabled
-- The per-client practice switch. Default OFF for everyone.
-- ============================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS reflections_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================
-- TABLE: daily_reflections
-- ============================================

CREATE TABLE daily_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reflection_date DATE NOT NULL,  -- the day being reflected ON (yesterday)

  -- Gate snapshot: written server-side, never grantable to clients
  total_calories INTEGER NOT NULL,
  total_protein NUMERIC(6,1) NOT NULL,
  target_calories INTEGER NOT NULL,
  maintenance_calories INTEGER NOT NULL,
  target_protein INTEGER NOT NULL,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('cut', 'maintenance', 'bulk')),
  verdict TEXT NOT NULL CHECK (verdict IN ('success', 'fail_calories', 'fail_protein', 'fail_both')),
  suspicious_low BOOLEAN NOT NULL DEFAULT FALSE,  -- logged far below target at creation

  -- Lifecycle:
  --   pending      row created, nothing answered (verdict may still recompute)
  --   in_progress  first answer saved (verdict frozen from here on)
  --   completed    flow finished
  --   incomplete   pre-check answered "didn't log everything" (terminal)
  --   missed       expired by a newer day's reflection
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'incomplete', 'missed')),

  -- Structured answers the coach filters/counts on
  path TEXT NULL CHECK (path IN ('smooth', 'moments', 'couldnt', 'wouldnt')),
  fail_reason TEXT NULL CHECK (fail_reason IN ('didnt_know', 'no_time_access', 'outside_control')),
  heard_before BOOLEAN NULL,      -- wouldn't path: "heard that voice before?"
  showed_up BOOLEAN NULL,         -- fail part 2: "was there a moment you showed up?"
  logging_complete BOOLEAN NULL,  -- pre-check answer (asked only when suspicious_low)

  -- Free-text answers keyed by step id; current_step is the resume point
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_step TEXT NULL,

  started_at TIMESTAMPTZ NULL,    -- first answer saved = verdict freeze moment
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, reflection_date)
);

-- Coach-side week queries scan by date across all clients
CREATE INDEX idx_daily_reflections_date ON daily_reflections(reflection_date);

CREATE TRIGGER update_daily_reflections_updated_at
  BEFORE UPDATE ON daily_reflections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS + GRANTS
-- Clients: SELECT own rows; UPDATE own rows only while live
-- (pending/in_progress), and only the answer/progress columns.
-- No INSERT/DELETE — rows are born via the RPC, removed via the reset RPC.
-- ============================================

ALTER TABLE daily_reflections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own reflections" ON daily_reflections
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users update own live reflections" ON daily_reflections
  FOR UPDATE
  USING (user_id = auth.uid() AND status IN ('pending', 'in_progress'))
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON daily_reflections FROM anon, authenticated;
GRANT SELECT ON daily_reflections TO authenticated;
GRANT UPDATE (
  status, path, fail_reason, heard_before, showed_up, logging_complete,
  answers, current_step, started_at, completed_at
) ON daily_reflections TO authenticated;

-- ============================================
-- FUNCTION: start_daily_reflection
-- Get-or-create the caller's reflection for a date, computing the verdict
-- server-side. SECURITY DEFINER is safe here: no target-user parameter,
-- everything is scoped to auth.uid().
-- The client passes the date because the 3 AM day boundary is a client-local
-- convention (utils/date.ts appToday()); the server sanity-checks it.
-- ============================================

CREATE OR REPLACE FUNCTION start_daily_reflection(p_reflection_date DATE)
RETURNS SETOF daily_reflections AS $$
DECLARE
  uid UUID;
  v_enabled BOOLEAN;
  v_existing daily_reflections%ROWTYPE;
  v_has_row BOOLEAN := FALSE;
  v_total_cal INTEGER;
  v_total_pro NUMERIC;
  v_target_cal INTEGER;
  v_maint_cal INTEGER;
  v_target_pro INTEGER;
  v_goal TEXT;
  v_cal_pass BOOLEAN;
  v_pro_pass BOOLEAN;
  v_verdict TEXT;
  v_suspicious BOOLEAN;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RETURN;
  END IF;

  -- Generous enough for any timezone skew, tight enough to block nonsense
  IF p_reflection_date < CURRENT_DATE - 3 OR p_reflection_date > CURRENT_DATE + 1 THEN
    RETURN;
  END IF;

  -- The practice is opt-in: coaching client AND switched on
  SELECT (up.client AND up.reflections_enabled) INTO v_enabled
  FROM user_profiles up
  WHERE up.user_id = uid;

  IF NOT COALESCE(v_enabled, FALSE) THEN
    RETURN;
  END IF;

  -- Expiry sweep, always: only the latest day is ever reflected on
  UPDATE daily_reflections
  SET status = 'missed'
  WHERE user_id = uid
    AND reflection_date < p_reflection_date
    AND status IN ('pending', 'in_progress');

  SELECT * INTO v_existing
  FROM daily_reflections
  WHERE user_id = uid AND reflection_date = p_reflection_date;
  v_has_row := FOUND;

  -- Anything past pending is frozen — return as-is
  IF v_has_row AND v_existing.status <> 'pending' THEN
    RETURN QUERY SELECT * FROM daily_reflections WHERE id = v_existing.id;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(fe.calories), 0)::INTEGER, COALESCE(SUM(fe.protein), 0)
  INTO v_total_cal, v_total_pro
  FROM food_entries fe
  WHERE fe.user_id = uid AND fe.entry_date = p_reflection_date;

  -- Unlogged day: no reflection. A pending row whose entries were since
  -- deleted goes away with it.
  IF v_total_cal <= 0 THEN
    IF v_has_row THEN
      DELETE FROM daily_reflections WHERE id = v_existing.id;
    END IF;
    RETURN;
  END IF;

  SELECT us.target_calories, us.maintenance_calories, us.target_protein
  INTO v_target_cal, v_maint_cal, v_target_pro
  FROM user_settings us
  WHERE us.user_id = uid;

  -- A coaching client always has coach-set targets; a verdict against
  -- defaults would be noise
  IF NOT FOUND OR COALESCE(v_target_cal, 0) <= 0 OR COALESCE(v_target_pro, 0) <= 0 THEN
    RETURN;
  END IF;

  -- The gate. Buffer = 5% of target (matches the app's wrong-side colour
  -- band); protein floor is the target itself, strict.
  v_goal := CASE
    WHEN v_target_cal < v_maint_cal THEN 'cut'
    WHEN v_target_cal > v_maint_cal THEN 'bulk'
    ELSE 'maintenance'
  END;
  v_cal_pass := CASE
    WHEN v_goal = 'cut' THEN v_total_cal <= v_target_cal * 1.05  -- ceiling on a cut
    ELSE v_total_cal >= v_target_cal * 0.95                      -- floor otherwise
  END;
  v_pro_pass := v_total_pro >= v_target_pro;
  v_verdict := CASE
    WHEN v_cal_pass AND v_pro_pass THEN 'success'
    WHEN NOT v_cal_pass AND NOT v_pro_pass THEN 'fail_both'
    WHEN NOT v_cal_pass THEN 'fail_calories'
    ELSE 'fail_protein'
  END;
  -- SUSPICIOUS_LOW_RATIO: a day logged this far below target is more likely
  -- an unfinished log than a real day — the flow opens with a pre-check
  v_suspicious := v_total_cal < v_target_cal * 0.70;

  IF v_has_row THEN
    -- Still pending: logs changed before they started answering — recompute
    UPDATE daily_reflections SET
      total_calories = v_total_cal,
      total_protein = v_total_pro,
      target_calories = v_target_cal,
      maintenance_calories = v_maint_cal,
      target_protein = v_target_pro,
      goal_type = v_goal,
      verdict = v_verdict,
      suspicious_low = v_suspicious
    WHERE id = v_existing.id;

    RETURN QUERY SELECT * FROM daily_reflections WHERE id = v_existing.id;
    RETURN;
  END IF;

  -- Two devices racing on first open: one insert wins, both read the same row
  INSERT INTO daily_reflections (
    user_id, reflection_date,
    total_calories, total_protein,
    target_calories, maintenance_calories, target_protein,
    goal_type, verdict, suspicious_low
  ) VALUES (
    uid, p_reflection_date,
    v_total_cal, v_total_pro,
    v_target_cal, v_maint_cal, v_target_pro,
    v_goal, v_verdict, v_suspicious
  )
  ON CONFLICT (user_id, reflection_date) DO NOTHING;

  RETURN QUERY
  SELECT * FROM daily_reflections
  WHERE user_id = uid AND reflection_date = p_reflection_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- FUNCTION: admin_toggle_reflections
-- Same shape as admin_toggle_client_flag
-- ============================================

CREATE OR REPLACE FUNCTION admin_toggle_reflections(target_user_id UUID, new_enabled_value BOOLEAN)
RETURNS void AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  UPDATE user_profiles
  SET reflections_enabled = new_enabled_value
  WHERE user_id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', target_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- FUNCTION: admin_reset_my_reflection
-- Powers the Test practice button. Admin-gated AND self-scoped: it can only
-- ever delete the CALLER's own row, never a client's.
-- ============================================

CREATE OR REPLACE FUNCTION admin_reset_my_reflection(p_date DATE)
RETURNS void AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  DELETE FROM daily_reflections
  WHERE user_id = auth.uid() AND reflection_date = p_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- FUNCTION: get_user_metrics (recreated with reflections_enabled)
-- Return-shape change requires DROP + CREATE; body otherwise identical to
-- the previously deployed version.
-- ============================================

DROP FUNCTION IF EXISTS get_user_metrics();

CREATE FUNCTION get_user_metrics()
RETURNS TABLE(
  user_id uuid,
  email text,
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
  reflections_enabled boolean
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
    up.reflections_enabled
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION start_daily_reflection(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_toggle_reflections(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_reset_my_reflection(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_metrics() TO authenticated;

-- Signed-out users have no business calling these; existing internal guards
-- make anon calls no-ops, but revoking is strictly tighter.
REVOKE EXECUTE ON FUNCTION start_daily_reflection(DATE) FROM anon, public;
REVOKE EXECUTE ON FUNCTION admin_toggle_reflections(UUID, BOOLEAN) FROM anon, public;
REVOKE EXECUTE ON FUNCTION admin_reset_my_reflection(DATE) FROM anon, public;
REVOKE EXECUTE ON FUNCTION get_user_metrics() FROM anon, public;

-- Pin search_path (linter: function_search_path_mutable)
ALTER FUNCTION get_user_metrics() SET search_path = public;
