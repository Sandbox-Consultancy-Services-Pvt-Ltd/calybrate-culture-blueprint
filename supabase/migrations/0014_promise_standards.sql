-- 0014: Promise > Standards > Outcomes
-- Each box (leaf area x pillar) gets ONE promise; a promise has many standards; a standard has many outcomes.
-- Administration is split into sub-areas (Human Resources, Finance, IT). Admins may add more in Admin > Structure.
-- Before applying to a live database: export a backup from Admin > Backup.

-- ───────── promises ─────────
create table outcomes.promises (
  id uuid not null default gen_random_uuid(),
  area_id uuid not null,
  pillar_id uuid not null,
  promise text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint pk_promises primary key (id),
  constraint fk_promises_area_id foreign key (area_id) references outcomes.areas (id) on delete restrict,
  constraint fk_promises_pillar_id foreign key (pillar_id) references outcomes.pillars (id) on delete restrict,
  constraint uq_promises_box unique (area_id, pillar_id),
  constraint ck_promises_promise check (char_length(promise) <= 1000),
  constraint fk_promises_created_by foreign key (created_by) references auth.users (id) on delete set null,
  constraint fk_promises_updated_by foreign key (updated_by) references auth.users (id) on delete set null
);
comment on table outcomes.promises is 'The single promise made for one box (leaf area x CCT pillar).';
comment on column outcomes.promises.promise is 'The promise, in words. Written by the Managing Director / Head of Operations.';
create index ix_promises_pillar_id on outcomes.promises (pillar_id);

-- ───────── standards ─────────
create table outcomes.standards (
  id uuid not null default gen_random_uuid(),
  promise_id uuid not null,
  title text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint pk_standards primary key (id),
  constraint fk_standards_promise_id foreign key (promise_id) references outcomes.promises (id) on delete cascade,
  constraint ck_standards_title check (char_length(title) <= 300),
  constraint uq_standards_position unique (promise_id, sort_order) deferrable initially deferred,
  constraint fk_standards_created_by foreign key (created_by) references auth.users (id) on delete set null,
  constraint fk_standards_updated_by foreign key (updated_by) references auth.users (id) on delete set null
);
comment on table outcomes.standards is 'A standard that helps deliver a promise. Holds the outcomes that measure it.';
comment on column outcomes.standards.title is 'The standard, in words.';
comment on column outcomes.standards.sort_order is 'Position within the promise (0-based).';

-- ───────── outcomes now belong to a standard ─────────
alter table outcomes.outcomes add column standard_id uuid;
comment on column outcomes.outcomes.standard_id is 'Standard this outcome measures. area_id / pillar_id are kept in step with the standard''s promise.';

-- Administration is split into sub-areas, so its own outcomes (if any) move to a "General" sub-area first.
insert into outcomes.areas (parent_area_id, code, name, sort_order)
select p.id, 'administration-general', 'General', 99 from outcomes.areas p
 where p.code = 'administration' and exists (select 1 from outcomes.outcomes o where o.area_id = p.id)
on conflict (code) do nothing;
alter table outcomes.outcomes disable trigger trg_outcomes_leaf_area;
update outcomes.outcomes o set area_id = g.id
  from outcomes.areas g, outcomes.areas p
 where p.code = 'administration' and o.area_id = p.id and g.code = 'administration-general';
alter table outcomes.outcomes enable trigger trg_outcomes_leaf_area;

insert into outcomes.areas (parent_area_id, code, name, sort_order)
select p.id, c.code, c.name, c.ord
  from (values ('human-resources', 'Human Resources', 1), ('finance', 'Finance', 2), ('it', 'IT', 3)) as c(code, name, ord)
  join outcomes.areas p on p.code = 'administration'
on conflict (code) do nothing;

-- Backfill: wrap every existing box into one empty promise + a "General" standard.
insert into outcomes.promises (area_id, pillar_id)
select distinct area_id, pillar_id from outcomes.outcomes;
insert into outcomes.standards (promise_id, title, sort_order)
select id, 'General', 0 from outcomes.promises;
update outcomes.outcomes o set standard_id = s.id
  from outcomes.promises p join outcomes.standards s on s.promise_id = p.id
 where p.area_id = o.area_id and p.pillar_id = o.pillar_id;

alter table outcomes.outcomes alter column standard_id set not null;
alter table outcomes.outcomes add constraint fk_outcomes_standard_id foreign key (standard_id) references outcomes.standards (id) on delete cascade;
create index ix_outcomes_standard_id on outcomes.outcomes (standard_id);
alter table outcomes.outcomes drop constraint uq_outcomes_cell_position;
alter table outcomes.outcomes add constraint uq_outcomes_standard_position unique (standard_id, sort_order) deferrable initially deferred;

-- area_id / pillar_id must match the standard's promise.
create or replace function outcomes.enforce_outcome_box() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from outcomes.standards s join outcomes.promises p on p.id = s.promise_id
                  where s.id = new.standard_id and p.area_id = new.area_id and p.pillar_id = new.pillar_id) then
    raise exception 'outcome area/pillar must match its standard''s promise' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_outcomes_box before insert or update of standard_id, area_id, pillar_id on outcomes.outcomes
  for each row execute function outcomes.enforce_outcome_box();
revoke all on function outcomes.enforce_outcome_box() from public;

-- Promises may only sit on leaf areas, like outcomes.
create trigger trg_promises_leaf_area before insert or update of area_id on outcomes.promises
  for each row execute function outcomes.enforce_leaf_area();

-- ───────── audit, RLS, grants, realtime ─────────
create trigger trg_promises_stamp before insert or update on outcomes.promises for each row execute function audit.stamp_row();
create trigger trg_promises_audit after insert or update or delete on outcomes.promises for each row execute function audit.log_change('id');
create trigger trg_standards_stamp before insert or update on outcomes.standards for each row execute function audit.stamp_row();
create trigger trg_standards_audit after insert or update or delete on outcomes.standards for each row execute function audit.log_change('id');

alter table outcomes.promises enable row level security;
alter table outcomes.standards enable row level security;
create policy read_signed_in on outcomes.promises for select to authenticated using ((select app.can_read()));
create policy read_signed_in on outcomes.standards for select to authenticated using ((select app.can_read()));
create policy write_editor_all on outcomes.promises for all to authenticated using ((select app.can_edit())) with check ((select app.can_edit()));
create policy write_editor_all on outcomes.standards for all to authenticated using ((select app.can_edit())) with check ((select app.can_edit()));
revoke all on outcomes.promises, outcomes.standards from anon;
grant select, insert, update, delete on outcomes.promises, outcomes.standards to authenticated;

alter publication supabase_realtime add table outcomes.promises, outcomes.standards;

-- ───────── save one whole box atomically ─────────
-- p_standards: [{ id?, title, items: [{ id?, description, target_value, current_value, status }] }]
create or replace function outcomes.save_box(p_area_code text, p_pillar_code text, p_promise text, p_standards jsonb)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_area uuid; v_pillar uuid; v_prom uuid; v_default uuid; v_status uuid;
  v_std jsonb; v_item jsonb; v_sid uuid; v_oid uuid;
  v_spos integer := 0; v_opos integer; v_skept uuid[] := '{}'; v_okept uuid[];
  v_title text; v_desc text; v_target text; v_current text; v_total integer := 0;
begin
  if not app.can_edit() then raise exception 'permission denied: editing needs the editor or admin role' using errcode = '42501'; end if;
  select id into v_area from outcomes.areas where code = p_area_code and is_active;
  if v_area is null then raise exception 'unknown area: %', p_area_code using errcode = '22023'; end if;
  select id into v_pillar from outcomes.pillars where code = p_pillar_code and is_active;
  if v_pillar is null then raise exception 'unknown or archived pillar: %', p_pillar_code using errcode = '22023'; end if;
  if jsonb_typeof(p_standards) is distinct from 'array' or jsonb_array_length(p_standards) > 20 then
    raise exception 'standards must be an array of at most 20' using errcode = '22023';
  end if;
  select id into v_default from outcomes.outcome_statuses where code = 'not-started';

  insert into outcomes.promises (area_id, pillar_id, promise)
  values (v_area, v_pillar, left(btrim(coalesce(p_promise, '')), 1000))
  on conflict (area_id, pillar_id) do update set promise = excluded.promise
  returning id into v_prom;

  for v_std in select value from jsonb_array_elements(p_standards) loop
    v_title := left(btrim(coalesce(v_std ->> 'title', '')), 300);
    if jsonb_typeof(v_std -> 'items') is distinct from 'array' or jsonb_array_length(v_std -> 'items') > 50 then
      raise exception 'each standard needs an items array of at most 50 outcomes' using errcode = '22023';
    end if;
    -- skip standards with no title and no usable outcomes
    continue when v_title = '' and not exists (
      select 1 from jsonb_array_elements(v_std -> 'items') i
       where btrim(coalesce(i.value ->> 'description', '')) <> '' or btrim(coalesce(i.value ->> 'target_value', '')) <> '' or btrim(coalesce(i.value ->> 'current_value', '')) <> '');
    v_sid := coalesce(nullif(v_std ->> 'id', '')::uuid, gen_random_uuid());
    insert into outcomes.standards as s (id, promise_id, title, sort_order)
    values (v_sid, v_prom, v_title, v_spos)
    on conflict (id) do update set title = excluded.title, sort_order = excluded.sort_order where s.promise_id = excluded.promise_id;
    v_skept := v_skept || v_sid;
    v_spos := v_spos + 1;

    v_opos := 0; v_okept := '{}';
    for v_item in select value from jsonb_array_elements(v_std -> 'items') loop
      v_desc := left(btrim(coalesce(v_item ->> 'description', '')), 1000);
      v_target := left(btrim(coalesce(v_item ->> 'target_value', '')), 200);
      v_current := left(btrim(coalesce(v_item ->> 'current_value', '')), 200);
      continue when v_desc = '' and v_target = '' and v_current = '';
      if coalesce(v_item ->> 'status', '') = '' then v_status := v_default;
      else
        select id into v_status from outcomes.outcome_statuses where code = v_item ->> 'status';
        if v_status is null then raise exception 'unknown status: %', v_item ->> 'status' using errcode = '22023'; end if;
      end if;
      v_oid := coalesce(nullif(v_item ->> 'id', '')::uuid, gen_random_uuid());
      insert into outcomes.outcomes as o (id, area_id, pillar_id, standard_id, status_id, description, target_value, current_value, sort_order)
      values (v_oid, v_area, v_pillar, v_sid, v_status, v_desc, v_target, v_current, v_opos)
      on conflict (id) do update
        set standard_id = excluded.standard_id, status_id = excluded.status_id, description = excluded.description,
            target_value = excluded.target_value, current_value = excluded.current_value, sort_order = excluded.sort_order
        where o.area_id = excluded.area_id and o.pillar_id = excluded.pillar_id;
      v_okept := v_okept || v_oid;
      v_opos := v_opos + 1;
      v_total := v_total + 1;
    end loop;
    -- outcomes dropped from this standard
    delete from outcomes.outcomes o where o.standard_id = v_sid and o.id <> all (v_okept);
  end loop;

  -- outcomes still pointing at removed standards go with them (cascade); remove the standards
  delete from outcomes.standards s where s.promise_id = v_prom and s.id <> all (v_skept);
  -- an entirely empty box leaves no promise row behind
  if btrim(coalesce(p_promise, '')) = '' and v_total = 0 and cardinality(v_skept) = 0 then
    delete from outcomes.promises where id = v_prom;
  end if;
  return jsonb_build_object('promise_id', v_prom, 'outcomes', v_total);
end $$;
comment on function outcomes.save_box(text, text, text, jsonb) is 'Saves a box (promise, standards, outcomes) in one transaction. Editor or admin only.';

revoke all on function outcomes.save_box(text, text, text, jsonb) from public, anon;
grant execute on function outcomes.save_box(text, text, text, jsonb) to authenticated;
drop function outcomes.save_cell_outcomes(text, text, jsonb);

-- ───────── backup / restore include promises and standards ─────────
create or replace function app.admin_export_backup() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not app.is_admin() then raise exception 'permission denied: admin only' using errcode = '42501'; end if;
  select jsonb_build_object(
    'format', 'culture-blueprint-backup', 'version', 1, 'exported_at', now(),
    'pillars', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order), '[]') from (select code, name, color, is_active, sort_order from outcomes.pillars) x),
    'areas', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order), '[]') from (select a.code, a.name, a.is_active, a.sort_order, pa.code as parent_code from outcomes.areas a left join outcomes.areas pa on pa.id = a.parent_area_id) x),
    'promises', (select coalesce(jsonb_agg(to_jsonb(x) order by x.area_code, x.pillar_code), '[]') from (
        select p.id, ar.code as area_code, pi.code as pillar_code, p.promise from outcomes.promises p join outcomes.areas ar on ar.id = p.area_id join outcomes.pillars pi on pi.id = p.pillar_id) x),
    'standards', (select coalesce(jsonb_agg(to_jsonb(x) order by x.promise_id, x.sort_order), '[]') from (
        select id, promise_id, title, sort_order from outcomes.standards) x),
    'outcomes', (select coalesce(jsonb_agg(to_jsonb(x) order by x.area_code, x.pillar_code, x.sort_order), '[]') from (
        select o.id, o.standard_id, ar.code as area_code, pi.code as pillar_code, st.code as status_code, o.description, o.target_value, o.current_value, o.sort_order
          from outcomes.outcomes o join outcomes.areas ar on ar.id = o.area_id join outcomes.pillars pi on pi.id = o.pillar_id join outcomes.outcome_statuses st on st.id = o.status_id) x),
    'practice_sops', (select coalesce(jsonb_agg(jsonb_build_object('practice', p.code, 'sop_number', s.sop_number)), '[]') from codex.practice_sops ps join codex.practices p on p.id = ps.practice_id join codex.sops s on s.id = ps.sop_id),
    'practice_values', (select coalesce(jsonb_agg(jsonb_build_object('practice', p.code, 'value', v.code)), '[]') from codex.practice_values pv join codex.practices p on p.id = pv.practice_id join codex.core_values v on v.id = pv.value_id),
    'sop_status', (select coalesce(jsonb_agg(jsonb_build_object('sop_number', s.sop_number, 'status', st.code)), '[]') from codex.sops s join codex.sop_statuses st on st.id = s.status_id),
    'layout_snapshots', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from (select id, name, description, schema_version, layout, created_at from codex.layout_snapshots) x)
  ) into v;
  return v;
end $$;

create or replace function app.admin_restore_backup(p_backup jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n_out int := 0; n_links int := 0; r jsonb;
begin
  if not app.is_admin() then raise exception 'permission denied: admin only' using errcode = '42501'; end if;
  if p_backup is null or p_backup ->> 'format' <> 'culture-blueprint-backup' or coalesce((p_backup ->> 'version')::int, 0) <> 1 then
    raise exception 'not a Culture Blueprint backup file (version 1)' using errcode = '22023';
  end if;
  insert into codex.layout_snapshots (name, description, layout)
  select 'Automatic copy before restore ' || to_char(now(), 'YYYY-MM-DD HH24:MI'), 'Taken automatically before a backup was restored.',
         jsonb_build_object('schema_version', 2, 'practices', coalesce((
           select jsonb_object_agg(p.code, jsonb_build_object(
             'sops', coalesce((select jsonb_agg(s.sop_number order by s.sop_number) from codex.practice_sops ps join codex.sops s on s.id = ps.sop_id where ps.practice_id = p.id), '[]'),
             'values', coalesce((select jsonb_agg(v.code order by v.code) from codex.practice_values pv join codex.core_values v on v.id = pv.value_id where pv.practice_id = p.id), '[]')))
           from codex.practices p), '{}'));

  for r in select value from jsonb_array_elements(coalesce(p_backup -> 'pillars', '[]')) loop
    insert into outcomes.pillars (code, name, color, is_active, sort_order)
    values (r ->> 'code', r ->> 'name', r ->> 'color', coalesce((r ->> 'is_active')::boolean, true), coalesce((r ->> 'sort_order')::int, 0))
    on conflict (code) do update set name = excluded.name, color = excluded.color, is_active = excluded.is_active, sort_order = excluded.sort_order;
  end loop;
  for r in select value from jsonb_array_elements(coalesce(p_backup -> 'areas', '[]')) where (value ->> 'parent_code') is null loop
    insert into outcomes.areas (code, name, is_active, sort_order) values (r ->> 'code', r ->> 'name', coalesce((r ->> 'is_active')::boolean, true), coalesce((r ->> 'sort_order')::int, 0))
    on conflict (code) do update set name = excluded.name, is_active = excluded.is_active, sort_order = excluded.sort_order;
  end loop;
  for r in select value from jsonb_array_elements(coalesce(p_backup -> 'areas', '[]')) where (value ->> 'parent_code') is not null loop
    insert into outcomes.areas (code, name, is_active, sort_order, parent_area_id)
    values (r ->> 'code', r ->> 'name', coalesce((r ->> 'is_active')::boolean, true), coalesce((r ->> 'sort_order')::int, 0), (select id from outcomes.areas where code = r ->> 'parent_code'))
    on conflict (code) do update set name = excluded.name, is_active = excluded.is_active, sort_order = excluded.sort_order, parent_area_id = excluded.parent_area_id;
  end loop;

  -- data: replace promises (cascades to standards and outcomes)
  delete from outcomes.outcomes where true;
  delete from outcomes.standards where true;
  delete from outcomes.promises where true;
  if jsonb_array_length(coalesce(p_backup -> 'promises', '[]')) > 0 then
    insert into outcomes.promises (id, area_id, pillar_id, promise)
    select (x ->> 'id')::uuid, ar.id, pi.id, coalesce(x ->> 'promise', '')
      from jsonb_array_elements(p_backup -> 'promises') x
      join outcomes.areas ar on ar.code = x ->> 'area_code' join outcomes.pillars pi on pi.code = x ->> 'pillar_code';
    insert into outcomes.standards (id, promise_id, title, sort_order)
    select (x ->> 'id')::uuid, (x ->> 'promise_id')::uuid, coalesce(x ->> 'title', ''), coalesce((x ->> 'sort_order')::int, 0)
      from jsonb_array_elements(coalesce(p_backup -> 'standards', '[]')) x
     where exists (select 1 from outcomes.promises p where p.id = (x ->> 'promise_id')::uuid);
  else
    -- older backup (flat outcomes): rebuild one empty promise + "General" standard per box
    insert into outcomes.promises (area_id, pillar_id)
    select distinct ar.id, pi.id from jsonb_array_elements(coalesce(p_backup -> 'outcomes', '[]')) o
      join outcomes.areas ar on ar.code = o ->> 'area_code' join outcomes.pillars pi on pi.code = o ->> 'pillar_code';
    insert into outcomes.standards (promise_id, title, sort_order) select id, 'General', 0 from outcomes.promises;
  end if;
  insert into outcomes.outcomes (id, area_id, pillar_id, standard_id, status_id, description, target_value, current_value, sort_order)
  select (o ->> 'id')::uuid, ar.id, pi.id,
         coalesce(case when jsonb_array_length(coalesce(p_backup -> 'promises', '[]')) > 0 then nullif(o ->> 'standard_id', '')::uuid end, (select s.id from outcomes.standards s join outcomes.promises p on p.id = s.promise_id where p.area_id = ar.id and p.pillar_id = pi.id order by s.sort_order limit 1)),
         st.id, coalesce(o ->> 'description', ''), coalesce(o ->> 'target_value', ''), coalesce(o ->> 'current_value', ''), coalesce((o ->> 'sort_order')::int, 0)
    from jsonb_array_elements(coalesce(p_backup -> 'outcomes', '[]')) o
    join outcomes.areas ar on ar.code = o ->> 'area_code' join outcomes.pillars pi on pi.code = o ->> 'pillar_code' join outcomes.outcome_statuses st on st.code = o ->> 'status_code';
  get diagnostics n_out = row_count;

  delete from codex.practice_sops where true;
  insert into codex.practice_sops (practice_id, sop_id)
  select p.id, s.id from jsonb_array_elements(coalesce(p_backup -> 'practice_sops', '[]')) x join codex.practices p on p.code = x ->> 'practice' join codex.sops s on s.sop_number = (x ->> 'sop_number')::int;
  get diagnostics n_links = row_count;
  delete from codex.practice_values where true;
  insert into codex.practice_values (practice_id, value_id)
  select p.id, v.id from jsonb_array_elements(coalesce(p_backup -> 'practice_values', '[]')) x join codex.practices p on p.code = x ->> 'practice' join codex.core_values v on v.code = x ->> 'value';
  update codex.sops s set status_id = st.id
    from jsonb_array_elements(coalesce(p_backup -> 'sop_status', '[]')) x join codex.sop_statuses st on st.code = x ->> 'status'
   where s.sop_number = (x ->> 'sop_number')::int and s.status_id <> st.id;
  insert into codex.layout_snapshots (id, name, description, schema_version, layout, created_at)
  select (x ->> 'id')::uuid, x ->> 'name', x ->> 'description', coalesce((x ->> 'schema_version')::int, 2), x -> 'layout', coalesce((x ->> 'created_at')::timestamptz, now())
    from jsonb_array_elements(coalesce(p_backup -> 'layout_snapshots', '[]')) x
  on conflict (id) do nothing;
  return jsonb_build_object('outcomes', n_out, 'sop_links', n_links);
end $$;
