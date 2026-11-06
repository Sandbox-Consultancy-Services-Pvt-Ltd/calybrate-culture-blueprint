# 0003. Flexible CCT pillars

- Status: accepted
- Date: 2026-11-03

## Context
The CCT Outcomes page hard-coded three pillar columns (Care, Convenience, Time). The business needs the number of pillars to be able to grow or shrink without a code change.

## Decision
- The page reads pillars, areas and statuses from `outcomes.pillars`, `outcomes.areas` and `outcomes.outcome_statuses`; the original three pillars and seven areas remain as an offline fallback.
- `outcomes.pillars` gains `is_active` (archive without deleting) and `color` (`#RRGGBB`). Migration `supabase/migrations/0010_pillar_management.sql` also lets the API roles insert, update and delete pillars (temporary open policy, like `outcomes.outcomes`), restricts `outcomes.save_cell_outcomes` to active pillars, and adds the table to the realtime publication.
- A pillar that still has outcomes cannot be deleted (foreign key); the UI explains this and offers Archive instead.
- The "Manage pillars" dialog (rename, colour, reorder, archive, add, delete) is shown only when the migration has been applied.

## Consequences
- The table's column count follows the number of active pillars; more than four pillars switches to a horizontally scrolling matrix.
- The CCT Framework tab still shows chips for the original three pillars only; extra pillars are included in its area badges.
- Open write access to pillars is a known, temporary risk until login is introduced.
