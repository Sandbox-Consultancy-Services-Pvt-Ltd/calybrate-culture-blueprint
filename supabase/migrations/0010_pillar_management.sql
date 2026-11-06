-- 0010 pillar management: pillars become editable (rename, colour, reorder, archive, add, delete).
-- Run once in the Supabase SQL editor (or through the management API).

alter table outcomes.pillars
  add column if not exists is_active boolean not null default true,
  add column if not exists color text;

alter table outcomes.pillars
  drop constraint if exists ck_pillars_color;
alter table outcomes.pillars
  add constraint ck_pillars_color check (color is null or color ~ '^#[0-9a-fA-F]{6}$');

comment on column outcomes.pillars.is_active is 'False hides the pillar column without deleting it or its outcomes.';
comment on column outcomes.pillars.color is 'Display colour as #RRGGBB; NULL falls back to a default palette colour.';

update outcomes.pillars set color = '#70BF44' where code = 'care' and color is null;
update outcomes.pillars set color = '#41B6E6' where code = 'convenience' and color is null;
update outcomes.pillars set color = '#003087' where code = 'time' and color is null;

-- Writable through the API (temporary open policies, like outcomes.outcomes; replace when login is added).
-- Deleting a pillar that still has outcomes is rejected by the foreign key from outcomes.outcomes.
grant insert, update, delete on outcomes.pillars to anon, authenticated;
drop policy if exists temp_open_write_all on outcomes.pillars;
create policy temp_open_write_all on outcomes.pillars for all to anon, authenticated using (true) with check (true);

-- Only active pillars accept outcomes.
create or replace function outcomes.save_cell_outcomes(p_area_code text, p_pillar_code text, p_items jsonb)
returns setof outcomes.outcomes
language plpgsql security invoker set search_path = '' as $$
declare
  v_area uuid; v_pillar uuid; v_default uuid; v_status uuid;
  v_item jsonb; v_id uuid; v_pos integer := 0; v_kept uuid[] := '{}';
  v_desc text; v_target text; v_current text;
begin
  select id into v_area from outcomes.areas where code = p_area_code and is_active;
  if v_area is null then raise exception 'unknown area: %', p_area_code using errcode = '22023'; end if;
  select id into v_pillar from outcomes.pillars where code = p_pillar_code and is_active;
  if v_pillar is null then raise exception 'unknown or archived pillar: %', p_pillar_code using errcode = '22023'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 50 then
    raise exception 'items must be an array of at most 50 outcomes' using errcode = '22023';
  end if;
  select id into v_default from outcomes.outcome_statuses where code = 'not-started';

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_desc := left(btrim(coalesce(v_item ->> 'description', '')), 1000);
    v_target := left(btrim(coalesce(v_item ->> 'target_value', '')), 200);
    v_current := left(btrim(coalesce(v_item ->> 'current_value', '')), 200);
    continue when v_desc = '' and v_target = '' and v_current = '';
    if coalesce(v_item ->> 'status', '') = '' then v_status := v_default;
    else
      select id into v_status from outcomes.outcome_statuses where code = v_item ->> 'status';
      if v_status is null then raise exception 'unknown status: %', v_item ->> 'status' using errcode = '22023'; end if;
    end if;
    v_id := coalesce(nullif(v_item ->> 'id', '')::uuid, gen_random_uuid());
    insert into outcomes.outcomes as o (id, area_id, pillar_id, status_id, description, target_value, current_value, sort_order)
    values (v_id, v_area, v_pillar, v_status, v_desc, v_target, v_current, v_pos)
    on conflict (id) do update
      set status_id = excluded.status_id, description = excluded.description, target_value = excluded.target_value,
          current_value = excluded.current_value, sort_order = excluded.sort_order
      where o.area_id = excluded.area_id and o.pillar_id = excluded.pillar_id;
    v_kept := v_kept || v_id;
    v_pos := v_pos + 1;
  end loop;

  delete from outcomes.outcomes o where o.area_id = v_area and o.pillar_id = v_pillar and o.id <> all (v_kept);
  return query select * from outcomes.outcomes o where o.area_id = v_area and o.pillar_id = v_pillar order by o.sort_order;
end $$;
comment on function outcomes.save_cell_outcomes(text, text, jsonb) is 'Saves all outcomes of one area x active pillar cell in a single transaction.';
revoke all on function outcomes.save_cell_outcomes(text, text, jsonb) from public;
grant execute on function outcomes.save_cell_outcomes(text, text, jsonb) to anon, authenticated;

-- Live updates when someone adds, renames or reorders a pillar.
alter publication supabase_realtime add table outcomes.pillars;
