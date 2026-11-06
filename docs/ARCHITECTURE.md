# Architecture & Folder Structure

## Two Vercel projects, one repo

| Project | Serves | Branch | Settings |
|---|---|---|---|
| Culture Blueprint app | `app/` (Vite + React + TypeScript) | `production` | Root Directory `app`, Framework Vite, output `dist` |

The web app lives in `app/` and is deployed from there (Vercel Root Directory `app`). There is no root `package.json`, `vercel.json` or `public/` folder; keep it that way so the build always runs from `app/`.

## Layout

```
.
├── app/                          # The application (everything below is TypeScript/React)
│   ├── src/
│   │   ├── app/                  # Shell: top bar, routing by #hash, zoom, print, error boundary
│   │   ├── features/
│   │   │   ├── auth/             # Sign-in, 2-step verification, roles, idle sign-out
│   │   │   ├── codex/            # Shared SOP / outcome-count read model + realtime
│   │   │   ├── lifecycle/        # Practice Layout: original diagram (static markup + typed controller) and category swimlane layouts (categories/)
│   │   │   ├── cct/              # CCT Framework page
│   │   │   ├── map/              # Safeguard Map (data, model, render, controller)
│   │   │   ├── outcomes/         # CCT Outcomes (React)
│   │   │   ├── admin/            # Admin panes (React)
│   │   │   └── diagram/          # Connector-line drawing shared by the diagrams
│   │   ├── lib/                  # Supabase client, env, username rule
│   │   └── styles/               # Base, hero, footer and print styles
│   ├── e2e/                      # Playwright browser tests (built without a database)
│   └── public/                   # Logos
├── supabase/                     # migrations/, seed.sql, functions/admin-users, backups/
├── scripts/                      # bootstrap-admin.sql
├── docs/                         # This folder; adr/ holds decision records
└── README.md
```

## Conventions

- **Separation of concerns:** pure logic (`model.ts`, `info.ts`) is kept apart from drawing (`render.ts`, React components) and from browser behaviour (`controller.ts`). Pure logic has unit tests.
- **Diagram pages:** the Life Cycle, CCT and Map keep their hand-positioned markup as static `.html` files so they render exactly as designed; behaviour lives in typed controllers. Converting that markup to JSX is optional future work.
- **Naming:** folders and files in `kebab-case` or the existing feature style; one React component per file where practical.
- **Branches:** `production` is deployed to the app project and `main` to the original site. Work on `feature/*`, `fix/*`, `docs/*` branches and merge through pull requests.
- **Commits:** short imperative subject line, for example `Add practice card component`.
- **Decisions:** record significant choices as `docs/adr/NNNN-title.md`.
- **Secrets:** only in `app/.env.local` / Vercel environment variables (never committed). Variables are listed in `app/.env.example`. The browser only ever gets the anon key; the service key lives only in the Edge Function.

## Quality gates

`npm run typecheck`, `npm run lint`, `npm test` (unit and component tests) and `npm run build` must pass, and `npm run test:e2e` covers the main flows in a real browser.

## Decided

- Stack: Vite + React + TypeScript ([ADR 0005](adr/0005-react-vite-typescript.md)).
- Persistence: Supabase (Postgres) called directly from the browser ([ADR 0001](adr/0001-supabase-backend.md), [0002](adr/0002-database-design.md)); sign-in, roles and admin ([ADR 0004](adr/0004-authentication-and-roles.md)).
