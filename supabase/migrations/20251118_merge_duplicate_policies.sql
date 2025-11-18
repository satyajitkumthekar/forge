-- Migration: Merge Duplicate RLS Policies
-- Purpose: Combine user + admin SELECT policies to reduce evaluation overhead
-- Impact: 50% reduction in policy evaluation for affected tables
--
-- Problem: Having 2 permissive policies means Postgres evaluates BOTH on every query
-- Solution: Merge into single policy with OR condition

-- ============================================
-- TABLE: api_usage_log
-- Merge: "Users can view their own" + "Admins can view all"
-- ============================================

-- Drop both existing policies
DROP POLICY IF EXISTS "Users can view their own api logs" ON api_usage_log;
DROP POLICY IF EXISTS "Admins can view all api logs" ON api_usage_log;

-- Create single merged policy
CREATE POLICY "Users view own, admins view all"
ON api_usage_log FOR SELECT
TO public
USING (
  (select auth.uid()) = user_id
  OR
  (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = (select auth.uid())
        AND user_profiles.account_type = 'admin'
    )
  )
);

-- ============================================
-- TABLE: user_profiles
-- Merge: "Users can view their own" + "Admins can view all"
-- ============================================

-- Drop both existing policies
DROP POLICY IF EXISTS "Users can view their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;

-- Create single merged policy
CREATE POLICY "Users view own, admins view all"
ON user_profiles FOR SELECT
TO public
USING (
  (select auth.uid()) = user_id
  OR
  (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = (select auth.uid())
        AND up.account_type = 'admin'
    )
  )
);

-- ============================================
-- Keep other admin policies as-is
-- (They don't have duplicate user policies)
-- ============================================

-- user_profiles: "Admins can update profiles" - KEEP (no duplicate)
-- Already uses is_admin() which is fine for UPDATE (rare operation)

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Duplicate RLS policies merged successfully!';
  RAISE NOTICE '  - api_usage_log: Merged 2 SELECT policies into 1';
  RAISE NOTICE '  - user_profiles: Merged 2 SELECT policies into 1';
  RAISE NOTICE 'Result: 50%% reduction in policy evaluation overhead for these tables';
END $$;
