-- Pro is the plan everyone is on, and the plan new sign-ups start on.
--
-- Until now people started on Basic (50 food analyses and 10 coach chats a
-- day) and were moved to Pro (500 and 25) by hand. From here on:
--   1. everyone currently on Basic moves to Pro
--   2. a new profile starts on Pro, with Pro's daily limits
-- Basic stays as a plan staff can still pick from the user table, and the
-- limits each plan carries (update_daily_limit_on_tier_change) do not
-- change. Admin and coach accounts are untouched.

-- Fail fast instead of queueing behind a long transaction on a live table
SET LOCAL lock_timeout = '5s';

-- ============================================
-- 1. Existing people on Basic move to Pro, once
-- ============================================

DO $$
BEGIN
  -- Guarded by the column default so a re-run never moves someone staff
  -- have deliberately put back on Basic since
  IF (
    SELECT column_default FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_profiles'
      AND column_name = 'account_type'
  ) LIKE '%basic%' THEN
    -- The tier-change trigger sets each person's daily limits to Pro's
    UPDATE public.user_profiles SET account_type = 'pro' WHERE account_type = 'basic';
  END IF;
END $$;

-- ============================================
-- 2. New profiles start on Pro
-- ============================================

ALTER TABLE public.user_profiles
  ALTER COLUMN account_type SET DEFAULT 'pro',
  ALTER COLUMN daily_api_limit SET DEFAULT 500,
  ALTER COLUMN daily_coach_limit SET DEFAULT 25;

-- ============================================
-- FUNCTION: create_user_profile (runs when someone signs up)
-- Unchanged except the plan and its food limit: 'basic', 50 became
-- 'pro', 500. The coach-chat limit comes from the column default above.
-- ============================================

CREATE OR REPLACE FUNCTION public.create_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  INSERT INTO public.user_profiles (user_id, user_email, full_name, account_type, daily_api_limit, last_active)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), ''),
    'pro',
    500,
    NOW()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ============================================
-- FUNCTION: check_and_increment_rate_limit
-- Unchanged except its safety net (a signed-in person with no profile row,
-- which the sign-up trigger should make impossible): 'basic', 50 became
-- 'pro', 500.
-- ============================================

CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(user_uuid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  profile_record RECORD;
  calls_remaining INTEGER;
BEGIN
  -- Get user profile
  SELECT * INTO profile_record
  FROM user_profiles
  WHERE user_id = user_uuid;

  -- If no profile exists, create one (shouldn't happen due to trigger)
  IF NOT FOUND THEN
    INSERT INTO user_profiles (user_id, account_type, daily_api_limit)
    VALUES (user_uuid, 'pro', 500)
    RETURNING * INTO profile_record;
  END IF;

  -- Check if we need to reset the counter
  IF should_reset_rate_limit(user_uuid) THEN
    PERFORM reset_rate_limit(user_uuid);
    -- Refresh the record after reset
    SELECT * INTO profile_record
    FROM user_profiles
    WHERE user_id = user_uuid;
  END IF;

  -- Check if user has calls remaining
  calls_remaining := profile_record.daily_api_limit - profile_record.api_calls_used_today;

  IF calls_remaining <= 0 THEN
    RETURN FALSE; -- Rate limit exceeded
  END IF;

  -- Increment the counter
  UPDATE user_profiles
  SET
    api_calls_used_today = api_calls_used_today + 1,
    updated_at = NOW()
  WHERE user_id = user_uuid;

  RETURN TRUE; -- Request allowed
END;
$function$;

-- ============================================
-- FUNCTION: check_and_increment_coach_limit
-- Unchanged except the same safety net: 'basic', 50, 10 became
-- 'pro', 500, 25.
-- ============================================

CREATE OR REPLACE FUNCTION public.check_and_increment_coach_limit(user_uuid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  profile_record RECORD;
  calls_remaining INTEGER;
BEGIN
  -- Get user profile
  SELECT * INTO profile_record
  FROM user_profiles
  WHERE user_id = user_uuid;

  -- If no profile exists, create one
  IF NOT FOUND THEN
    INSERT INTO user_profiles (user_id, account_type, daily_api_limit, daily_coach_limit)
    VALUES (user_uuid, 'pro', 500, 25)
    RETURNING * INTO profile_record;
  END IF;

  -- Check if we need to reset the counter
  IF should_reset_rate_limit(user_uuid) THEN
    PERFORM reset_rate_limit(user_uuid);
    -- Refresh the record after reset
    SELECT * INTO profile_record
    FROM user_profiles
    WHERE user_id = user_uuid;
  END IF;

  -- Check if user has coach calls remaining
  calls_remaining := profile_record.daily_coach_limit - profile_record.coach_calls_used_today;

  IF calls_remaining <= 0 THEN
    RETURN FALSE; -- Rate limit exceeded
  END IF;

  -- Increment the counter
  UPDATE user_profiles
  SET
    coach_calls_used_today = coach_calls_used_today + 1,
    updated_at = NOW()
  WHERE user_id = user_uuid;

  RETURN TRUE; -- Request allowed
END;
$function$;
