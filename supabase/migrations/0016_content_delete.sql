-- 0016 content delete: administrators can delete SOPs, practices and values that an administrator added.
-- The original content (SOPs 1-12, practices P1-P9 and the five core values) is built into the Life Cycle and the
-- zero-tolerance logic, so it can be changed (0015) but not deleted. Deleting removes the item's links to practices,
-- SOPs and values and its document record by cascade; the audit triggers record it. Safe to run more than once.

create or replace function codex.admin_delete_sop(p_sop_number integer)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select app.is_admin()) then
    raise exception 'only an administrator can delete an SOP' using errcode = '42501';
  end if;
  if p_sop_number <= 12 then
    raise exception 'the original SOPs (1-12) cannot be deleted' using errcode = '22023';
  end if;
  delete from codex.sops where sop_number = p_sop_number;
  if not found then
    raise exception 'unknown SOP number: %', p_sop_number using errcode = '22023';
  end if;
end $$;

create or replace function codex.admin_delete_practice(p_code text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select app.is_admin()) then
    raise exception 'only an administrator can delete a practice' using errcode = '42501';
  end if;
  if p_code is null or p_code !~ '^P[0-9]+$' or substr(p_code, 2)::integer <= 9 then
    raise exception 'the original practices (P1-P9) cannot be deleted' using errcode = '22023';
  end if;
  delete from codex.practices where code = p_code;
  if not found then
    raise exception 'unknown practice: %', p_code using errcode = '22023';
  end if;
end $$;

create or replace function codex.admin_delete_value(p_code text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select app.is_admin()) then
    raise exception 'only an administrator can delete a value' using errcode = '42501';
  end if;
  if p_code in ('availability', 'mutual-respect', 'consistency', 'customer-first', 'quality') then
    raise exception 'the five original values cannot be deleted' using errcode = '22023';
  end if;
  delete from codex.core_values where code = p_code;
  if not found then
    raise exception 'unknown value: %', p_code using errcode = '22023';
  end if;
end $$;

comment on function codex.admin_delete_sop(integer) is 'Admin only: deletes an SOP added by an administrator (not SOPs 1-12).';
comment on function codex.admin_delete_practice(text) is 'Admin only: deletes a practice added by an administrator (not P1-P9).';
comment on function codex.admin_delete_value(text) is 'Admin only: deletes a value added by an administrator (not the five original values).';

revoke all on function codex.admin_delete_sop(integer), codex.admin_delete_practice(text), codex.admin_delete_value(text) from public, anon;
grant execute on function codex.admin_delete_sop(integer), codex.admin_delete_practice(text), codex.admin_delete_value(text) to authenticated;
