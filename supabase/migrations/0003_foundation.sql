-- 0003 foundation: schemas, shared trigger functions, append-only audit log.
create schema if not exists codex;
create schema if not exists outcomes;
create schema if not exists audit;
comment on schema codex is 'Business Codex: values, practices, SOPs, life-cycle stages and saved layouts.';
comment on schema outcomes is 'CCT Framework outcomes: areas x pillars with measurable outcomes.';
comment on schema audit is 'Append-only change history. Not exposed through the API.';

-- Stamps created/updated columns on full entity tables.
create or replace function audit.stamp_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(new.created_by, auth.uid());
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- Stamps the creation columns on link (many-to-many) tables.
create or replace function audit.stamp_created() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_at := coalesce(new.created_at, now());
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end $$;

create table audit.change_log (
  id bigint generated always as identity,
  occurred_at timestamptz not null default now(),
  schema_name text not null,
  table_name text not null,
  record_key jsonb not null,
  operation text not null,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  constraint pk_change_log primary key (id),
  constraint ck_change_log_operation check (operation in ('INSERT', 'UPDATE', 'DELETE'))
);
create index ix_change_log_table on audit.change_log (schema_name, table_name, occurred_at desc);
create index ix_change_log_occurred_at on audit.change_log (occurred_at desc);
comment on table audit.change_log is 'Append-only history of every insert, update and delete on business tables.';
comment on column audit.change_log.record_key is 'Primary-key columns of the changed row, as JSON.';
comment on column audit.change_log.changed_by is 'auth.uid() of the actor; NULL for anonymous or system changes.';
alter table audit.change_log enable row level security;           -- no policies: invisible to API roles
revoke all on audit.change_log from public, anon, authenticated;

create or replace function audit.log_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  k jsonb := '{}'::jsonb;
  a text;
begin
  -- ignore updates that only touched the audit columns
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at' - 'updated_by') = (to_jsonb(old) - 'updated_at' - 'updated_by') then
    return null;
  end if;
  foreach a in array tg_argv loop
    k := k || jsonb_build_object(a, r -> a);
  end loop;
  insert into audit.change_log (schema_name, table_name, record_key, operation, old_data, new_data, changed_by)
  values (tg_table_schema, tg_table_name, k, tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.uid());
  return null;
end $$;
revoke all on function audit.stamp_row(), audit.stamp_created(), audit.log_change() from public;
