-- 0015 content editing: administrators can change the wording of SOPs, practices and core values, and add new ones,
-- from the details panel and Library of the Safeguard Map.
-- Writes go through functions that check app.is_admin() (a signed-in, active admin whose session passed 2-step
-- verification) instead of table grants: editors can already update codex.sops (status), and a plain
-- "grant update (title)" would let them rename SOPs as well. The audit triggers on these tables record every change.
-- Safe to run more than once.

-- ───────── change wording ─────────
create or replace function codex.admin_update_sop(p_sop_number integer, p_title text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select app.is_admin()) then
    raise exception 'only an administrator can change SOP details' using errcode = '42501';
  end if;
  if p_title is null or btrim(p_title) = '' then
    raise exception 'the SOP title cannot be empty' using errcode = '22023';
  end if;
  update codex.sops set title = btrim(p_title) where sop_number = p_sop_number;
  if not found then
    raise exception 'unknown SOP number: %', p_sop_number using errcode = '22023';
  end if;
end $$;

create or replace function codex.admin_update_practice(p_code text, p_name text, p_summary text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select app.is_admin()) then
    raise exception 'only an administrator can change practice details' using errcode = '42501';
  end if;
  if p_name is null or btrim(p_name) = '' or p_summary is null or btrim(p_summary) = '' then
    raise exception 'the practice name and description cannot be empty' using errcode = '22023';
  end if;
  update codex.practices set name = btrim(p_name), summary = btrim(p_summary) where code = p_code;
  if not found then
    raise exception 'unknown practice: %', p_code using errcode = '22023';
  end if;
end $$;

-- statement = the "Value" line (called "Language option 02" before); description = the value descriptor.
create or replace function codex.admin_update_value(p_code text, p_name text, p_statement text, p_description text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select app.is_admin()) then
    raise exception 'only an administrator can change value details' using errcode = '42501';
  end if;
  if p_name is null or btrim(p_name) = '' or p_statement is null or btrim(p_statement) = '' or p_description is null or btrim(p_description) = '' then
    raise exception 'the value name, statement and description cannot be empty' using errcode = '22023';
  end if;
  update codex.core_values set name = btrim(p_name), statement = btrim(p_statement), description = btrim(p_description) where code = p_code;
  if not found then
    raise exception 'unknown value: %', p_code using errcode = '22023';
  end if;
end $$;

-- ───────── add new ones ─────────
-- New SOP: next free number, status "in progress". Returns the number.
create or replace function codex.admin_add_sop(p_title text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  if not (select app.is_admin()) then
    raise exception 'only an administrator can add an SOP' using errcode = '42501';
  end if;
  if p_title is null or btrim(p_title) = '' then
    raise exception 'the SOP title cannot be empty' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('codex.admin_add_sop'));
  select coalesce(max(sop_number), 0) + 1 into v_n from codex.sops;
  insert into codex.sops (sop_number, title, status_id)
  values (v_n, btrim(p_title), (select id from codex.sop_statuses where code = 'in-progress'));
  return v_n;
end $$;

-- New practice: next code P<n>. Returns the code.
create or replace function codex.admin_add_practice(p_name text, p_summary text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
  v_code text;
begin
  if not (select app.is_admin()) then
    raise exception 'only an administrator can add a practice' using errcode = '42501';
  end if;
  if p_name is null or btrim(p_name) = '' or p_summary is null or btrim(p_summary) = '' then
    raise exception 'the practice name and description cannot be empty' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('codex.admin_add_practice'));
  select coalesce(max(substr(code, 2)::integer), 0) + 1 into v_n from codex.practices;
  v_code := 'P' || v_n;
  insert into codex.practices (code, name, summary, sort_order)
  values (v_code, btrim(p_name), btrim(p_summary), coalesce((select max(sort_order) from codex.practices), 0) + 1);
  return v_code;
end $$;

-- New value in one of the four areas (p_group_code, e.g. 'how-we-build-trust'). Returns its code (a lower-kebab-case slug of the name).
create or replace function codex.admin_add_value(p_name text, p_statement text, p_description text, p_group_code text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_group uuid;
  v_base text;
  v_code text;
  v_i integer := 1;
begin
  if not (select app.is_admin()) then
    raise exception 'only an administrator can add a value' using errcode = '42501';
  end if;
  if p_name is null or btrim(p_name) = '' or p_statement is null or btrim(p_statement) = '' or p_description is null or btrim(p_description) = '' then
    raise exception 'the value name, statement and description cannot be empty' using errcode = '22023';
  end if;
  select id into v_group from codex.value_groups where code = p_group_code;
  if v_group is null then
    raise exception 'unknown area: %', p_group_code using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('codex.admin_add_value'));
  v_base := trim(both '-' from regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then v_base := 'value'; end if;
  v_code := v_base;
  while exists (select 1 from codex.core_values where code = v_code) loop
    v_i := v_i + 1;
    v_code := v_base || '-' || v_i;
  end loop;
  insert into codex.core_values (group_id, code, name, statement, description, sort_order)
  values (v_group, v_code, btrim(p_name), btrim(p_statement), btrim(p_description), coalesce((select max(sort_order) from codex.core_values), 0) + 1);
  return v_code;
end $$;

comment on function codex.admin_update_sop(integer, text) is 'Admin only: renames an SOP.';
comment on function codex.admin_update_practice(text, text, text) is 'Admin only: changes a practice name and description.';
comment on function codex.admin_update_value(text, text, text, text) is 'Admin only: changes a core value name, statement and descriptor.';
comment on function codex.admin_add_sop(text) is 'Admin only: adds an SOP with the next number. Returns the number.';
comment on function codex.admin_add_practice(text, text) is 'Admin only: adds a practice with the next P-code. Returns the code.';
comment on function codex.admin_add_value(text, text, text, text) is 'Admin only: adds a core value to an area. Returns its code.';

revoke all on function
  codex.admin_update_sop(integer, text), codex.admin_update_practice(text, text, text), codex.admin_update_value(text, text, text, text),
  codex.admin_add_sop(text), codex.admin_add_practice(text, text), codex.admin_add_value(text, text, text, text)
  from public, anon;
grant execute on function
  codex.admin_update_sop(integer, text), codex.admin_update_practice(text, text, text), codex.admin_update_value(text, text, text, text),
  codex.admin_add_sop(text), codex.admin_add_practice(text, text), codex.admin_add_value(text, text, text, text)
  to authenticated;

-- Other open sessions pick the new wording up live (only added when not already there).
do $$
declare t text;
begin
  foreach t in array array['practices', 'core_values'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'codex' and tablename = t) then
      execute format('alter publication supabase_realtime add table codex.%I', t);
    end if;
  end loop;
end $$;
