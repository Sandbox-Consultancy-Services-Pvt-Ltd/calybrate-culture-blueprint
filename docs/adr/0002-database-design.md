# 0002. Domain-schema database design

- Status: accepted
- Date: 2026-11-03

## Context
The first database (ADR 0001) was a flat set of prototype tables in `public`, named with prefixes (`codex_`, `cct_`), using display codes as primary keys, CHECK lists for enumerations, free-text life-cycle stages, no audit history, and write functions that deleted and re-inserted rows on every save. It worked, but it was not a design to build on.

## Decision
Rebuild on a clean, conventional design (see `docs/database.md`):

- **Domain schemas**: `codex`, `outcomes` (exposed to the API) and `audit` (private). No table-name prefixes.
- **Surrogate UUID keys** plus a stable unique `code` per business row; lookup tables for enumerations; self-referencing `areas` and `lifecycle_steps` for hierarchies; life-cycle stages and practice-to-stage links modelled as data.
- **Audit**: `created_at/updated_at/created_by/updated_by` on every table and an append-only `audit.change_log` fed by triggers. The `*_by` columns stay empty until login is added.
- **Diff-based write functions** (`codex.apply_layout`, `outcomes.save_box`) that keep ids and `created_at` and log only real changes.
- **Security**: RLS everywhere; reference data read-only; business data writable through temporary open policies (no login yet); explicit grants; internal functions not executable by API roles.
- Migrations `0003`-`0009` (and `seed.sql`) implement it; `0001`/`0002` remain as history. The old tables are removed by `0009_drop_legacy.sql` after verification; a JSON backup is in `supabase/backups/`.

## Consequences
- Adding an area, pillar, status or stage is an `INSERT`, not a migration.
- The pages keep their short identifiers (`P1`, `avail`, status `draft`...) and translate to database codes in one mapping object per script.
- The two new schemas must be listed in the API's exposed schemas (done through the management API; see `docs/database.md`).
- Open write policies are a known, temporary risk until Supabase Auth is introduced.
