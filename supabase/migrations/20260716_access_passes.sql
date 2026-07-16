/**
 * Access Passes Migration
 *
 * Codes the owner creates, each with a set number of uses. Anyone on the
 * holding screen who enters a valid code gets access immediately and the
 * code's remaining uses drop by one. Purely additive: the manual Grant
 * flow and the Pending box are untouched.
 *
 * The atomic conditional decrement in redeem_access_pass is the
 * double-spend guard: two people racing for a code's last use serialize on
 * the row lock, and exactly one wins.
 */

-- ============================================
-- TABLE: access_passes
-- No client policies: every touch goes through the functions below.
-- ============================================

CREATE TABLE access_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,  -- stored uppercase; matching is case-insensitive
  max_uses INTEGER NOT NULL CHECK (max_uses > 0),
  uses_remaining INTEGER NOT NULL CHECK (uses_remaining >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE access_passes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON access_passes FROM anon, authenticated;

-- ============================================
-- FUNCTION: redeem_access_pass
-- Any signed-in user may try a code from the holding screen. Returns a
-- plain boolean; invalid, inactive and exhausted codes all read the same
-- from outside so nobody can probe which codes exist.
-- ============================================

CREATE OR REPLACE FUNCTION redeem_access_pass(p_code TEXT)
RETURNS boolean AS $$
DECLARE
  uid UUID;
  v_code TEXT;
  v_pass_id UUID;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Already inside: succeed without burning a use
  IF EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = uid AND (access_granted OR account_type = 'admin')
  ) THEN
    RETURN TRUE;
  END IF;

  v_code := UPPER(TRIM(COALESCE(p_code, '')));
  IF v_code = '' THEN
    RETURN FALSE;
  END IF;

  -- Atomic decrement: the double-spend guard
  UPDATE access_passes
  SET uses_remaining = uses_remaining - 1
  WHERE code = v_code AND active AND uses_remaining > 0
  RETURNING id INTO v_pass_id;

  IF v_pass_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE user_profiles SET access_granted = TRUE WHERE user_id = uid;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- ADMIN FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION get_access_passes()
RETURNS SETOF access_passes AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  RETURN QUERY SELECT * FROM access_passes ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION admin_create_access_pass(p_code TEXT, p_max_uses INTEGER)
RETURNS SETOF access_passes AS $$
DECLARE
  v_code TEXT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  v_code := UPPER(TRIM(COALESCE(p_code, '')));
  IF v_code !~ '^[A-Z0-9-]{4,24}$' THEN
    RAISE EXCEPTION 'Codes are 4 to 24 letters, numbers and dashes';
  END IF;
  IF p_max_uses IS NULL OR p_max_uses < 1 OR p_max_uses > 1000 THEN
    RAISE EXCEPTION 'Uses must be between 1 and 1000';
  END IF;
  IF EXISTS (SELECT 1 FROM access_passes WHERE code = v_code) THEN
    RAISE EXCEPTION 'That code already exists';
  END IF;

  RETURN QUERY
  INSERT INTO access_passes (code, max_uses, uses_remaining, created_by)
  VALUES (v_code, p_max_uses, p_max_uses, auth.uid())
  RETURNING *;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION admin_set_pass_active(p_id UUID, p_active BOOLEAN)
RETURNS void AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  UPDATE access_passes SET active = p_active WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pass not found';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION admin_delete_access_pass(p_id UUID)
RETURNS void AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  DELETE FROM access_passes WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pass not found';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- GRANTS
-- ============================================

GRANT EXECUTE ON FUNCTION redeem_access_pass(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_access_passes() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_create_access_pass(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_pass_active(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_access_pass(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION redeem_access_pass(TEXT) FROM anon, public;
REVOKE EXECUTE ON FUNCTION get_access_passes() FROM anon, public;
REVOKE EXECUTE ON FUNCTION admin_create_access_pass(TEXT, INTEGER) FROM anon, public;
REVOKE EXECUTE ON FUNCTION admin_set_pass_active(UUID, BOOLEAN) FROM anon, public;
REVOKE EXECUTE ON FUNCTION admin_delete_access_pass(UUID) FROM anon, public;
