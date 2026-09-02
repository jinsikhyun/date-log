-- 읽기 전용. 운영 SQL Editor에서 실행 후 결과 공유.
-- 개인정보/초대코드/사진 URL은 조회하지 않음. 함수 본문에 과거 하드코딩 값이 있으면 가리고 공유.
with columns as (
  select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema='public' and table_name in ('profiles','couples')
), triggers as (
  select n.nspname as schema_name, c.relname as table_name, t.tgname,
    pg_get_triggerdef(t.oid) as definition, pg_get_functiondef(p.oid) as function_definition
  from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid
  where not t.tgisinternal and n.nspname='public' and c.relname in ('profiles','couples')
), functions as (
  select p.oid::regprocedure::text as name, p.prosecdef as security_definer,
    p.proacl::text as grants, pg_get_functiondef(p.oid) as definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
    and (p.prosecdef or case when p.prokind='f' then pg_get_functiondef(p.oid) end ~* '(profiles|couples)')
), counts as (
  select
    (select count(*) from (select couple_id from public.profiles where couple_id is not null
       group by couple_id having count(*) > 2) s) as couples_over_two_members,
    (select count(*) from public.profiles where couple_id is null) as unlinked_profiles,
    (select count(*) from storage.objects where bucket_id='place-photos') as photo_objects,
    (select count(*) from storage.objects where bucket_id='place-photos' and name not like '%/%') as root_photo_objects
), schema_access as (
  select r as role, has_schema_privilege(r, 'public', 'CREATE') as can_create_public_objects
  from unnest(array['anon','authenticated']) r
)
select '1_COLUMNS' as section, to_jsonb(columns) as detail from columns
union all select '2_TRIGGERS', to_jsonb(triggers) from triggers
union all select '3_FUNCTIONS', to_jsonb(functions) from functions
union all select '4_COUNTS', to_jsonb(counts) from counts
union all select '5_SCHEMA_ACCESS', to_jsonb(schema_access) from schema_access;
