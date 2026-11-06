-- 0012 documents: one current PDF per SOP and per practice.
-- The file lives in the private Storage bucket "documents" (sops/<number>.pdf, practices/<code>.pdf);
-- codex.documents records its name, size and when it was uploaded. Replacing a file overwrites both.
-- Read: any signed-in person whose session passed 2-step verification. Upload / replace / remove: editors and admins.

-- ───────── table ─────────
create table codex.documents (
  id uuid not null default gen_random_uuid(),
  sop_id uuid,
  practice_id uuid,
  file_name text not null,
  size_bytes bigint not null,
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid default auth.uid(),
  constraint pk_documents primary key (id),
  constraint uq_documents_sop_id unique (sop_id),
  constraint uq_documents_practice_id unique (practice_id),
  constraint ck_documents_one_owner check ((sop_id is not null)::int + (practice_id is not null)::int = 1),
  constraint ck_documents_file_name check (btrim(file_name) <> '' and file_name ~* '\.pdf$'),
  constraint ck_documents_size check (size_bytes > 0 and size_bytes <= 20971520),
  constraint fk_documents_sop_id foreign key (sop_id) references codex.sops (id) on delete cascade,
  constraint fk_documents_practice_id foreign key (practice_id) references codex.practices (id) on delete cascade,
  constraint fk_documents_uploaded_by foreign key (uploaded_by) references auth.users (id) on delete set null
);
comment on table codex.documents is 'The one current PDF for an SOP or a practice. The file itself is in Storage bucket "documents".';
comment on column codex.documents.sop_id is 'SOP the document belongs to (exactly one of sop_id / practice_id is set).';
comment on column codex.documents.practice_id is 'Practice the document belongs to (exactly one of sop_id / practice_id is set).';
comment on column codex.documents.file_name is 'Original file name, shown to people and used for the download.';
comment on column codex.documents.size_bytes is 'File size in bytes (at most 20 MB).';
comment on column codex.documents.storage_path is 'Object path inside the "documents" bucket.';
comment on column codex.documents.uploaded_at is 'When the current file was uploaded.';
comment on column codex.documents.uploaded_by is 'Person who uploaded the current file.';
create trigger trg_documents_audit after insert or update or delete on codex.documents for each row execute function audit.log_change('id');

alter table codex.documents enable row level security;
grant select, insert, update, delete on codex.documents to authenticated;
create policy read_signed_in on codex.documents for select to authenticated using ((select app.can_read()));
create policy write_editor_insert on codex.documents for insert to authenticated with check ((select app.can_edit()));
create policy write_editor_update on codex.documents for update to authenticated using ((select app.can_edit())) with check ((select app.can_edit()));
create policy write_editor_delete on codex.documents for delete to authenticated using ((select app.can_edit()));
grant select, insert, update, delete on codex.documents to service_role;

-- ───────── functions the page calls (they check the role and resolve the SOP / practice) ─────────
create or replace function codex.set_document(p_kind text, p_ref text, p_file_name text, p_size_bytes bigint)
returns codex.documents
language plpgsql security invoker set search_path = '' as $$
declare
  v_sop uuid; v_practice uuid; v_path text; v_row codex.documents;
begin
  if not app.can_edit() then raise exception 'permission denied: uploading needs the editor or admin role' using errcode = '42501'; end if;
  if p_kind = 'sop' then
    select id into v_sop from codex.sops where sop_number::text = p_ref;
    if v_sop is null then raise exception 'unknown SOP: %', p_ref using errcode = '22023'; end if;
    v_path := 'sops/' || p_ref || '.pdf';
    insert into codex.documents (sop_id, file_name, size_bytes, storage_path) values (v_sop, p_file_name, p_size_bytes, v_path)
    on conflict (sop_id) do update set file_name = excluded.file_name, size_bytes = excluded.size_bytes, storage_path = excluded.storage_path, uploaded_at = now(), uploaded_by = auth.uid()
    returning * into v_row;
  elsif p_kind = 'practice' then
    select id into v_practice from codex.practices where code = p_ref;
    if v_practice is null then raise exception 'unknown practice: %', p_ref using errcode = '22023'; end if;
    v_path := 'practices/' || p_ref || '.pdf';
    insert into codex.documents (practice_id, file_name, size_bytes, storage_path) values (v_practice, p_file_name, p_size_bytes, v_path)
    on conflict (practice_id) do update set file_name = excluded.file_name, size_bytes = excluded.size_bytes, storage_path = excluded.storage_path, uploaded_at = now(), uploaded_by = auth.uid()
    returning * into v_row;
  else
    raise exception 'kind must be sop or practice' using errcode = '22023';
  end if;
  return v_row;
end $$;

create or replace function codex.remove_document(p_kind text, p_ref text)
returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not app.can_edit() then raise exception 'permission denied: removing needs the editor or admin role' using errcode = '42501'; end if;
  if p_kind = 'sop' then
    delete from codex.documents d using codex.sops s where d.sop_id = s.id and s.sop_number::text = p_ref;
  elsif p_kind = 'practice' then
    delete from codex.documents d using codex.practices p where d.practice_id = p.id and p.code = p_ref;
  else
    raise exception 'kind must be sop or practice' using errcode = '22023';
  end if;
end $$;

revoke all on function codex.set_document(text, text, text, bigint), codex.remove_document(text, text) from public, anon;
grant execute on function codex.set_document(text, text, text, bigint), codex.remove_document(text, text) to authenticated;

-- ───────── the private file bucket ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 20971520, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy documents_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (select app.can_read()));
create policy documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (select app.can_edit()) and name ~ '^(sops/[0-9]+|practices/P[0-9]+)\.pdf$');
create policy documents_update on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (select app.can_edit())) with check (bucket_id = 'documents' and (select app.can_edit()) and name ~ '^(sops/[0-9]+|practices/P[0-9]+)\.pdf$');
create policy documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (select app.can_edit()));
