-- The usage log has not been written since October 2025.
--
-- Two versions of log_api_usage existed: one with four arguments and one
-- with a fifth, optional email. Every argument after the first has a
-- default, so a call naming the first four matched both, and PostgREST
-- refused to choose between them (HTTP 300, PGRST203). The edge functions
-- (analyze-food, ask-coach) call it exactly that way and never check the
-- result, so the failure was silent and api_usage_log stopped filling.
--
-- Keep the five-argument version: email is optional there, so it accepts
-- every call the edge functions make and nothing that calls it has to
-- change. Forward only: the missing history is not filled in.

DROP FUNCTION IF EXISTS public.log_api_usage(uuid, text, boolean, text);
