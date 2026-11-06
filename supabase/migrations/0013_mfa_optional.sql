-- 0013 per-user two-step switch.
-- An admin can turn two-step verification off for one person (via the admin-users Edge Function).
-- Default stays ON for everyone: the column is true unless an admin changes it.
-- Admins can switch it off for their own account too (they confirm first).

alter table app.profiles add column if not exists mfa_required boolean not null default true;
comment on column app.profiles.mfa_required is 'True (default): the person must pass 2-step verification. False: a password-only session (aal1) is accepted. Changed only by admins.';

-- A session passes when it is 2-step verified, OR the signed-in, active person is exempt.
-- SECURITY DEFINER so it can read the profile regardless of RLS (the profile policies themselves call this function).
create or replace function app.is_mfa() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or exists (select 1 from app.profiles p where p.user_id = auth.uid() and p.is_active and not p.mfa_required)
$$;
comment on function app.is_mfa() is 'True when the session passed 2-step verification, or the active person has two-step turned off.';
