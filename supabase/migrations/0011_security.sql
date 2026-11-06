-- 0011 security: sign-in required, roles, 2-step verification enforced in the database, admin functions.
-- Run AFTER the login screen is deployed: it removes all anonymous access.
--
-- Roles:  viewer = read only · editor = edit outcomes, layout, SOP status · admin = everything (users, areas, pillars, backups, activity log)
-- A session counts only when it is signed in, the profile is active AND the sign-in passed 2-step verification (JWT aal = 'aal2').

create schema if not exists app;
comment on schema app is 'Application accounts: roles, profiles and admin-only functions. Exposed to the API; every function checks the caller.';

-- ───────── roles and profiles ─────────
create table app.roles (
  id uuid not null default gen_random_uuid(),
  code text not null,
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  constraint pk_roles primary key (id),
  constraint uq_roles_code unique (code),
  constraint ck_roles_code check (code ~ '^[a-z]+$')
);
comment on table app.roles is 'The three access levels: viewer, editor, admin.';
insert into app.roles (code, name, description, sort_order) values
  ('viewer', 'Viewer', 'Can read everything; cannot change anything.', 1),
  ('editor', 'Editor', 'Can edit outcomes, the Safeguard Map layout and SOP status.', 2),
  ('admin',  'Admin',  'Everything an editor can do, plus users, areas, pillars, backups and the activity log.', 3);

create table app.profiles (
  user_id uuid not null,
  username text not null,
  display_name text not null,
  role_id uuid not null,
  is_active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint pk_profiles primary key (user_id),
  constraint uq_profiles_username unique (username),
  constraint ck_profiles_username check (username ~ '^(?=.{3,16}$)[a-z0-9]+[._-]?[a-z0-9]+$'),
  constraint ck_profiles_display_name check (btrim(display_name) <> ''),
  constraint fk_profiles_user_id foreign key (user_id) references auth.users (id) on delete cascade,
  constraint fk_profiles_role_id foreign key (role_id) references app.roles (id),
  constraint fk_profiles_created_by foreign key (created_by) references auth.users (id) on delete set null,
  constraint fk_profiles_updated_by foreign key (updated_by) references auth.users (id) on delete set null
);
create index ix_profiles_role_id on app.profiles (role_id);
comment on table app.profiles is 'One row per person who can sign in. Created and changed only by admins.';
comment on column app.profiles.username is 'Sign-in name (lower case). The login form maps it to an internal address that is never emailed.';
comment on column app.profiles.must_change_password is 'True until the person replaces the temporary password they were given.';
create trigger trg_profiles_stamp before insert or update on app.profiles for each row execute function audit.stamp_row();
create trigger trg_profiles_audit after insert or update or delete on app.profiles for each row execute function audit.log_change('user_id');

-- ───────── helper functions (security definer so they can read profiles regardless of RLS) ─────────
create or replace function app.user_role() returns text
language sql stable security definer set search_path = '' as $$
  select r.code from app.profiles p join app.roles r on r.id = p.role_id where p.user_id = auth.uid() and p.is_active
$$;
create or replace function app.is_mfa() returns boolean
language sql stable set search_path = '' as $$ select coalesce(auth.jwt() ->> 'aal', '') = 'aal2' $$;
create or replace function app.can_read() returns boolean
language sql stable set search_path = '' as $$ select app.is_mfa() and app.user_role() is not null $$;
create or replace function app.can_edit() returns boolean
language sql stable set search_path = '' as $$ select app.is_mfa() and coalesce(app.user_role(), '') in ('editor', 'admin') $$;
create or replace function app.is_admin() returns boolean
language sql stable set search_path = '' as $$ select app.is_mfa() and coalesce(app.user_role(), '') = 'admin' $$;
comment on function app.can_read() is 'True for a signed-in, active person whose session passed 2-step verification.';
comment on function app.can_edit() is 'can_read() and role editor or admin.';
comment on function app.is_admin() is 'can_read() and role admin.';

revoke all on function app.user_role(), app.is_mfa(), app.can_read(), app.can_edit(), app.is_admin() from public, anon;
grant execute on function app.user_role(), app.is_mfa(), app.can_read(), app.can_edit(), app.is_admin() to authenticated;

-- ───────── lock down: no anonymous access at all ─────────
revoke all on all tables in schema codex, outcomes from anon;
revoke usage on schema codex, outcomes from anon;
revoke execute on function codex.apply_layout(jsonb, integer[]) from anon;
revoke execute on function outcomes.save_cell_outcomes(text, text, jsonb) from anon;

-- Signed-in people get exactly the privileges they need; row policies decide who may use them.
grant usage on schema app to authenticated;
grant select on app.roles, app.profiles to authenticated;
grant insert, update, delete on outcomes.areas to authenticated;
-- (pillars, outcomes, practice links, snapshots, sops.status_id already granted in 0006/0010)

-- The admin Edge Function connects with the service role, which needs explicit access to the new schema.
grant usage on schema app to service_role;
grant select, insert, update, delete on all tables in schema app to service_role;

-- ───────── replace every open policy ─────────
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname in ('codex', 'outcomes', 'app') loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- read: everybody who may read
do $$
declare t record;
begin
  for t in select schemaname, tablename from pg_tables where schemaname in ('codex', 'outcomes') loop
    execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
    execute format('create policy read_signed_in on %I.%I for select to authenticated using ((select app.can_read()))', t.schemaname, t.tablename);
  end loop;
end $$;

-- write: editors (business data)
create policy write_editor_update on codex.sops for update to authenticated using ((select app.can_edit())) with check ((select app.can_edit()));
create policy write_editor_insert on codex.practice_sops for insert to authenticated with check ((select app.can_edit()));
create policy write_editor_delete on codex.practice_sops for delete to authenticated using ((select app.can_edit()));
create policy write_editor_insert on codex.practice_values for insert to authenticated with check ((select app.can_edit()));
create policy write_editor_delete on codex.practice_values for delete to authenticated using ((select app.can_edit()));
create policy write_editor_insert on codex.layout_snapshots for insert to authenticated with check ((select app.can_edit()));
create policy write_editor_delete on codex.layout_snapshots for delete to authenticated using ((select app.can_edit()));
create policy write_editor_all on outcomes.outcomes for all to authenticated using ((select app.can_edit())) with check ((select app.can_edit()));

-- write: admins only (structure)
create policy write_admin_all on outcomes.pillars for all to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy write_admin_all on outcomes.areas for all to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));

-- app tables
alter table app.roles enable row level security;
alter table app.profiles enable row level security;
create policy read_roles on app.roles for select to authenticated using ((select app.is_mfa()));
create policy read_own_profile on app.profiles for select to authenticated using (user_id = (select auth.uid()) and (select app.is_mfa()));
create policy read_all_profiles_admin on app.profiles for select to authenticated using ((select app.is_admin()));
-- No insert/update/delete policies: accounts are created and changed only through the admin function (service key) and SECURITY DEFINER functions below.

-- ───────── the two write functions also check the role (viewers get a clear error, not a silent no-op) ─────────
create or replace function codex.apply_layout(p_layout jsonb, p_done_sops integer[] default null)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_practices jsonb := p_layout -> 'practices';
  v_done uuid; v_open uuid; v_bad text;
begin
  if not app.can_edit() then raise exception 'permission denied: editing needs the editor or admin role' using errcode = '42501'; end if;
  if p_layout is null or jsonb_typeof(v_practices) is distinct from 'object' then
    raise exception 'invalid layout: a "practices" object is required' using errcode = '22023';
  end if;
  select k into v_bad from jsonb_object_keys(v_practices) k where not exists (select 1 from codex.practices p where p.code = k) limit 1;
  if v_bad is not null then raise exception 'unknown practice: %', v_bad using errcode = '22023'; end if;
  select n into v_bad from jsonb_each(v_practices) e, jsonb_array_elements_text(coalesce(e.value -> 'sops', '[]'::jsonb)) n
   where not exists (select 1 from codex.sops s where s.sop_number::text = n) limit 1;
  if v_bad is not null then raise exception 'unknown SOP number: %', v_bad using errcode = '22023'; end if;
  select n into v_bad from jsonb_each(v_practices) e, jsonb_array_elements_text(coalesce(e.value -> 'values', '[]'::jsonb)) n
   where not exists (select 1 from codex.core_values v where v.code = n) limit 1;
  if v_bad is not null then raise exception 'unknown value: %', v_bad using errcode = '22023'; end if;

  delete from codex.practice_sops ps
   where ps.practice_id in (select p.id from jsonb_object_keys(v_practices) k join codex.practices p on p.code = k)
     and not exists (
       select 1 from jsonb_each(v_practices) e join codex.practices p on p.code = e.key
         cross join lateral jsonb_array_elements_text(coalesce(e.value -> 'sops', '[]'::jsonb)) n
         join codex.sops s on s.sop_number::text = n
        where p.id = ps.practice_id and s.id = ps.sop_id);
  insert into codex.practice_sops (practice_id, sop_id)
  select p.id, s.id from jsonb_each(v_practices) e join codex.practices p on p.code = e.key
    cross join lateral jsonb_array_elements_text(coalesce(e.value -> 'sops', '[]'::jsonb)) n
    join codex.sops s on s.sop_number::text = n
  on conflict do nothing;

  delete from codex.practice_values pv
   where pv.practice_id in (select p.id from jsonb_object_keys(v_practices) k join codex.practices p on p.code = k)
     and not exists (
       select 1 from jsonb_each(v_practices) e join codex.practices p on p.code = e.key
         cross join lateral jsonb_array_elements_text(coalesce(e.value -> 'values', '[]'::jsonb)) n
         join codex.core_values v on v.code = n
        where p.id = pv.practice_id and v.id = pv.value_id);
  insert into codex.practice_values (practice_id, value_id)
  select p.id, v.id from jsonb_each(v_practices) e join codex.practices p on p.code = e.key
    cross join lateral jsonb_array_elements_text(coalesce(e.value -> 'values', '[]'::jsonb)) n
    join codex.core_values v on v.code = n
  on conflict do nothing;

  if p_done_sops is not null then
    select id into v_done from codex.sop_statuses where code = 'done';
    select id into v_open from codex.sop_statuses where code = 'in-progress';
    update codex.sops s set status_id = case when s.sop_number = any (p_done_sops) then v_done else v_open end
     where s.status_id is distinct from case when s.sop_number = any (p_done_sops) then v_done else v_open end;
  end if;
end $$;

create or replace function outcomes.save_cell_outcomes(p_area_code text, p_pillar_code text, p_items jsonb)
returns setof outcomes.outcomes
language plpgsql security invoker set search_path = '' as $$
declare
  v_area uuid; v_pillar uuid; v_default uuid; v_status uuid;
  v_item jsonb; v_id uuid; v_pos integer := 0; v_kept uuid[] := '{}';
  v_desc text; v_target text; v_current text;
begin
  if not app.can_edit() then raise exception 'permission denied: editing needs the editor or admin role' using errcode = '42501'; end if;
  select id into v_area from outcomes.areas where code = p_area_code and is_active;
  if v_area is null then raise exception 'unknown area: %', p_area_code using errcode = '22023'; end if;
  select id into v_pillar from outcomes.pillars where code = p_pillar_code and is_active;
  if v_pillar is null then raise exception 'unknown or archived pillar: %', p_pillar_code using errcode = '22023'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 50 then
    raise exception 'items must be an array of at most 50 outcomes' using errcode = '22023';
  end if;
  select id into v_default from outcomes.outcome_statuses where code = 'not-started';
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_desc := left(btrim(coalesce(v_item ->> 'description', '')), 1000);
    v_target := left(btrim(coalesce(v_item ->> 'target_value', '')), 200);
    v_current := left(btrim(coalesce(v_item ->> 'current_value', '')), 200);
    continue when v_desc = '' and v_target = '' and v_current = '';
    if coalesce(v_item ->> 'status', '') = '' then v_status := v_default;
    else
      select id into v_status from outcomes.outcome_statuses where code = v_item ->> 'status';
      if v_status is null then raise exception 'unknown status: %', v_item ->> 'status' using errcode = '22023'; end if;
    end if;
    v_id := coalesce(nullif(v_item ->> 'id', '')::uuid, gen_random_uuid());
    insert into outcomes.outcomes as o (id, area_id, pillar_id, status_id, description, target_value, current_value, sort_order)
    values (v_id, v_area, v_pillar, v_status, v_desc, v_target, v_current, v_pos)
    on conflict (id) do update
      set status_id = excluded.status_id, description = excluded.description, target_value = excluded.target_value,
          current_value = excluded.current_value, sort_order = excluded.sort_order
      where o.area_id = excluded.area_id and o.pillar_id = excluded.pillar_id;
    v_kept := v_kept || v_id;
    v_pos := v_pos + 1;
  end loop;
  delete from outcomes.outcomes o where o.area_id = v_area and o.pillar_id = v_pillar and o.id <> all (v_kept);
  return query select * from outcomes.outcomes o where o.area_id = v_area and o.pillar_id = v_pillar order by o.sort_order;
end $$;

revoke all on function codex.apply_layout(jsonb, integer[]), outcomes.save_cell_outcomes(text, text, jsonb) from public, anon;
grant execute on function codex.apply_layout(jsonb, integer[]), outcomes.save_cell_outcomes(text, text, jsonb) to authenticated;

-- ───────── admin functions (every one checks app.is_admin()) ─────────
create or replace function app.admin_list_changes(
  p_table text default null, p_user uuid default null, p_from timestamptz default null, p_to timestamptz default null,
  p_limit integer default 100, p_offset integer default 0)
returns table (id bigint, occurred_at timestamptz, schema_name text, table_name text, operation text, record_key jsonb,
               old_data jsonb, new_data jsonb, changed_by uuid, changed_by_name text, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_admin() then raise exception 'permission denied: admin only' using errcode = '42501'; end if;
  return query
  select c.id, c.occurred_at, c.schema_name, c.table_name, c.operation, c.record_key, c.old_data, c.new_data, c.changed_by,
         coalesce(p.display_name, case when c.changed_by is null then 'System / setup' else 'Unknown user' end),
         count(*) over ()
    from audit.change_log c left join app.profiles p on p.user_id = c.changed_by
   where (p_table is null or c.table_name = p_table)
     and (p_user is null or c.changed_by = p_user)
     and (p_from is null or c.occurred_at >= p_from)
     and (p_to is null or c.occurred_at < p_to)
   order by c.occurred_at desc, c.id desc
   limit least(greatest(p_limit, 1), 500) offset greatest(p_offset, 0);
end $$;
comment on function app.admin_list_changes(text, uuid, timestamptz, timestamptz, integer, integer) is 'Admin only: filtered page of the change history.';

create or replace function app.admin_export_backup() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not app.is_admin() then raise exception 'permission denied: admin only' using errcode = '42501'; end if;
  select jsonb_build_object(
    'format', 'culture-blueprint-backup', 'version', 1, 'exported_at', now(),
    'pillars', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order), '[]') from (select code, name, color, is_active, sort_order from outcomes.pillars) x),
    'areas', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order), '[]') from (select a.code, a.name, a.is_active, a.sort_order, pa.code as parent_code from outcomes.areas a left join outcomes.areas pa on pa.id = a.parent_area_id) x),
    'outcomes', (select coalesce(jsonb_agg(to_jsonb(x) order by x.area_code, x.pillar_code, x.sort_order), '[]') from (
        select o.id, ar.code as area_code, pi.code as pillar_code, st.code as status_code, o.description, o.target_value, o.current_value, o.sort_order
          from outcomes.outcomes o join outcomes.areas ar on ar.id = o.area_id join outcomes.pillars pi on pi.id = o.pillar_id join outcomes.outcome_statuses st on st.id = o.status_id) x),
    'practice_sops', (select coalesce(jsonb_agg(jsonb_build_object('practice', p.code, 'sop_number', s.sop_number)), '[]') from codex.practice_sops ps join codex.practices p on p.id = ps.practice_id join codex.sops s on s.id = ps.sop_id),
    'practice_values', (select coalesce(jsonb_agg(jsonb_build_object('practice', p.code, 'value', v.code)), '[]') from codex.practice_values pv join codex.practices p on p.id = pv.practice_id join codex.core_values v on v.id = pv.value_id),
    'sop_status', (select coalesce(jsonb_agg(jsonb_build_object('sop_number', s.sop_number, 'status', st.code)), '[]') from codex.sops s join codex.sop_statuses st on st.id = s.status_id),
    'layout_snapshots', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from (select id, name, description, schema_version, layout, created_at from codex.layout_snapshots) x)
  ) into v;
  return v;
end $$;

create or replace function app.admin_restore_backup(p_backup jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n_out int := 0; n_links int := 0; r jsonb;
begin
  if not app.is_admin() then raise exception 'permission denied: admin only' using errcode = '42501'; end if;
  if p_backup is null or p_backup ->> 'format' <> 'culture-blueprint-backup' or coalesce((p_backup ->> 'version')::int, 0) <> 1 then
    raise exception 'not a Culture Blueprint backup file (version 1)' using errcode = '22023';
  end if;
  -- safety copy of the current layout first
  insert into codex.layout_snapshots (name, description, layout)
  select 'Automatic copy before restore ' || to_char(now(), 'YYYY-MM-DD HH24:MI'), 'Taken automatically before a backup was restored.',
         jsonb_build_object('schema_version', 2, 'practices', coalesce((
           select jsonb_object_agg(p.code, jsonb_build_object(
             'sops', coalesce((select jsonb_agg(s.sop_number order by s.sop_number) from codex.practice_sops ps join codex.sops s on s.id = ps.sop_id where ps.practice_id = p.id), '[]'),
             'values', coalesce((select jsonb_agg(v.code order by v.code) from codex.practice_values pv join codex.core_values v on v.id = pv.value_id where pv.practice_id = p.id), '[]')))
           from codex.practices p), '{}'));

  -- structure: upsert pillars and areas by code
  for r in select value from jsonb_array_elements(coalesce(p_backup -> 'pillars', '[]')) loop
    insert into outcomes.pillars (code, name, color, is_active, sort_order)
    values (r ->> 'code', r ->> 'name', r ->> 'color', coalesce((r ->> 'is_active')::boolean, true), coalesce((r ->> 'sort_order')::int, 0))
    on conflict (code) do update set name = excluded.name, color = excluded.color, is_active = excluded.is_active, sort_order = excluded.sort_order;
  end loop;
  for r in select value from jsonb_array_elements(coalesce(p_backup -> 'areas', '[]')) where (value ->> 'parent_code') is null loop
    insert into outcomes.areas (code, name, is_active, sort_order) values (r ->> 'code', r ->> 'name', coalesce((r ->> 'is_active')::boolean, true), coalesce((r ->> 'sort_order')::int, 0))
    on conflict (code) do update set name = excluded.name, is_active = excluded.is_active, sort_order = excluded.sort_order;
  end loop;
  for r in select value from jsonb_array_elements(coalesce(p_backup -> 'areas', '[]')) where (value ->> 'parent_code') is not null loop
    insert into outcomes.areas (code, name, is_active, sort_order, parent_area_id)
    values (r ->> 'code', r ->> 'name', coalesce((r ->> 'is_active')::boolean, true), coalesce((r ->> 'sort_order')::int, 0), (select id from outcomes.areas where code = r ->> 'parent_code'))
    on conflict (code) do update set name = excluded.name, is_active = excluded.is_active, sort_order = excluded.sort_order, parent_area_id = excluded.parent_area_id;
  end loop;

  -- data: replace outcomes and links
  delete from outcomes.outcomes where true;
  insert into outcomes.outcomes (id, area_id, pillar_id, status_id, description, target_value, current_value, sort_order)
  select (o ->> 'id')::uuid, ar.id, pi.id, st.id, coalesce(o ->> 'description', ''), coalesce(o ->> 'target_value', ''), coalesce(o ->> 'current_value', ''), coalesce((o ->> 'sort_order')::int, 0)
    from jsonb_array_elements(coalesce(p_backup -> 'outcomes', '[]')) o
    join outcomes.areas ar on ar.code = o ->> 'area_code' join outcomes.pillars pi on pi.code = o ->> 'pillar_code' join outcomes.outcome_statuses st on st.code = o ->> 'status_code';
  get diagnostics n_out = row_count;

  delete from codex.practice_sops where true;
  insert into codex.practice_sops (practice_id, sop_id)
  select p.id, s.id from jsonb_array_elements(coalesce(p_backup -> 'practice_sops', '[]')) x join codex.practices p on p.code = x ->> 'practice' join codex.sops s on s.sop_number = (x ->> 'sop_number')::int;
  get diagnostics n_links = row_count;
  delete from codex.practice_values where true;
  insert into codex.practice_values (practice_id, value_id)
  select p.id, v.id from jsonb_array_elements(coalesce(p_backup -> 'practice_values', '[]')) x join codex.practices p on p.code = x ->> 'practice' join codex.core_values v on v.code = x ->> 'value';
  update codex.sops s set status_id = st.id
    from jsonb_array_elements(coalesce(p_backup -> 'sop_status', '[]')) x join codex.sop_statuses st on st.code = x ->> 'status'
   where s.sop_number = (x ->> 'sop_number')::int and s.status_id <> st.id;
  insert into codex.layout_snapshots (id, name, description, schema_version, layout, created_at)
  select (x ->> 'id')::uuid, x ->> 'name', x ->> 'description', coalesce((x ->> 'schema_version')::int, 2), x -> 'layout', coalesce((x ->> 'created_at')::timestamptz, now())
    from jsonb_array_elements(coalesce(p_backup -> 'layout_snapshots', '[]')) x
  on conflict (id) do nothing;
  return jsonb_build_object('outcomes', n_out, 'sop_links', n_links);
end $$;
comment on function app.admin_restore_backup(jsonb) is 'Admin only: replaces outcomes, practice links and SOP status from a backup file, after saving a safety snapshot.';

revoke all on function app.admin_list_changes(text, uuid, timestamptz, timestamptz, integer, integer), app.admin_export_backup(), app.admin_restore_backup(jsonb) from public, anon;
grant execute on function app.admin_list_changes(text, uuid, timestamptz, timestamptz, integer, integer), app.admin_export_backup(), app.admin_restore_backup(jsonb) to authenticated;

-- A signed-in person can clear their own "must change password" flag after changing the password.
create or replace function app.mark_password_changed() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_mfa() then raise exception 'permission denied' using errcode = '42501'; end if;
  update app.profiles set must_change_password = false where user_id = auth.uid();
end $$;
revoke all on function app.mark_password_changed() from public, anon;
grant execute on function app.mark_password_changed() to authenticated;

-- Realtime for profile changes is not needed; audit log stays private (no grants, RLS without policies).

-- The activity log also credits the person named in updated_by when a change comes through the admin function (service key, no auth.uid()).
create or replace function audit.log_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  k jsonb := '{}'::jsonb;
  a text;
  actor uuid;
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at' - 'updated_by') = (to_jsonb(old) - 'updated_at' - 'updated_by') then
    return null;
  end if;
  foreach a in array tg_argv loop
    k := k || jsonb_build_object(a, r -> a);
  end loop;
  actor := auth.uid();
  if actor is null then
    begin
      actor := nullif(case when tg_op = 'DELETE' then to_jsonb(old) ->> 'updated_by' else to_jsonb(new) ->> 'updated_by' end, '')::uuid;
    exception when others then actor := null; end;
  end if;
  insert into audit.change_log (schema_name, table_name, record_key, operation, old_data, new_data, changed_by)
  values (tg_table_schema, tg_table_name, k, tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          actor);
  return null;
end $$;
