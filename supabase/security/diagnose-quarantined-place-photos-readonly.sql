-- Read-only. Reports only aggregate reason counts; no filenames, URLs, or user data.
with refs as (
  select couple_id, image_url as ref from public.places where image_url is not null
  union all
  select m.couple_id, u.ref from public.memories m
  cross join lateral unnest(m.photo_urls) as u(ref)
), facts as (
  select a.object_name,
    p.couple_id as owner_couple,
    count(distinct r.couple_id) as reference_couples,
    min(r.couple_id::text)::uuid as reference_couple
  from public.place_photo_legacy_access a
  join storage.objects o on o.bucket_id='place-photos' and o.name=a.object_name
  left join public.profiles p on p.id::text=coalesce(o.owner_id,o.owner::text)
  left join refs r on r.ref='storage://place-photos/'||o.name
    or r.ref='https://wogjafcgllidtbsmnltc.supabase.co/storage/v1/object/public/place-photos/'||o.name
  where a.couple_id is null
  group by a.object_name,p.couple_id
), classified as (
  select case
    when reference_couples > 1 then 'referenced_by_multiple_couples'
    when reference_couples = 1 and owner_couple is not null
      and owner_couple <> reference_couple then 'owner_reference_mismatch'
    when reference_couples = 0 and owner_couple is null then 'unreferenced_ownerless'
    when reference_couples = 0 then 'unreferenced_owner_present'
    else 'other'
  end as reason
  from facts
)
select reason, count(*) as files from classified group by reason order by reason;
