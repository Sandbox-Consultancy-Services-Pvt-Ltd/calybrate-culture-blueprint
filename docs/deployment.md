# Deploying the new app (second Vercel project)

The app in `app/` deploys as its own Vercel project (Root Directory `app`), backed by its **own Supabase project**.

## 1. New Supabase project
1. Create a new project at supabase.com (do not reuse the live one: migration `0011` drops legacy tables).
2. SQL editor: run `supabase/migrations/*.sql` in order, then `supabase/seed.sql`.
3. Authentication > Providers: disable public sign-ups.
4. Deploy the Edge Function: `supabase functions deploy admin-users --project-ref <ref>`.
5. Create the first admin: edit and run `scripts/bootstrap-admin.sql`.
6. Copy Project URL and **anon** key (Settings > API). Never use `service_role` in the browser.

## 2. New Vercel project (the Vite + React app in `app/`)
1. Vercel > Add New > Project > import this repo; name it e.g. `culture-blueprint-v2`.
2. Settings > Git: Production Branch = `production`.
3. Settings > Build & Development:
   - Framework Preset: Vite
   - Root Directory: `app`
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Settings > Environment Variables (anon key only, never `service_role`):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `VITE_ADMIN_FUNCTION` = the name the Edge Function is deployed under (`admin-users`, from `supabase/functions/admin-users`)
   - optional: `VITE_USER_DOMAIN`, `VITE_IDLE_MINUTES`
5. Deploy. Links such as `#cct`, `#map`, `#outcomes`, `#admin` keep working.

### Troubleshooting
- `bash scripts/build-vercel.sh: No such file or directory` (exit 127): the project still has the old build command. Settings > Build & Development: set Root Directory to `app`, Framework to Vite, and turn off the Build Command / Output Directory overrides (defaults are `npm run build` and `dist`). Redeploy.
- "Not set up yet" screen (or, on older builds, no sign-in and "Administration needs the shared database"): the `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` variables are missing for that deployment. They are baked in at build time, so add them for the **Production** environment (and Preview if you use previews) and redeploy. A production build never opens the app without them.
- Admin tab says a function is not found: `VITE_ADMIN_FUNCTION` does not match the deployed Edge Function name.

## Local run and checks (from `app/`)
```
cp .env.example .env.local   # fill in the Supabase URL and anon key
npm install
npm run dev                  # http://localhost:5173
npm run typecheck && npm run lint && npm test && npm run build
npm run test:e2e             # browser tests; built without a database
```
