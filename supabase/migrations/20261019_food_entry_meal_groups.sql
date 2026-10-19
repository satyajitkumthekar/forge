-- Meal segments in the food log.
--
-- meal_group_id ties together the entries of one sitting ("Meal 1, 2, 3").
-- The client stamps it at log time: entries within 60 minutes of the
-- previous log join its meal; a gap of 60+ minutes starts a new one. The
-- user can also pin an earlier meal or force a new one from the input bar.
-- Stored (not derived) so manual choices stick and deletions never
-- reshuffle meals. Existing RLS policies on food_entries cover the column.

ALTER TABLE public.food_entries
  ADD COLUMN IF NOT EXISTS meal_group_id uuid;

-- Backfill history with the same 60-minute rule, per user per logical day.
-- The updated_at trigger is paused so history keeps its original stamps.
ALTER TABLE public.food_entries DISABLE TRIGGER update_food_entries_updated_at;

WITH ordered AS (
  SELECT
    id,
    user_id,
    entry_date,
    created_at,
    CASE
      WHEN lag(created_at) OVER w IS NULL
        OR created_at - lag(created_at) OVER w >= interval '60 minutes'
      THEN 1 ELSE 0
    END AS is_break
  FROM public.food_entries
  WHERE meal_group_id IS NULL
  WINDOW w AS (PARTITION BY user_id, entry_date ORDER BY created_at, id)
),
numbered AS (
  SELECT
    id,
    user_id,
    entry_date,
    sum(is_break) OVER (
      PARTITION BY user_id, entry_date
      ORDER BY created_at, id
      ROWS UNBOUNDED PRECEDING
    ) AS grp
  FROM ordered
),
group_ids AS (
  SELECT user_id, entry_date, grp, gen_random_uuid() AS gid
  FROM (SELECT DISTINCT user_id, entry_date, grp FROM numbered) d
)
UPDATE public.food_entries f
SET meal_group_id = g.gid
FROM numbered n
JOIN group_ids g USING (user_id, entry_date, grp)
WHERE f.id = n.id;

ALTER TABLE public.food_entries ENABLE TRIGGER update_food_entries_updated_at;

-- Any insert that arrives without a meal (Meals tab, test seeding, an older
-- client still in a browser tab) gets one server-side by the same rule, so
-- no row is ever untagged.
CREATE OR REPLACE FUNCTION public.assign_food_entry_meal_group()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  prev_group uuid;
BEGIN
  IF NEW.meal_group_id IS NULL THEN
    -- Continue only the day's latest meal (by when it started), and only if
    -- its last log was under 60 minutes ago; mirrors resolveTargetMeal
    SELECT g.meal_group_id INTO prev_group
    FROM (
      SELECT fe.meal_group_id, min(fe.created_at) AS started, max(fe.created_at) AS last_log
      FROM food_entries fe
      WHERE fe.user_id = NEW.user_id
        AND fe.entry_date = NEW.entry_date
        AND fe.meal_group_id IS NOT NULL
      GROUP BY fe.meal_group_id
      ORDER BY started DESC
      LIMIT 1
    ) g
    WHERE g.last_log > COALESCE(NEW.created_at, now()) - interval '60 minutes';

    NEW.meal_group_id := COALESCE(prev_group, gen_random_uuid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_food_entry_meal_group ON public.food_entries;
CREATE TRIGGER assign_food_entry_meal_group
  BEFORE INSERT ON public.food_entries
  FOR EACH ROW EXECUTE FUNCTION public.assign_food_entry_meal_group();
