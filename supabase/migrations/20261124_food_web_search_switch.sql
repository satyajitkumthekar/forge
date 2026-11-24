-- One switch for the food analyser's web search, for everyone.
--
-- When on (the default), the analyser (analyze-food-v2) looks brands,
-- packaged foods and chain dishes up online and uses their label. When off,
-- every food is estimated. Admins flip it on the Admin page; the analyser
-- reads it on every log, so a change applies straight away.
--
-- It uses system_settings' existing rules: anyone can read the row, only
-- admins can change it (policy "Admins can update system settings").
-- Adding a column with a constant default to this one-row table is
-- instant and changes nothing else.

SET LOCAL lock_timeout = '3s';

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS food_web_search boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.system_settings.food_web_search IS
  'Food analyser web search for everyone. false: every food is estimated, nothing is looked up online. Changed by admins on the Admin page.';

NOTIFY pgrst, 'reload schema';
