-- Apply after 20260905000000_secure_place_photos.sql, then deploy the photo UI.
-- No managed storage table ALTER/ownership changes. Existing object bytes are untouched.
begin;
do $$ begin
  if not exists (select 1 from pg_class where oid='storage.objects'::regclass and relrowsecurity)
    or not exists (select 1 from storage.buckets where id='place-photos' and public=false) then
    raise exception 'Apply the private place-photos migration first.';
  end if;
end $$;

-- Immutable snapshot for existing flat UUID filenames. NULL couple_id quarantines
-- ambiguous/unassigned files. Never infer access from later user-editable URLs.
create table if not exists public.place_photo_legacy_access (
  object_name text primary key,
  couple_id uuid references public.couples(id) on delete set null
);
alter table public.place_photo_legacy_access enable row level security;
revoke all on public.place_photo_legacy_access from public, anon, authenticated;

with refs as (
  select couple_id, image_url as ref from public.places where image_url is not null
  union all
  select m.couple_id, u.ref from public.memories m
    cross join lateral unnest(m.photo_urls) as u(ref)
), matches as (
  select o.name, p.couple_id as owner_couple,
    count(distinct r.couple_id) as couple_count,
    min(r.couple_id::text)::uuid as reference_couple
  from storage.objects o
  left join public.profiles p on p.id::text = coalesce(o.owner_id, o.owner::text)
  left join refs r on r.ref = 'storage://place-photos/' || o.name
    or r.ref = 'https://wogjafcgllidtbsmnltc.supabase.co/storage/v1/object/public/place-photos/' || o.name
  where o.bucket_id='place-photos' and o.name not like '%/%'
  group by o.name, p.couple_id
)
insert into public.place_photo_legacy_access(object_name, couple_id)
select name, case
  when couple_count > 1 then null
  when couple_count = 1 and owner_couple is not null and owner_couple <> reference_couple then null
  when couple_count = 1 then reference_couple
  else owner_couple
end from matches
on conflict(object_name) do nothing;

create or replace function public.can_access_place_photo(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles me
    where me.id = auth.uid() and me.couple_id is not null and (
      -- Newly uploaded files: couple/user/random UUID.jpg. Never cast untrusted paths.
      (split_part(p_name, '/', 1) = me.couple_id::text
        and p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$')
      or exists (select 1 from public.place_photo_legacy_access a
        where a.object_name=p_name and a.couple_id=me.couple_id)
    )
  );
$$;
revoke all on function public.can_access_place_photo(text) from public, anon;
grant execute on function public.can_access_place_photo(text) to anon, authenticated;

-- Remove known broad read/legacy policies. Restrictive guard below also blocks
-- any remaining broad permissive policy, including a replay of the earlier migration.
drop policy if exists "place-photos: authenticated read" on storage.objects;
drop policy if exists "인증된 사용자 조회 허용" on storage.objects;
drop policy if exists "인증된 사용자 업로드 허용" on storage.objects;
drop policy if exists "본인 사진만 수정 및 삭제 허용" on storage.objects;
drop policy if exists "place-photos: couple read" on storage.objects;
drop policy if exists "place-photos: couple isolation" on storage.objects;
drop policy if exists "place-photos: upload path guard" on storage.objects;

create policy "place-photos: couple read" on storage.objects for select to authenticated
  using (bucket_id='place-photos' and public.can_access_place_photo(name));

-- The predicate returns false without auth.uid(); anon needs EXECUTE because
-- PostgreSQL checks function privileges even in a CASE branch. Other buckets are unaffected.
create policy "place-photos: couple isolation" on storage.objects as restrictive for all to public
  using (case when bucket_id <> 'place-photos' then true
    when auth.role()='authenticated' then public.can_access_place_photo(name) else false end)
  with check (case when bucket_id <> 'place-photos' then true
    when auth.role()='authenticated' then public.can_access_place_photo(name) else false end);

create policy "place-photos: upload path guard" on storage.objects as restrictive for insert to public
  with check (bucket_id <> 'place-photos' or (
    auth.role()='authenticated' and owner_id=auth.uid()::text
    and split_part(name, '/', 2)=auth.uid()::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  ));
commit;

-- Aggregate only; no private photo names/URLs in the result.
select count(*) as legacy_total,
  count(*) filter (where couple_id is not null) as legacy_assigned,
  count(*) filter (where couple_id is null) as legacy_quarantined
from public.place_photo_legacy_access;
