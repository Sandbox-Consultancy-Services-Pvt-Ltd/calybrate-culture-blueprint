-- 0009 drop legacy: remove the flat prototype tables after the application has been switched to codex / outcomes.
-- Run only after verification. A JSON backup is in supabase/backups/.
-- Tables first (their triggers depend on public.set_updated_at), then the old functions.
drop table if exists public.codex_practice_sops, public.codex_practice_values, public.codex_layouts,
                     public.codex_sops, public.codex_practices, public.codex_values, public.cct_outcomes cascade;
drop function if exists public.replace_cct_cell(text, text, jsonb, text);
drop function if exists public.save_codex_state(jsonb, integer[]);
drop function if exists public.set_updated_at();
