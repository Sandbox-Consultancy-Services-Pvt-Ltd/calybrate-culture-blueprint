-- 0018 security hardening.
--  1. audit.access_log: who exported, printed, downloaded a backup or opened a document, and when.
--     app.log_access() writes to it (any signed-in, verified person); app.admin_list_access() reads it (admins only).
--  2. Administrators can never be exempt from two-step verification (trigger + existing admins switched back on).
--  3. A guard that stops this migration if any anonymous (signed-out) policy or table grant is still open.
-- Safe to run more than once.

-- ───────── 1. access log ─────────
create table if not exists audit.access_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  user_id     uuid,
  action      text not null check (action in ('export_csv', 'print', 'backup', 'document_open', 'activity_export')),
  detail      text check (detail is null or char_length(detail) <= 200)
);
create index if not exists ix_access_log_occurred_at on audit.access_log (occurred_at desc);
alter table audit.access_log enable row level security;   -- no policies: invisible to API roles
revoke all on audit.access_log from public, anon, authenticated;

create or replace function app.log_access(p_action text, p_detail text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select app.can_read()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_action not in ('export_csv', 'print', 'backup', 'document_open', 'activity_export') then
    raise exception 'unknown action' using errcode = '22023';
  end if;
  insert into audit.access_log (user_id, action, detail) values (auth.uid(), p_action, left(p_detail, 200));
end $$;

create or replace function app.admin_list_access(p_limit integer default 100, p_offset integer default 0)
returns table (id bigint, occurred_at timestamptz, user_id uuid, user_name text, action text, detail text, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select app.is_admin()) then
    raise exception 'only an administrator can see the access log' using errcode = '42501';
  end if;
  return query
    select a.id, a.occurred_at, a.user_id, coalesce(p.display_name, 'Unknown user'), a.action, a.detail, count(*) over ()
      from audit.access_log a left join app.profiles p on p.user_id = a.user_id
     order by a.occurred_at desc, a.id desc
     limit least(greatest(p_limit, 1), 500) offset greatest(p_offset, 0);
end $$;

revoke all on function app.log_access(text, text), app.admin_list_access(integer, integer) from public, anon;
grant execute on function app.log_access(text, text), app.admin_list_access(integer, integer) to authenticated;

-- ───────── 2. admins always use two-step verification ─────────
create or replace function app.enforce_admin_mfa() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from app.roles r where r.id = new.role_id and r.code = 'admin') then
    new.mfa_required := true;
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_admin_mfa on app.profiles;
create trigger trg_profiles_admin_mfa before insert or update on app.profiles for each row execute function app.enforce_admin_mfa();

-- Existing admins who were exempt are switched back on (they are asked to set up the authenticator at next sign-in).
update app.profiles p set mfa_required = true
 where not p.mfa_required and exists (select 1 from app.roles r where r.id = p.role_id and r.code = 'admin');

-- ───────── 3. guard: nothing open to signed-out visitors ─────────
do $$
declare bad text;
begin
  select string_agg(schemaname || '.' || tablename || ' (' || policyname || ')', ', ') into bad
    from pg_policies
   where schemaname in ('app', 'codex', 'outcomes', 'audit', 'storage')
     and ('anon' = any(roles) or 'public' = any(roles) and policyname ~ '^(temp_open|read_all)');
  if bad is not null then
    raise exception 'open policies for signed-out visitors still exist: %', bad;
  end if;

  select string_agg(table_schema || '.' || table_name, ', ') into bad
    from information_schema.role_table_grants
   where grantee = 'anon' and table_schema in ('app', 'codex', 'outcomes', 'audit');
  if bad is not null then
    raise exception 'the anon role still has table grants: %', bad;
  end if;
end $$;
