-- Realtime for the tables the Life Cycle and CCT Framework views now read.
-- (cct_outcomes was added in 0001.) Run once in the Supabase SQL editor.
alter publication supabase_realtime add table public.codex_sops;
alter publication supabase_realtime add table public.codex_practice_sops;
