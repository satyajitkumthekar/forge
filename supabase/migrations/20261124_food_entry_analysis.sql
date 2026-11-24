-- How an AI-analysed food's numbers were worked out.
--
-- The food analyser (supabase/functions/analyze-food-v2) lists each food on
-- a plate separately, and each food is logged as its own row. This column
-- keeps the short note that goes with a row, as JSON:
--   { "v": 1,
--     "portion": "1 katori, about 180 g",
--     "assumed": "Oil not mentioned, assumed 1 tsp.",
--     "from":    "estimate" | "client",   -- client = they typed the numbers
--     "typed":   "dal, rice and 2 rotis" }  -- what the client wrote
--
-- Display only: nothing is calculated from it. NULL for everything logged
-- before this, and for shortcuts (Quick Add, saved meals, cookbook meals).
-- Nothing existing is filled in or changed. Adding a nullable column with no
-- default does not rewrite the table, and the existing RLS policies on
-- food_entries cover it. admin_get_user_food_entries returns whole rows, so
-- staff views receive it without any change.

-- Never queue behind a busy table: give up after 3 seconds instead
SET LOCAL lock_timeout = '3s';

ALTER TABLE public.food_entries
  ADD COLUMN IF NOT EXISTS analysis jsonb;

COMMENT ON COLUMN public.food_entries.analysis IS
  'How an AI-analysed food was worked out (portion, what was assumed, whether the client typed the numbers, what they wrote). Display only. NULL for shortcuts and older rows.';

-- Let the API layer see the new column straight away
NOTIFY pgrst, 'reload schema';
