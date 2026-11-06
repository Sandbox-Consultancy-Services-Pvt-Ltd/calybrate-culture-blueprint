-- 0017 admin settings and announcements.
-- app.settings: small key/value settings an administrator can change (today: the idle sign-out time).
-- app.announcements: a short message an administrator can show to everyone who is signed in.
-- Tables have no direct grants. Everybody reads through the get_* functions, and only administrators write,
-- through functions that check app.is_admin(). The audit triggers record every change (shown in Activity).
-- Safe to run more than once.

-- ───────── settings ─────────
create table if not exists app.settings (
  key        text primary key,
  value      jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table app.settings enable row level security;
revoke all on app.settings from public, anon, authenticated;

drop trigger if exists trg_settings_stamp on app.settings;
create trigger trg_settings_stamp before insert or update on app.settings for each row execute function audit.stamp_row();
drop trigger if exists trg_settings_audit on app.settings;
create trigger trg_settings_audit after insert or update or delete on app.settings for each row execute function audit.log_change('key');

-- Everyone who is signed in can read the settings.
create or replace function app.get_settings() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when (select app.can_read())
    then coalesce((select jsonb_object_agg(key, value) from app.settings), '{}'::jsonb)
    else '{}'::jsonb end
$$;

-- Only known keys with sensible values are accepted.
create or replace function app.admin_set_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select app.is_admin()) then
    raise exception 'only an administrator can change settings' using errcode = '42501';
  end if;
  if p_key = 'idle_minutes' then
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not between 5 and 240 or (p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric) then
      raise exception 'the idle time must be a whole number of minutes from 5 to 240' using errcode = '22023';
    end if;
  else
    raise exception 'unknown setting: %', p_key using errcode = '22023';
  end if;
  insert into app.settings (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
end $$;

-- ───────── announcements ─────────
create table if not exists app.announcements (
  id         uuid primary key default gen_random_uuid(),
  message    text not null check (char_length(btrim(message)) between 1 and 300),
  tone       text not null default 'info' check (tone in ('info', 'warning', 'success')),
  is_active  boolean not null default true,
  starts_at  timestamptz,
  ends_at    timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
alter table app.announcements enable row level security;
revoke all on app.announcements from public, anon, authenticated;

drop trigger if exists trg_announcements_stamp on app.announcements;
create trigger trg_announcements_stamp before insert or update on app.announcements for each row execute function audit.stamp_row();
drop trigger if exists trg_announcements_audit on app.announcements;
create trigger trg_announcements_audit after insert or update or delete on app.announcements for each row execute function audit.log_change('id');

-- Everyone signed in: the announcements that are on right now, newest first.
create or replace function app.get_active_announcements()
returns table (id uuid, message text, tone text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.message, a.tone
    from app.announcements a
   where (select app.can_read())
     and a.is_active
     and (a.starts_at is null or a.starts_at <= now())
     and (a.ends_at is null or a.ends_at > now())
   order by a.created_at desc
   limit 3
$$;

-- Administrators: every announcement, for the management list.
create or replace function app.admin_list_announcements()
returns table (id uuid, message text, tone text, is_active boolean, starts_at timestamptz, ends_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select app.is_admin()) then
    raise exception 'only an administrator can see all announcements' using errcode = '42501';
  end if;
  return query
    select a.id, a.message, a.tone, a.is_active, a.starts_at, a.ends_at, a.created_at
      from app.announcements a order by a.created_at desc limit 200;
end $$;

-- Create (p_id null) or change one. Returns its id.
create or replace function app.admin_save_announcement(p_id uuid, p_message text, p_tone text, p_is_active boolean, p_starts_at timestamptz, p_ends_at timestamptz)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id;
begin
  if not (select app.is_admin()) then
    raise exception 'only an administrator can change announcements' using errcode = '42501';
  end if;
  if p_message is null or btrim(p_message) = '' or char_length(btrim(p_message)) > 300 then
    raise exception 'the message must be 1 to 300 characters' using errcode = '22023';
  end if;
  if p_tone not in ('info', 'warning', 'success') then
    raise exception 'unknown tone: %', p_tone using errcode = '22023';
  end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then
    raise exception 'the end must be after the start' using errcode = '22023';
  end if;
  if v_id is null then
    insert into app.announcements (message, tone, is_active, starts_at, ends_at)
    values (btrim(p_message), p_tone, coalesce(p_is_active, true), p_starts_at, p_ends_at)
    returning id into v_id;
  else
    update app.announcements
       set message = btrim(p_message), tone = p_tone, is_active = coalesce(p_is_active, true), starts_at = p_starts_at, ends_at = p_ends_at
     where id = v_id;
    if not found then
      raise exception 'unknown announcement' using errcode = '22023';
    end if;
  end if;
  return v_id;
end $$;

create or replace function app.admin_delete_announcement(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select app.is_admin()) then
    raise exception 'only an administrator can delete announcements' using errcode = '42501';
  end if;
  delete from app.announcements where id = p_id;
end $$;

revoke all on function app.get_settings(), app.admin_set_setting(text, jsonb),
  app.get_active_announcements(), app.admin_list_announcements(),
  app.admin_save_announcement(uuid, text, text, boolean, timestamptz, timestamptz), app.admin_delete_announcement(uuid)
  from public, anon;
grant execute on function app.get_settings(), app.admin_set_setting(text, jsonb),
  app.get_active_announcements(), app.admin_list_announcements(),
  app.admin_save_announcement(uuid, text, text, boolean, timestamptz, timestamptz), app.admin_delete_announcement(uuid)
  to authenticated;
