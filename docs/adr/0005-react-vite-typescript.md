# 0005. Move the app to Vite + React + TypeScript

- Status: accepted
- Date: 2026-11-04

## Context
The app is one 2,900-line HTML file with inline CSS and four inline scripts sharing `window` globals, plus CDN dependencies. It has no tests, types, linting or bundler. A script error can blank a page and changes break silently.

## Decision
- **Vite + React 18 + TypeScript (strict)** in a sub-folder `app/`, with its own `package.json`. No root `package.json` or `vercel.json` is added, so the build always runs from `app/`.
- **HashRouter** keeps existing `#cct`, `#map`, `#outcomes`, `#admin` links valid.
- `@supabase/supabase-js` from npm; config through `VITE_*` environment variables.
- Vitest + Testing Library for unit/component tests, Playwright for e2e and screenshot parity.
- **Side by side, view by view.** Each view was ported and compared against the legacy page before the old static copy of the app (`src/`) was removed from the `production` branch. It remains in git history and on `main` / `feature/auth-roles-admin`.
- Diagram drawing/measuring logic is ported, not re-derived, so visuals stay identical.
- Supabase (ADR 0001-0004), the `admin-users` Edge Function and the migrations are unchanged.

## Consequences
- A build step and Node toolchain are now required for the new app.
- The new app deploys as its own Vercel project with Root Directory `app`.
- The frozen root pages stay frozen until a separate decision to port them.
