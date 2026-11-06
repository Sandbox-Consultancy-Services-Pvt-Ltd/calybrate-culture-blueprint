# Security guide

## What is protected and how
| Layer | Control |
|---|---|
| Access | Sign-in required. No account, no data (the anonymous role has no access to any table or function). |
| Identity | Username + password, plus a 6-digit authenticator-app code on every sign-in (2-step verification). Public sign-up is off. |
| Roles | **Viewer** reads. **Editor** edits outcomes, the Safeguard Map layout and SOP status. **Admin** also manages users, areas, pillars, backups and sees the activity log. |
| Enforcement | PostgreSQL Row Level Security checks the role and the 2-step level on every read and write. Hiding buttons in the page is only cosmetic. |
| Secrets | The browser only holds the public (publishable) key. The service key exists only inside the `admin-users` Edge Function. |
| Audit | Every insert, update and delete is recorded with who and when (`audit.change_log`); admins read it in Admin > Activity. |
| Sessions | Sign-out after 30 minutes of inactivity; access tokens expire after 1 hour. On sign-out the cached app data in the browser is cleared. |
| Taking data out | Export CSV and Print / PDF are for editors and admins only; viewers read on screen. Each export, print, backup and document open is recorded (`audit.access_log`, Admin > Activity > Exports and downloads). A faint watermark with the person's name and time covers every page and print. |
| Browser protection | `app/vercel.json` sets a Content-Security-Policy, HSTS, frame blocking, `nosniff` and a strict referrer policy. Everything an editor types is escaped before it is shown. |
| Admins | Admins cannot be exempted from 2-step verification (database trigger from migration 0018 and the Edge Function both refuse). |

## Everyday tasks (Admin tab)
- **Add a person:** Admin > Users > Add user. Choose a role. Give them the username and the one-time temporary password privately. At first sign-in they set up their authenticator app and choose their own password.
- **Someone forgot their password:** Users > Reset password (a new temporary password is shown once).
- **Someone lost their phone:** Users > Reset 2-step; they set up the app again at next sign-in.
- **Someone leaves:** Users > Deactivate (blocks sign-in at once, keeps their history) or Delete.
- **Change what someone may do:** change the Role dropdown in the user list.
- **Review activity:** Admin > Activity (filter by person, type, date; export CSV).
- **Back up / restore:** Admin > Backup. Download a backup regularly (the free Supabase plan has no automatic backups). Restoring needs you to type RESTORE and first saves a safety copy of the layout.

## Setting up a new environment
1. Run migrations `0003` to `0008`, `0010`, `0011` and `seed.sql` (see README). Expose the `codex`, `outcomes` and `app` schemas under Project Settings > API.
2. Create the first admin with `scripts/bootstrap-admin.sql`.
3. Create the Edge Function from `supabase/functions/admin-users/index.ts` (Edge Functions > New function; keep "Verify JWT" on). Put its name in the `VITE_ADMIN_FUNCTION` environment variable (see `app/.env.example`).
4. Authentication settings: sign-ups **off**, minimum password length **12** with lower-case, upper-case and digits required, TOTP multi-factor **on**.
5. Never put the service-role key or a management token in the repository, in `app/.env*` files that are committed, or in any `VITE_*` variable (those are shipped to the browser). Revoke management tokens when you are done with them.

## Known limits
- The app is a static site: its own text (the Life Cycle and CCT diagrams) is visible to anyone who can load the URL. Only the data in the database is protected. If that text is sensitive, enable hosting-level protection (for example Vercel Deployment Protection / password protection, or restrict the site to your network) as an extra layer.
- Passwords and authenticator codes are only as safe as the people holding them; use the Deactivate/Reset actions promptly.
- No email "forgot password" (free-plan email limits): an admin resets it.
- Password resets and 2-step resets are not individually listed in the activity log; user creation, role changes, activation and deletion are.
- A person who is allowed to see data can always photograph or retype it. The controls above limit who may see and export, and make a leak traceable (watermark + access log); they cannot prevent it.
- The Content-Security-Policy ships in **report-only** mode. Open the deployed preview, use every view, check the browser console for violations, then rename the header in `app/vercel.json` to `Content-Security-Policy` to enforce it.

## Hardening checklist (run after each deploy of a new migration)
1. Apply migration `0018`. It fails on purpose if any signed-out (anon) policy or table grant is still open.
2. Confirm nothing is open to signed-out visitors:
   `select schemaname, tablename, policyname, roles from pg_policies where 'anon' = any(roles) or policyname like 'temp_open%' or policyname = 'read_all';` must return no rows.
3. Edge Function: set the secret `ALLOWED_ORIGINS` to the production site address(es), comma separated, then redeploy `admin-users`.
4. Supabase Auth settings: leaked-password protection on, minimum length 12, rate limits on, CAPTCHA on sign-in if available on your plan.
5. Rotate any management token (`SUPABASE_ACCESS_TOKEN`) that was kept in a `.env` file; use `supabase login` instead.
6. `supabase/backups/` and `supabase/.temp/` are git-ignored. If a backup was ever committed, remove it from git history and treat its contents as exposed.
7. Review users, roles and 2-step status every quarter (Admin > Users).

## Rotation
- Publishable (anon) key: Supabase > Project Settings > API; update the `VITE_SUPABASE_ANON_KEY` environment variable in Vercel and redeploy.
- Service key: only used inside the Edge Function; rotate in Supabase and redeploy the function.
- User password / lost phone: Admin > Users > Reset password / Reset 2-step.
