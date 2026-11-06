# 0001. Supabase as the shared backend

- Status: accepted
- Date: 2026-11-03

## Context
Pages persist to browser `localStorage` (Codex map) or a Vercel Blob JSON file (CCT Outcomes, `backend/`). The team needs shared, durable data across browsers. The deployed site is static and the root HTML files are frozen.

## Decision
Use one Supabase (Postgres) project. Pages stay standalone HTML and call it directly with `supabase-js` (CDN) and the public anon key, protected by Row Level Security. No auth in this phase: RLS policies allow anon read/write. CCT Outcomes is a tab of the same page as the Codex views. Schema lives in `supabase/migrations/`. The Next.js idea and the Vercel Blob backend are dropped (the `backend/` folder and the standalone CCT Outcomes page have been deleted; the database was later redesigned in ADR 0002).

## Consequences
- No server to deploy or build step to add; the Vercel static deploy is unchanged.
- Anyone with the URL can edit data (the anon key is public). Add Supabase Auth and tighten RLS before wider use; the CCT page already handles view-only (401/403).
- The service-role key must never be used in the browser or committed.
- Pages keep a localStorage fallback when Supabase is unreachable.
- Views are connected through one read-model, `src/services/codex-store.js`: SOP placements, titles and Done flags (edited in the Safeguard Map) drive the Life Cycle; outcome counts (edited in CCT Outcomes) drive the CCT Framework chips and badges. Without a database those views keep their static markup. Stage narrative and diagram layout are not in the database.
