-- 0004 codex schema

create table codex.value_groups (
  id uuid not null default gen_random_uuid(),
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint pk_value_groups primary key (id),
  constraint uq_value_groups_code unique (code),
  constraint ck_value_groups_code check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint ck_value_groups_name check (btrim(name) <> ''),
  constraint fk_value_groups_created_by foreign key (created_by) references auth.users (id) on delete set null,
  constraint fk_value_groups_updated_by foreign key (updated_by) references auth.users (id) on delete set null
);
comment on table codex.value_groups is 'Groups the core values into the four areas of the Business Codex.';
comment on column codex.value_groups.id is 'Surrogate primary key.';
comment on column codex.value_groups.code is 'Stable machine-readable identifier (lower-kebab-case).';
comment on column codex.value_groups.name is 'Human-readable label.';
comment on column codex.value_groups.sort_order is 'Display order (ascending).';
comment on column codex.value_groups.created_at is 'When the row was created.';
comment on column codex.value_groups.updated_at is 'When the row was last changed (set by trigger).';
comment on column codex.value_groups.created_by is 'Auth user who created the row; NULL until login is introduced.';
comment on column codex.value_groups.updated_by is 'Auth user who last changed the row; NULL until login is introduced.';

create table codex.core_values (
  id uuid not null default gen_random_uuid(),
  group_id uuid not null,
  code text not null,
  name text not null,
  statement text not null,
  description text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint pk_core_values primary key (id),
  constraint uq_core_values_code unique (code),
  constraint fk_core_values_group_id foreign key (group_id) references codex.value_groups (id) on delete restrict,
  constraint ck_core_values_code check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint fk_core_values_created_by foreign key (created_by) references auth.users (id) on delete set null,
  constraint fk_core_values_updated_by foreign key (updated_by) references auth.users (id) on delete set null
);
comment on table codex.core_values is 'The five core values of the Business Codex (named core_values because VALUES is an SQL keyword).';
comment on column codex.core_values.id is 'Surrogate primary key.';
comment on column codex.core_values.group_id is 'Value group this value belongs to.';
comment on column codex.core_values.code is 'Stable machine-readable identifier (lower-kebab-case).';
comment on column codex.core_values.name is 'Value name, e.g. Availability.';
comment on column codex.core_values.statement is 'One-line pledge shown under the name.';
comment on column codex.core_values.description is 'Full description of what the value means.';
comment on column codex.core_values.sort_order is 'Display order (ascending).';
comment on column codex.core_values.is_active is 'False hides the row without deleting it.';
comment on column codex.core_values.created_at is 'When the row was created.';
comment on column codex.core_values.updated_at is 'When the row was last changed (set by trigger).';
comment on column codex.core_values.created_by is 'Auth user who created the row; NULL until login is introduced.';
comment on column codex.core_values.updated_by is 'Auth user who last changed the row; NULL until login is introduced.';
create index ix_core_values_group_id on codex.core_values (group_id);

create table codex.practices (
  id uuid not null default gen_random_uuid(),
  code text not null,
  name text not null,
  summary text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint pk_practices primary key (id),
  constraint uq_practices_code unique (code),
  constraint ck_practices_code check (code ~ '^P[0-9]+$'),
  constraint fk_practices_created_by foreign key (created_by) references auth.users (id) on delete set null,
  constraint fk_practices_updated_by foreign key (updated_by) references auth.users (id) on delete set null
);
comment on table codex.practices is 'Culture practices (P1 to P9) that safeguard the values.';
comment on column codex.practices.id is 'Surrogate primary key.';
comment on column codex.practices.code is 'Business code, e.g. P1.';
comment on column codex.practices.name is 'Practice name.';
comment on column codex.practices.summary is 'Short description of the practice.';
comment on column codex.practices.sort_order is 'Display order (ascending).';
comment on column codex.practices.is_active is 'False hides the row without deleting it.';
comment on column codex.practices.created_at is 'When the row was created.';
comment on column codex.practices.updated_at is 'When the row was last changed (set by trigger).';
comment on column codex.practices.created_by is 'Auth user who created the row; NULL until login is introduced.';
comment on column codex.practices.updated_by is 'Auth user who last changed the row; NULL until login is introduced.';

create table codex.sop_statuses (
  id uuid not null default gen_random_uuid(),
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint pk_sop_statuses primary key (id),
  constraint uq_sop_statuses_code unique (code),
  constraint ck_sop_statuses_code check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint ck_sop_statuses_name check (btrim(name) <> ''),
  constraint fk_sop_statuses_created_by foreign key (created_by) references auth.users (id) on delete set null,
  constraint fk_sop_statuses_updated_by foreign key (updated_by) references auth.users (id) on delete set null
);
comment on table codex.sop_statuses is 'Lifecycle states of a standard operating procedure.';
comment on column codex.sop_statuses.id is 'Surrogate primary key.';
comment on column codex.sop_statuses.code is 'Stable machine-readable identifier (lower-kebab-case).';
comment on column codex.sop_statuses.name is 'Human-readable label.';
comment on column codex.sop_statuses.sort_order is 'Display order (ascending).';
comment on column codex.sop_statuses.created_at is 'When the row was created.';
comment on column codex.sop_statuses.updated_at is 'When the row was last changed (set by trigger).';
comment on column codex.sop_statuses.created_by is 'Auth user who created the row; NULL until login is introduced.';
comment on column codex.sop_statuses.updated_by is 'Auth user who last changed the row; NULL until login is introduced.';

create table codex.sops (
  id uuid not null default gen_random_uuid(),
  sop_number integer not null,
  title text not null,
  status_id uuid not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint pk_sops primary key (id),
  constraint uq_sops_sop_number unique (sop_number),
  constraint ck_sops_sop_number check (sop_number > 0),
  constraint ck_sops_title check (btrim(title) <> ''),
  constraint fk_sops_status_id foreign key (status_id) references codex.sop_statuses (id) on delete restrict,
  constraint fk_sops_created_by foreign key (created_by) references auth.users (id) on delete set null,
  constraint fk_sops_updated_by foreign key (updated_by) references auth.users (id) on delete set null
);
comment on table codex.sops is 'Standard operating procedures (SOP 1 to SOP 12).';
comment on column codex.sops.id is 'Surrogate primary key.';
comment on column codex.sops.sop_number is 'Business number of the SOP, e.g. 6 for SOP 6.';
comment on column codex.sops.title is 'SOP title.';
comment on column codex.sops.status_id is 'Current status of the SOP.';
comment on column codex.sops.is_active is 'False hides the row without deleting it.';
comment on column codex.sops.created_at is 'When the row was created.';
comment on column codex.sops.updated_at is 'When the row was last changed (set by trigger).';
comment on column codex.sops.created_by is 'Auth user who created the row; NULL until login is introduced.';
comment on column codex.sops.updated_by is 'Auth user who last changed the row; NULL until login is introduced.';
create index ix_sops_status_id on codex.sops (status_id);

create table codex.practice_sops (
  practice_id uuid not null,
  sop_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint pk_practice_sops primary key (practice_id, sop_id),
  constraint fk_practice_sops_practice_id foreign key (practice_id) references codex.practices (id) on delete cascade,
  constraint fk_practice_sops_sop_id foreign key (sop_id) references codex.sops (id) on delete cascade,
  constraint fk_practice_sops_created_by foreign key (created_by) references auth.users (id) on delete set null
);
comment on table codex.practice_sops is 'Which SOPs back which practice (many-to-many).';
comment on column codex.practice_sops.practice_id is 'Practice.';
comment on column codex.practice_sops.sop_id is 'SOP that backs the practice.';
comment on column codex.practice_sops.created_at is 'When the link was created.';
comment on column codex.practice_sops.created_by is 'Auth user who created the link; NULL until login is introduced.';
create index ix_practice_sops_sop_id on codex.practice_sops (sop_id);

create table codex.practice_values (
  practice_id uuid not null,
  value_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint pk_practice_values primary key (practice_id, value_id),
  constraint fk_practice_values_practice_id foreign key (practice_id) references codex.practices (id) on delete cascade,
  constraint fk_practice_values_value_id foreign key (value_id) references codex.core_values (id) on delete cascade,
  constraint fk_practice_values_created_by foreign key (created_by) references auth.users (id) on delete set null
);
comment on table codex.practice_values is 'Which core values a practice safeguards (many-to-many).';
comment on column codex.practice_values.practice_id is 'Practice.';
comment on column codex.practice_values.value_id is 'Core value the practice safeguards.';
comment on column codex.practice_values.created_at is 'When the link was created.';
comment on column codex.practice_values.created_by is 'Auth user who created the link; NULL until login is introduced.';
create index ix_practice_values_value_id on codex.practice_values (value_id);

create table codex.lifecycle_categories (
  id uuid not null default gen_random_uuid(),
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint pk_lifecycle_categories primary key (id),
  constraint uq_lifecycle_categories_code unique (code),
  constraint ck_lifecycle_categories_code check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint ck_lifecycle_categories_name check (btrim(name) <> ''),
  constraint fk_lifecycle_categories_created_by foreign key (created_by) references auth.users (id) on delete set null,
  constraint fk_lifecycle_categories_updated_by foreign key (updated_by) references auth.users (id) on delete set null
);
comment on table codex.lifecycle_categories is 'Top-level grouping of the employee life cycle: Intake, Maintenance & Reattendance, Exit.';
comment on column codex.lifecycle_categories.id is 'Surrogate primary key.';
comment on column codex.lifecycle_categories.code is 'Stable machine-readable identifier (lower-kebab-case).';
comment on column codex.lifecycle_categories.name is 'Human-readable label.';
comment on column codex.lifecycle_categories.sort_order is 'Display order (ascending).';
comment on column codex.lifecycle_categories.created_at is 'When the row was created.';
comment on column codex.lifecycle_categories.updated_at is 'When the row was last changed (set by trigger).';
comment on column codex.lifecycle_categories.created_by is 'Auth user who created the row; NULL until login is introduced.';
comment on column codex.lifecycle_categories.updated_by is 'Auth user who last changed the row; NULL until login is introduced.';

create table codex.lifecycle_stages (
  id uuid not null default gen_random_uuid(),
  category_id uuid not null,
  stage_number integer not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint pk_lifecycle_stages primary key (id),
  constraint uq_lifecycle_stages_stage_number unique (stage_number),
  constraint ck_lifecycle_stages_number check (stage_number between 1 and 99),
  constraint fk_lifecycle_stages_category_id foreign key (category_id) references codex.lifecycle_categories (id) on delete restrict,
  constraint fk_lifecycle_stages_created_by foreign key (created_by) references auth.users (id) on delete set null,
  constraint fk_lifecycle_stages_updated_by foreign key (updated_by) references auth.users (id) on delete set null
);
comment on table codex.lifecycle_stages is 'The seven stages of the organisation life cycle.';
comment on column codex.lifecycle_stages.id is 'Surrogate primary key.';
comment on column codex.lifecycle_stages.category_id is 'Life-cycle category the stage belongs to.';
comment on column codex.lifecycle_stages.stage_number is 'Stage number, 1 to 7.';
comment on column codex.lifecycle_stages.name is 'Stage name.';
comment on column codex.lifecycle_stages.sort_order is 'Display order (ascending).';
comment on column codex.lifecycle_stages.created_at is 'When the row was created.';
comment on column codex.lifecycle_stages.updated_at is 'When the row was last changed (set by trigger).';
comment on column codex.lifecycle_stages.created_by is 'Auth user who created the row; NULL until login is introduced.';
comment on column codex.lifecycle_stages.updated_by is 'Auth user who last changed the row; NULL until login is introduced.';
create index ix_lifecycle_stages_category_id on codex.lifecycle_stages (category_id);

create table codex.lifecycle_steps (
  id uuid not null default gen_random_uuid(),
  stage_id uuid not null,
  parent_step_id uuid,
  step_code text not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint pk_lifecycle_steps primary key (id),
  constraint uq_lifecycle_steps_step_code unique (step_code),
  constraint ck_lifecycle_steps_code check (step_code ~ '^[0-9]+(\.[0-9]+)+$'),
  constraint fk_lifecycle_steps_stage_id foreign key (stage_id) references codex.lifecycle_stages (id) on delete restrict,
  constraint fk_lifecycle_steps_parent_step_id foreign key (parent_step_id) references codex.lifecycle_steps (id) on delete restrict,
  constraint ck_lifecycle_steps_parent check (parent_step_id is null or parent_step_id <> id),
  constraint fk_lifecycle_steps_created_by foreign key (created_by) references auth.users (id) on delete set null,
  constraint fk_lifecycle_steps_updated_by foreign key (updated_by) references auth.users (id) on delete set null
);
comment on table codex.lifecycle_steps is 'Numbered sub-steps within a stage, e.g. 3.1 Pre-Onboarding, 6.1.1 (nested under 6.1).';
comment on column codex.lifecycle_steps.id is 'Surrogate primary key.';
comment on column codex.lifecycle_steps.stage_id is 'Stage the step belongs to.';
comment on column codex.lifecycle_steps.parent_step_id is 'Parent step for nested steps such as 6.1.1; NULL for top-level steps.';
comment on column codex.lifecycle_steps.step_code is 'Dotted step number, e.g. 5.2.';
comment on column codex.lifecycle_steps.name is 'Step name.';
comment on column codex.lifecycle_steps.sort_order is 'Display order (ascending).';
comment on column codex.lifecycle_steps.created_at is 'When the row was created.';
comment on column codex.lifecycle_steps.updated_at is 'When the row was last changed (set by trigger).';
comment on column codex.lifecycle_steps.created_by is 'Auth user who created the row; NULL until login is introduced.';
comment on column codex.lifecycle_steps.updated_by is 'Auth user who last changed the row; NULL until login is introduced.';
create index ix_lifecycle_steps_stage_id on codex.lifecycle_steps (stage_id);
create index ix_lifecycle_steps_parent_step_id on codex.lifecycle_steps (parent_step_id);

create table codex.practice_stages (
  practice_id uuid not null,
  stage_id uuid not null,
  step_id uuid,
  phase_label text,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint pk_practice_stages primary key (practice_id, stage_id),
  constraint fk_practice_stages_practice_id foreign key (practice_id) references codex.practices (id) on delete cascade,
  constraint fk_practice_stages_stage_id foreign key (stage_id) references codex.lifecycle_stages (id) on delete cascade,
  constraint fk_practice_stages_step_id foreign key (step_id) references codex.lifecycle_steps (id) on delete set null,
  constraint fk_practice_stages_created_by foreign key (created_by) references auth.users (id) on delete set null
);
comment on table codex.practice_stages is 'Where in the life cycle a practice applies.';
comment on column codex.practice_stages.practice_id is 'Practice.';
comment on column codex.practice_stages.stage_id is 'Stage the practice applies to.';
comment on column codex.practice_stages.step_id is 'Specific step within the stage, when there is one.';
comment on column codex.practice_stages.phase_label is 'Phase of the practice at this stage, e.g. Phase 02.';
comment on column codex.practice_stages.is_primary is 'False when the practice only influences the stage (for example OPS also affects stages 05 and 06).';
comment on column codex.practice_stages.created_at is 'When the link was created.';
comment on column codex.practice_stages.created_by is 'Auth user who created the link; NULL until login is introduced.';
create index ix_practice_stages_stage_id on codex.practice_stages (stage_id);
create index ix_practice_stages_step_id on codex.practice_stages (step_id);

create table codex.layout_snapshots (
  id uuid not null default gen_random_uuid(),
  name text not null,
  description text,
  schema_version integer not null default 2,
  layout jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint pk_layout_snapshots primary key (id),
  constraint ck_layout_snapshots_name check (char_length(btrim(name)) between 1 and 120),
  constraint ck_layout_snapshots_layout check (jsonb_typeof(layout) = 'object'),
  constraint fk_layout_snapshots_created_by foreign key (created_by) references auth.users (id) on delete set null
);
comment on table codex.layout_snapshots is 'Named, restorable copies of the practice x SOP x value layout.';
comment on column codex.layout_snapshots.id is 'Surrogate primary key.';
comment on column codex.layout_snapshots.name is 'Snapshot name given by the user.';
comment on column codex.layout_snapshots.description is 'Optional note.';
comment on column codex.layout_snapshots.schema_version is 'Version of the layout JSON format.';
comment on column codex.layout_snapshots.layout is 'Layout in database codes: {"practices": {"P1": {"sops": [1], "values": ["quality"]}}}.';
comment on column codex.layout_snapshots.created_at is 'When the snapshot was taken.';
comment on column codex.layout_snapshots.created_by is 'Auth user who took the snapshot; NULL until login is introduced.';
create index ix_layout_snapshots_created_at on codex.layout_snapshots (created_at desc);

create trigger trg_value_groups_stamp before insert or update on codex.value_groups for each row execute function audit.stamp_row();
create trigger trg_value_groups_audit after insert or update or delete on codex.value_groups for each row execute function audit.log_change('id');
create trigger trg_core_values_stamp before insert or update on codex.core_values for each row execute function audit.stamp_row();
create trigger trg_core_values_audit after insert or update or delete on codex.core_values for each row execute function audit.log_change('id');
create trigger trg_practices_stamp before insert or update on codex.practices for each row execute function audit.stamp_row();
create trigger trg_practices_audit after insert or update or delete on codex.practices for each row execute function audit.log_change('id');
create trigger trg_sop_statuses_stamp before insert or update on codex.sop_statuses for each row execute function audit.stamp_row();
create trigger trg_sop_statuses_audit after insert or update or delete on codex.sop_statuses for each row execute function audit.log_change('id');
create trigger trg_sops_stamp before insert or update on codex.sops for each row execute function audit.stamp_row();
create trigger trg_sops_audit after insert or update or delete on codex.sops for each row execute function audit.log_change('id');
create trigger trg_practice_sops_stamp before insert on codex.practice_sops for each row execute function audit.stamp_created();
create trigger trg_practice_sops_audit after insert or update or delete on codex.practice_sops for each row execute function audit.log_change('practice_id', 'sop_id');
create trigger trg_practice_values_stamp before insert on codex.practice_values for each row execute function audit.stamp_created();
create trigger trg_practice_values_audit after insert or update or delete on codex.practice_values for each row execute function audit.log_change('practice_id', 'value_id');
create trigger trg_lifecycle_categories_stamp before insert or update on codex.lifecycle_categories for each row execute function audit.stamp_row();
create trigger trg_lifecycle_categories_audit after insert or update or delete on codex.lifecycle_categories for each row execute function audit.log_change('id');
create trigger trg_lifecycle_stages_stamp before insert or update on codex.lifecycle_stages for each row execute function audit.stamp_row();
create trigger trg_lifecycle_stages_audit after insert or update or delete on codex.lifecycle_stages for each row execute function audit.log_change('id');
create trigger trg_lifecycle_steps_stamp before insert or update on codex.lifecycle_steps for each row execute function audit.stamp_row();
create trigger trg_lifecycle_steps_audit after insert or update or delete on codex.lifecycle_steps for each row execute function audit.log_change('id');
create trigger trg_practice_stages_stamp before insert on codex.practice_stages for each row execute function audit.stamp_created();
create trigger trg_practice_stages_audit after insert or update or delete on codex.practice_stages for each row execute function audit.log_change('practice_id', 'stage_id');
create trigger trg_layout_snapshots_audit after insert or update or delete on codex.layout_snapshots for each row execute function audit.log_change('id');

