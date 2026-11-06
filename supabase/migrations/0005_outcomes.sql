-- 0005 outcomes schema

create table outcomes.pillars (
  id uuid not null default gen_random_uuid(),
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint pk_pillars primary key (id),
  constraint uq_pillars_code unique (code),
  constraint ck_pillars_code check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint ck_pillars_name check (btrim(name) <> ''),
  constraint fk_pillars_created_by foreign key (created_by) references auth.users (id) on delete set null,
  constraint fk_pillars_updated_by foreign key (updated_by) references auth.users (id) on delete set null
);
comment on table outcomes.pillars is 'The three CCT pillars: Care, Convenience, Time.';
comment on column outcomes.pillars.id is 'Surrogate primary key.';
comment on column outcomes.pillars.code is 'Stable machine-readable identifier (lower-kebab-case).';
comment on column outcomes.pillars.name is 'Human-readable label.';
comment on column outcomes.pillars.sort_order is 'Display order (ascending).';
comment on column outcomes.pillars.created_at is 'When the row was created.';
comment on column outcomes.pillars.updated_at is 'When the row was last changed (set by trigger).';
comment on column outcomes.pillars.created_by is 'Auth user who created the row; NULL until login is introduced.';
comment on column outcomes.pillars.updated_by is 'Auth user who last changed the row; NULL until login is introduced.';

create table outcomes.outcome_statuses (
  id uuid not null default gen_random_uuid(),
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint pk_outcome_statuses primary key (id),
  constraint uq_outcome_statuses_code unique (code),
  constraint ck_outcome_statuses_code check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint ck_outcome_statuses_name check (btrim(name) <> ''),
  constraint fk_outcome_statuses_created_by foreign key (created_by) references auth.users (id) on delete set null,
  constraint fk_outcome_statuses_updated_by foreign key (updated_by) references auth.users (id) on delete set null
);
comment on table outcomes.outcome_statuses is 'Progress status of an outcome.';
comment on column outcomes.outcome_statuses.id is 'Surrogate primary key.';
comment on column outcomes.outcome_statuses.code is 'Stable machine-readable identifier (lower-kebab-case).';
comment on column outcomes.outcome_statuses.name is 'Human-readable label.';
comment on column outcomes.outcome_statuses.sort_order is 'Display order (ascending).';
comment on column outcomes.outcome_statuses.created_at is 'When the row was created.';
comment on column outcomes.outcome_statuses.updated_at is 'When the row was last changed (set by trigger).';
comment on column outcomes.outcome_statuses.created_by is 'Auth user who created the row; NULL until login is introduced.';
comment on column outcomes.outcome_statuses.updated_by is 'Auth user who last changed the row; NULL until login is introduced.';

create table outcomes.areas (
  id uuid not null default gen_random_uuid(),
  parent_area_id uuid,
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint pk_areas primary key (id),
  constraint uq_areas_code unique (code),
  constraint fk_areas_parent_area_id foreign key (parent_area_id) references outcomes.areas (id) on delete restrict,
  constraint ck_areas_code check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint ck_areas_parent check (parent_area_id is null or parent_area_id <> id),
  constraint fk_areas_created_by foreign key (created_by) references auth.users (id) on delete set null,
  constraint fk_areas_updated_by foreign key (updated_by) references auth.users (id) on delete set null
);
comment on table outcomes.areas is 'Organisational areas that outcomes are set for. Operations is the parent of Unit A and Unit B.';
comment on column outcomes.areas.id is 'Surrogate primary key.';
comment on column outcomes.areas.parent_area_id is 'Parent area; NULL for top-level areas.';
comment on column outcomes.areas.code is 'Stable machine-readable identifier (lower-kebab-case).';
comment on column outcomes.areas.name is 'Area name.';
comment on column outcomes.areas.sort_order is 'Display order (ascending).';
comment on column outcomes.areas.is_active is 'False hides the row without deleting it.';
comment on column outcomes.areas.created_at is 'When the row was created.';
comment on column outcomes.areas.updated_at is 'When the row was last changed (set by trigger).';
comment on column outcomes.areas.created_by is 'Auth user who created the row; NULL until login is introduced.';
comment on column outcomes.areas.updated_by is 'Auth user who last changed the row; NULL until login is introduced.';
create index ix_areas_parent_area_id on outcomes.areas (parent_area_id);

create table outcomes.outcomes (
  id uuid not null default gen_random_uuid(),
  area_id uuid not null,
  pillar_id uuid not null,
  status_id uuid not null,
  description text not null default '',
  target_value text not null default '',
  current_value text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint pk_outcomes primary key (id),
  constraint fk_outcomes_area_id foreign key (area_id) references outcomes.areas (id) on delete restrict,
  constraint fk_outcomes_pillar_id foreign key (pillar_id) references outcomes.pillars (id) on delete restrict,
  constraint fk_outcomes_status_id foreign key (status_id) references outcomes.outcome_statuses (id) on delete restrict,
  constraint ck_outcomes_description check (char_length(description) <= 1000),
  constraint ck_outcomes_target_value check (char_length(target_value) <= 200),
  constraint ck_outcomes_current_value check (char_length(current_value) <= 200),
  constraint ck_outcomes_has_content check (description <> '' or target_value <> '' or current_value <> ''),
  constraint uq_outcomes_cell_position unique (area_id, pillar_id, sort_order) deferrable initially deferred,
  constraint fk_outcomes_created_by foreign key (created_by) references auth.users (id) on delete set null,
  constraint fk_outcomes_updated_by foreign key (updated_by) references auth.users (id) on delete set null
);
comment on table outcomes.outcomes is 'Measurable outcomes expected from an area, set against a CCT pillar.';
comment on column outcomes.outcomes.id is 'Surrogate primary key.';
comment on column outcomes.outcomes.area_id is 'Area (must be a leaf area).';
comment on column outcomes.outcomes.pillar_id is 'CCT pillar.';
comment on column outcomes.outcomes.status_id is 'Progress status.';
comment on column outcomes.outcomes.description is 'The measurable outcome, in words.';
comment on column outcomes.outcomes.target_value is 'Target figure, e.g. 90% or above.';
comment on column outcomes.outcomes.current_value is 'Current figure, e.g. 84%.';
comment on column outcomes.outcomes.sort_order is 'Position within the area x pillar cell (0-based).';
comment on column outcomes.outcomes.created_at is 'When the row was created.';
comment on column outcomes.outcomes.updated_at is 'When the row was last changed (set by trigger).';
comment on column outcomes.outcomes.created_by is 'Auth user who created the row; NULL until login is introduced.';
comment on column outcomes.outcomes.updated_by is 'Auth user who last changed the row; NULL until login is introduced.';
create index ix_outcomes_status_id on outcomes.outcomes (status_id);
create index ix_outcomes_pillar_id on outcomes.outcomes (pillar_id);

-- Outcomes may only be recorded against leaf areas (areas without children).
create or replace function outcomes.enforce_leaf_area() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from outcomes.areas a where a.parent_area_id = new.area_id) then
    raise exception 'outcomes can only be recorded against leaf areas' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_outcomes_leaf_area before insert or update of area_id on outcomes.outcomes
  for each row execute function outcomes.enforce_leaf_area();
revoke all on function outcomes.enforce_leaf_area() from public;

create trigger trg_pillars_stamp before insert or update on outcomes.pillars for each row execute function audit.stamp_row();
create trigger trg_pillars_audit after insert or update or delete on outcomes.pillars for each row execute function audit.log_change('id');
create trigger trg_outcome_statuses_stamp before insert or update on outcomes.outcome_statuses for each row execute function audit.stamp_row();
create trigger trg_outcome_statuses_audit after insert or update or delete on outcomes.outcome_statuses for each row execute function audit.log_change('id');
create trigger trg_areas_stamp before insert or update on outcomes.areas for each row execute function audit.stamp_row();
create trigger trg_areas_audit after insert or update or delete on outcomes.areas for each row execute function audit.log_change('id');
create trigger trg_outcomes_stamp before insert or update on outcomes.outcomes for each row execute function audit.stamp_row();
create trigger trg_outcomes_audit after insert or update or delete on outcomes.outcomes for each row execute function audit.log_change('id');

