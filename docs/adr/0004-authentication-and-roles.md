# 0004. Sign-in, roles and an admin panel

- Status: accepted
- Date: 2026-11-03

## Context
The app holds company-sensitive data but was fully open: the public key was in the page and every table allowed anonymous read and write (ADR 0001-0003 called this temporary). The Supabase free plan has a small email quota, so invite and reset emails are not an option.

## Decision
- **Sign-in required for everything.** Supabase Auth with username + password (internal address `<username>@users.example.com`, never emailed) and **mandatory authenticator-app 2-step verification**. Public sign-up is disabled; passwords need 12+ characters with upper, lower and a number.
- **Roles** in `app.profiles`: Viewer (read), Editor (edit outcomes, layout, SOP status), Admin (everything incl. users, areas, pillars, backups, activity log).
- **The database enforces it.** Row Level Security checks a signed-in, active profile whose session passed 2-step verification (`aal2`); writes need Editor/Admin; structure needs Admin. `anon` has no access at all. The write functions also check the role.
- **Admin-only user management** runs in an Edge Function (the only holder of the service key): create with a generated temporary password (shown once), change role, activate/deactivate, reset password, reset 2-step, delete. It refuses non-admins, sessions without 2-step, and actions that would remove the last admin or lock out the caller.
- **Admin tab** in the page: users, activity log (from `audit.change_log`), backup and restore, areas and pillars.
- The activity log names the person behind each change (from `auth.uid()`, or from `updated_by` for changes made through the admin function).
- Sessions end after 30 minutes without activity.

## Consequences
- Nobody can read or change data without an account, a password and an authenticator code.
- Admins hand out temporary passwords privately; there is no email "forgot password": an admin resets it.
- The page's own HTML (static text of the Life Cycle and CCT diagrams) is still served to anyone who can reach the URL; only the database content is protected. Add hosting-level protection (see docs/security.md) if that text is sensitive.
- Free-plan Supabase has no automatic backups, so the admin Backup tab is the safety net.
