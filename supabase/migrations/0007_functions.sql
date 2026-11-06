-- 0007 functions: transactional write APIs used by the pages.

-- Applies a layout (practice -> SOPs / values) and optionally the set of finished SOPs.
-- Diff based: only links that actually changed are inserted or deleted, which keeps the audit log meaningful.
-- Practices that are not mentioned in the layout are left untouched.
-- Layout format: {"practices": {"P1": {"sops": [1, 5], "values": ["quality"]}, ...}}
create or replace function codex.apply_layout(p_layout jsonb, p_done_sops integer[] default null)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_practices jsonb := p_layout -> 'practices';
  v_done uuid;
  v_open uuid;
  v_bad text;
begin
  if p_layout is null or jsonb_typeof(v_practices) is distinct from 'object' then
    raise exception 'invalid layout: a "practices" object is required' using errcode = '22023';
  end if;

  select k into v_bad from jsonb_object_keys(v_practices) k
   where not exists (select 1 from codex.practices p where p.code = k) limit 1;
  if v_bad is not null then raise exception 'unknown practice: %', v_bad using errcode = '22023'; end if;

  select n into v_bad from jsonb_each(v_practices) e, jsonb_array_elements_text(coalesce(e.value -> 'sops', '[]'::jsonb)) n
   where not exists (select 1 from codex.sops s where s.sop_number::text = n) limit 1;
  if v_bad is not null then raise exception 'unknown SOP number: %', v_bad using errcode = '22023'; end if;

  select n into v_bad from jsonb_each(v_practices) e, jsonb_array_elements_text(coalesce(e.value -> 'values', '[]'::jsonb)) n
   where not exists (select 1 from codex.core_values v where v.code = n) limit 1;
  if v_bad is not null then raise exception 'unknown value: %', v_bad using errcode = '22023'; end if;

  -- SOP links
  delete from codex.practice_sops ps
   where ps.practice_id in (select p.id from jsonb_object_keys(v_practices) k join codex.practices p on p.code = k)
     and not exists (
     select 1 from jsonb_each(v_practices) e
       join codex.practices p on p.code = e.key
       cross join lateral jsonb_array_elements_text(coalesce(e.value -> 'sops', '[]'::jsonb)) n
       join codex.sops s on s.sop_number::text = n
      where p.id = ps.practice_id and s.id = ps.sop_id);
  insert into codex.practice_sops (practice_id, sop_id)
  select p.id, s.id from jsonb_each(v_practices) e
    join codex.practices p on p.code = e.key
    cross join lateral jsonb_array_elements_text(coalesce(e.value -> 'sops', '[]'::jsonb)) n
    join codex.sops s on s.sop_number::text = n
  on conflict do nothing;

  -- value links
  delete from codex.practice_values pv
   where pv.practice_id in (select p.id from jsonb_object_keys(v_practices) k join codex.practices p on p.code = k)
     and not exists (
     select 1 from jsonb_each(v_practices) e
       join codex.practices p on p.code = e.key
       cross join lateral jsonb_array_elements_text(coalesce(e.value -> 'values', '[]'::jsonb)) n
       join codex.core_values v on v.code = n
      where p.id = pv.practice_id and v.id = pv.value_id);
  insert into codex.practice_values (practice_id, value_id)
  select p.id, v.id from jsonb_each(v_practices) e
    join codex.practices p on p.code = e.key
    cross join lateral jsonb_array_elements_text(coalesce(e.value -> 'values', '[]'::jsonb)) n
    join codex.core_values v on v.code = n
  on conflict do nothing;

  -- SOP status
  if p_done_sops is not null then
    select id into v_done from codex.sop_statuses where code = 'done';
    select id into v_open from codex.sop_statuses where code = 'in-progress';
    update codex.sops s
       set status_id = case when s.sop_number = any (p_done_sops) then v_done else v_open end
     where s.status_id is distinct from case when s.sop_number = any (p_done_sops) then v_done else v_open end;
  end if;
end $$;
comment on function codex.apply_layout(jsonb, integer[]) is 'Applies a practice/SOP/value layout and optionally the finished SOPs, changing only what differs.';

-- Replaces the outcomes of one area x pillar cell. Existing rows are updated in place (ids and created_at survive);
-- rows missing from the input are deleted; new rows are inserted.
-- Item format: [{"id": uuid|null, "description": "", "target_value": "", "current_value": "", "status": "on-track"}]
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
  select id into v_pillar from outcomes.pillars where code = p_pillar_code;
  if v_pillar is null then raise exception 'unknown pillar: %', p_pillar_code using errcode = '22023'; end if;
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
comment on function outcomes.save_cell_outcomes(text, text, jsonb) is 'Saves all outcomes of one area x pillar cell in a single transaction.';

revoke all on function codex.apply_layout(jsonb, integer[]) from public;
revoke all on function outcomes.save_cell_outcomes(text, text, jsonb) from public;
grant execute on function codex.apply_layout(jsonb, integer[]) to anon, authenticated;
grant execute on function outcomes.save_cell_outcomes(text, text, jsonb) to anon, authenticated;
