# 0006. Promise > Standards > Outcomes

- Status: accepted
- Date: 2026-11-05

## Context
Each CCT box (leaf area x pillar) held a flat list of outcomes. The Managing Director and the Head of Operations need a clean structure to set their own targets, and Administration was a single row although it covers several functions.

## Decision
- Each box has **one promise** (`outcomes.promises`, unique per area x pillar), **many standards** (`outcomes.standards`) and **many outcomes** per standard (`outcomes.outcomes.standard_id`). An outcome records what it is, an optional target, the current level (`current_value`) and a status chosen from a drop-down.
- `outcomes.outcomes` keeps `area_id` / `pillar_id`; a trigger checks they match the standard's promise. This keeps the CCT page counts, backups and area/pillar filters working unchanged.
- `outcomes.save_box(area, pillar, promise, standards)` replaces `save_cell_outcomes` and saves a whole box atomically (max 20 standards, 50 outcomes each).
- Administration gains the sub-areas Human Resources, Finance and IT (`0014` and `seed.sql`). Admins can add, rename or archive any area, sub-area or pillar in Admin > Structure. Any outcomes that were on Administration itself move to an `administration-general` sub-area.
- Existing outcomes are wrapped into one "General" standard per box with an empty promise. Older CSV files and the browser-only (v1) copy are upgraded the same way.
- The CCT page counts a parent area as the sum of its sub-areas.

## Consequences
- Boxes are now 27 (9 leaf areas x 3 pillars) instead of 21.
- Backup files now carry `promises`, `standards` and `standard_id`; older backups still restore.
