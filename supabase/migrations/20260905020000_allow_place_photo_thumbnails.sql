-- Apply after 20260905010000_isolate_place_photos_by_couple.sql, then deploy the
-- thumbnail upload/serving code. No managed storage table ALTER/ownership changes.
-- Existing object bytes and the legacy mapping table are untouched.
--
-- Widens the strict "couple/user/uuid.jpg" filename rule to also allow a
-- pregenerated-thumbnail sibling of the SAME uuid: "couple/user/uuid-<width>.jpg",
-- where <width> is a fixed whitelist matching src/lib/photoUrls.ts DISPLAY_WIDTHS.
-- No other suffix, extension, or path shape is accepted — keep this regex in sync
-- with DISPLAY_WIDTHS and isNewFormatPhotoPath() in src/lib/photoUrls.ts.
begin;
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'can_access_place_photo') then
    raise exception 'Apply the couple isolation migration (can_access_place_photo) first.';
  end if;
end $$;

create or replace function public.can_access_place_photo(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles me
    where me.id = auth.uid() and me.couple_id is not null and (
      -- Newly uploaded files: couple/user/random UUID.jpg, optionally with a
      -- pregenerated thumbnail suffix from the fixed width whitelist below.
      -- Never cast untrusted paths.
      (split_part(p_name, '/', 1) = me.couple_id::text
        and p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}(-(?:160|320|640|960|1280))?\.jpg$')
      or exists (select 1 from public.place_photo_legacy_access a
        where a.object_name=p_name and a.couple_id=me.couple_id)
    )
  );
$$;
revoke all on function public.can_access_place_photo(text) from public, anon;
grant execute on function public.can_access_place_photo(text) to anon, authenticated;

-- "place-photos: couple isolation" only calls the function above, so it already
-- covers thumbnail siblings once the function is replaced. Only the insert path
-- guard's own regex needs to be widened here.
drop policy if exists "place-photos: upload path guard" on storage.objects;

create policy "place-photos: upload path guard" on storage.objects as restrictive for insert to public
  with check (bucket_id <> 'place-photos' or (
    auth.role()='authenticated' and owner_id=auth.uid()::text
    and split_part(name, '/', 2)=auth.uid()::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}(-(?:160|320|640|960|1280))?\.jpg$'
  ));
commit;
