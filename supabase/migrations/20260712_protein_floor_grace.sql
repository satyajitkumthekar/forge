/**
 * Protein floor: restore the 10% grace (owner decision after testing).
 *
 * The original gate treated target_protein as a strict floor. The owner
 * prefers the app's long-standing 10% margin, so protein now passes at
 * >= 90% of target — and the display bands stay on their original
 * thresholds, keeping "green ring = win reflection" true.
 * Only the protein line changes; everything else is identical.
 */

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

  -- The gate. Buffer = 5% of calorie target (matches the app's wrong-side
  -- colour band); protein floor carries the app's 10% grace below target.
  v_goal := CASE
    WHEN v_target_cal < v_maint_cal THEN 'cut'
    WHEN v_target_cal > v_maint_cal THEN 'bulk'
    ELSE 'maintenance'
  END;
  v_cal_pass := CASE
    WHEN v_goal = 'cut' THEN v_total_cal <= v_target_cal * 1.05  -- ceiling on a cut
    ELSE v_total_cal >= v_target_cal * 0.95                      -- floor otherwise
  END;
  v_pro_pass := v_total_pro >= v_target_pro * 0.90;
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
