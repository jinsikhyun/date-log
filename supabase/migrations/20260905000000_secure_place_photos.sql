-- P0-2: anonymous upload, replacement, deletion allowed — resolved in code.
-- Apply with a migration/admin role. Live application requires separate approval.
-- Private buckets require authenticated downloads or signed URLs; getPublicUrl no longer works.
-- owner_id is Supabase's current ownership column (owner is deprecated).
-- Existing ownerless objects remain readable by authenticated users, but cannot be modified.
begin;

insert into storage.buckets (id, name, public)
values ('place-photos', 'place-photos', false)
on conflict (id) do update set public = false;

-- Supabase manages this table; ALTER TABLE requires its owner and can fail
-- in SQL Editor. Require existing RLS instead of changing managed ownership.
do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects' and c.relrowsecurity
  ) then
    raise exception 'storage.objects RLS is disabled or missing. Stop and ask the Supabase administrator to restore Storage RLS.';
  end if;
end $$;

drop policy if exists "place-photos: public read" on storage.objects;
drop policy if exists "place-photos: public insert" on storage.objects;
drop policy if exists "place-photos: public update" on storage.objects;
drop policy if exists "place-photos: public delete" on storage.objects;
drop policy if exists "place-photos: authenticated read" on storage.objects;
drop policy if exists "place-photos: own insert" on storage.objects;
drop policy if exists "place-photos: own update" on storage.objects;
drop policy if exists "place-photos: own delete" on storage.objects;
drop policy if exists "place-photos: authentication guard" on storage.objects;
drop policy if exists "place-photos: update ownership guard" on storage.objects;
drop policy if exists "place-photos: delete ownership guard" on storage.objects;

create policy "place-photos: authenticated read"
  on storage.objects for select to authenticated
  using (bucket_id = 'place-photos');

create policy "place-photos: own insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'place-photos' and auth.uid()::text = owner_id);

create policy "place-photos: own update"
  on storage.objects for update to authenticated
  using (bucket_id = 'place-photos' and auth.uid()::text = owner_id)
  with check (bucket_id = 'place-photos' and auth.uid()::text = owner_id);

create policy "place-photos: own delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'place-photos' and auth.uid()::text = owner_id);

-- Restrictive policies prevent unrelated broad permissive policies from bypassing
-- these rules. Other buckets retain their existing permissions.
create policy "place-photos: authentication guard"
  on storage.objects as restrictive for all to public
  using (bucket_id <> 'place-photos' or
    (auth.role() = 'authenticated' and auth.uid() is not null))
  with check (bucket_id <> 'place-photos' or
    (auth.role() = 'authenticated' and auth.uid()::text = owner_id));

create policy "place-photos: update ownership guard"
  on storage.objects as restrictive for update to public
  using (bucket_id <> 'place-photos' or auth.uid()::text = owner_id)
  with check (bucket_id <> 'place-photos' or auth.uid()::text = owner_id);

create policy "place-photos: delete ownership guard"
  on storage.objects as restrictive for delete to public
  using (bucket_id <> 'place-photos' or auth.uid()::text = owner_id);

commit;
