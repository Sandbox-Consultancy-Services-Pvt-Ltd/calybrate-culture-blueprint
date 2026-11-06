-- Creates the FIRST admin account directly in the database (no email is sent).
-- Run once in the Supabase SQL editor after migration 0011. Replace the two placeholders first.
--   USERNAME : lower-case, 3-16 chars (letters and numbers, plus at most one dot, dash or underscore)
--   PASSWORD : a temporary password, at least 12 characters with upper-case, lower-case and a number.
--              The person must choose their own at first sign-in.
-- Afterwards create everyone else from the Admin tab (Users > Add user).
with u as (
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
          'USERNAME@users.example.com', crypt('PASSWORD', gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{"username":"USERNAME"}', now(), now(), '', '', '', '')
  returning id, email),
i as (
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now(), now() from u
  returning user_id)
insert into app.profiles (user_id, username, display_name, role_id, must_change_password)
select u.id, 'USERNAME', 'Administrator', (select id from app.roles where code = 'admin'), true from u;
