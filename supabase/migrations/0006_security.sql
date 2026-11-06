-- 0006 security: row level security and explicit grants.
-- NOTE: write policies are TEMPORARY (no login yet): anyone with the public key can edit business data.
-- When Supabase Auth is introduced, replace the "temp_open_write" policies with role-based ones.

grant usage on schema codex, outcomes to anon, authenticated;
revoke all on all tables in schema codex, outcomes from anon, authenticated;
grant select on all tables in schema codex, outcomes to anon, authenticated;

-- Reference data: read-only for API roles.
-- Business data: writable (temporary policy below).
grant update (status_id) on codex.sops to anon, authenticated;
grant insert, delete on codex.practice_sops, codex.practice_values to anon, authenticated;
grant insert, delete on codex.layout_snapshots to anon, authenticated;
grant insert, update, delete on outcomes.outcomes to anon, authenticated;

do $$
declare t record;
begin
  for t in select schemaname, tablename from pg_tables where schemaname in ('codex', 'outcomes') loop
    execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
    execute format('create policy read_all on %I.%I for select to anon, authenticated using (true)', t.schemaname, t.tablename);
  end loop;
end $$;

create policy temp_open_write_update on codex.sops for update to anon, authenticated using (true) with check (true);
create policy temp_open_write_insert on codex.practice_sops for insert to anon, authenticated with check (true);
create policy temp_open_write_delete on codex.practice_sops for delete to anon, authenticated using (true);
create policy temp_open_write_insert on codex.practice_values for insert to anon, authenticated with check (true);
create policy temp_open_write_delete on codex.practice_values for delete to anon, authenticated using (true);
create policy temp_open_write_insert on codex.layout_snapshots for insert to anon, authenticated with check (true);
create policy temp_open_write_delete on codex.layout_snapshots for delete to anon, authenticated using (true);
create policy temp_open_write_all on outcomes.outcomes for all to anon, authenticated using (true) with check (true);
