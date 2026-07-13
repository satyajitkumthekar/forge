/**
 * Reflection Coach RPCs (Next-Day Reflection, Stage 2)
 *
 * Two admin-only reads over daily_reflections, following the exact
 * get_coach_analytics pattern: SECURITY DEFINER + is_admin() gate.
 * Clients have no path to other users' rows — RLS on the table is
 * self-only, and these functions are the coach's only window in.
 */

-- ============================================
-- FUNCTION: get_week_reflections
-- Slim per-day markers for the coach ledger: one row per reflection in the
-- viewed week, across all users. Interpretation (e.g. a stale pending row
-- reads as "missed") happens client-side where the app's 3 AM day rule lives.
-- ============================================

CREATE OR REPLACE FUNCTION get_week_reflections(p_week_start DATE)
RETURNS TABLE(
  user_id UUID,
  reflection_date DATE,
  status TEXT,
  verdict TEXT
) AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  RETURN QUERY
  SELECT dr.user_id, dr.reflection_date, dr.status, dr.verdict
  FROM daily_reflections dr
  WHERE dr.reflection_date >= p_week_start
    AND dr.reflection_date < p_week_start + 7;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- FUNCTION: get_client_reflections
-- Full reflection rows for one client over a period (the Reflections panel).
-- Aggregation happens in TypeScript — at ~31 rows per period, readable code
-- beats clever SQL.
-- ============================================

CREATE OR REPLACE FUNCTION get_client_reflections(p_user_id UUID, p_start DATE, p_end DATE)
RETURNS SETOF daily_reflections AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  RETURN QUERY
  SELECT *
  FROM daily_reflections dr
  WHERE dr.user_id = p_user_id
    AND dr.reflection_date BETWEEN p_start AND p_end
  ORDER BY dr.reflection_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION get_week_reflections(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_client_reflections(UUID, DATE, DATE) TO authenticated;

REVOKE EXECUTE ON FUNCTION get_week_reflections(DATE) FROM anon, public;
REVOKE EXECUTE ON FUNCTION get_client_reflections(UUID, DATE, DATE) FROM anon, public;
