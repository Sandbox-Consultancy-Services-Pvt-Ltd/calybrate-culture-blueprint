-- Culture Blueprint: shared schema for the Codex map and CCT Outcomes pages.
-- No auth in this phase: anon may read and write (see docs/adr/0001-supabase-backend.md).
-- Run in the Supabase SQL editor, then run supabase/seed.sql.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ───────── CCT Outcomes ─────────
create table public.cct_outcomes (
  id          uuid primary key default gen_random_uuid(),
  area        text not null check (area in ('unit-a','unit-b','team-1','team-2','administration','team-3','team-4')),
  pillar      text not null check (pillar in ('care','convenience','time')),
  position    int  not null default 0,
  text        text not null default '' check (char_length(text)    <= 1000),
  target      text not null default '' check (char_length(target)  <= 200),
  current     text not null default '' check (char_length(current) <= 200),
  status      text not null default 'draft' check (status in ('draft','track','risk','done')),
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index cct_outcomes_cell_idx on public.cct_outcomes (area, pillar, position);
create trigger cct_outcomes_updated before update on public.cct_outcomes
  for each row execute function public.set_updated_at();

-- Atomically replace all items of one cell (mirrors the old PUT /api/outcomes).
create or replace function public.replace_cct_cell(p_area text, p_pillar text, p_items jsonb, p_by text default null)
returns setof public.cct_outcomes
language plpgsql as $$
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 50 then
    raise exception 'invalid items';
  end if;
  delete from public.cct_outcomes where area = p_area and pillar = p_pillar;
  return query
  insert into public.cct_outcomes (id, area, pillar, position, text, target, current, status, updated_by)
  select coalesce(nullif(x.item->>'id','')::uuid, gen_random_uuid()), p_area, p_pillar, (x.ord - 1)::int,
         left(coalesce(x.item->>'text',''), 1000), left(coalesce(x.item->>'target',''), 200),
         left(coalesce(x.item->>'current',''), 200),
         case when x.item->>'status' in ('draft','track','risk','done') then x.item->>'status' else 'draft' end,
         p_by
  from jsonb_array_elements(p_items) with ordinality as x(item, ord)
  where coalesce(x.item->>'text','') <> '' or coalesce(x.item->>'target','') <> '' or coalesce(x.item->>'current','') <> ''
  returning *;
end $$;

-- ───────── Codex map ─────────
create table public.codex_values (
  id text primary key, name text not null, tagline text not null, area_idx int not null, description text not null,
  sort int not null default 0
);
create table public.codex_practices (
  id text primary key, name text not null, stage text not null, description text not null, sort int not null default 0
);
create table public.codex_sops (
  n int primary key, title text not null, done boolean not null default false, updated_at timestamptz not null default now()
);
create trigger codex_sops_updated before update on public.codex_sops
  for each row execute function public.set_updated_at();

create table public.codex_practice_sops (
  practice_id text not null references public.codex_practices(id) on delete cascade,
  sop_n int not null references public.codex_sops(n) on delete cascade,
  primary key (practice_id, sop_n)
);
create table public.codex_practice_values (
  practice_id text not null references public.codex_practices(id) on delete cascade,
  value_id text not null references public.codex_values(id) on delete cascade,
  primary key (practice_id, value_id)
);

-- Saved / versioned layouts. state = { ps:{P1:[sop n..]}, pv:{P1:[value id..]} } (same as Export JSON).
create table public.codex_layouts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state jsonb not null,
  created_at timestamptz not null default now()
);

-- Replace the whole live link set in one transaction (used by the Save button).
-- Supabase blocks DELETE without WHERE (pg-safeupdate), hence "where true".
create or replace function public.save_codex_state(p_state jsonb, p_done int[] default null)
returns void language plpgsql as $$
begin
  delete from public.codex_practice_sops where true;
  delete from public.codex_practice_values where true;
  insert into public.codex_practice_sops (practice_id, sop_n)
    select e.key, v::int from jsonb_each(p_state->'ps') as e, jsonb_array_elements_text(e.value) as v;
  insert into public.codex_practice_values (practice_id, value_id)
    select e.key, v from jsonb_each(p_state->'pv') as e, jsonb_array_elements_text(e.value) as v;
  if p_done is not null then
    update public.codex_sops set done = (n = any(p_done)) where true;
  end if;
end $$;

-- ───────── RLS: open to anon for now ─────────
do $$
declare t text;
begin
  foreach t in array array['cct_outcomes','codex_values','codex_practices','codex_sops',
                           'codex_practice_sops','codex_practice_values','codex_layouts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "anon all" on public.%I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Realtime for the CCT page.
alter publication supabase_realtime add table public.cct_outcomes;
