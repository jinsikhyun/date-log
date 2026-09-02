-- date.log 인수 점검: 단일 SELECT, 읽기 전용. 결과 전체를 CSV로 내보내 전달.
-- 여러 SELECT 중 마지막 결과만 보이는 문제를 피하도록 한 결과표로 통합.
-- 데이터 본문·개인 이메일·키·토큰은 조회하지 않는다.
-- 정책 정의에 사용자 정의 상수가 있을 수 있으므로 공유 전 확인한다.
-- 결과만으로 전체 보안을 보장하지 않는다.
with
q1 as (
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p') and (
  (n.nspname = 'public' and c.relname in (
    'places', 'memories', 'memory_replies', 'courses', 'course_places',
    'profiles', 'couples', 'categories', 'reactions', 'notifications'
  )) or (n.nspname = 'storage' and c.relname = 'objects')
)
order by schema_name, table_name
),
q2 as (
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in (
  'places', 'memories', 'memory_replies', 'courses', 'course_places',
  'profiles', 'couples', 'categories', 'reactions', 'notifications'
)) or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname
),
q3 as (
select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where grantee in ('anon', 'authenticated', 'PUBLIC')
  and ((table_schema = 'public' and table_name in (
    'places', 'memories', 'memory_replies', 'courses', 'course_places',
    'profiles', 'couples', 'categories', 'reactions', 'notifications'
  )) or (table_schema = 'storage' and table_name = 'objects'))
order by table_schema, table_name, grantee, privilege_type
),
q4 as (
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'place-photos'
),
q5 as (
select table_name, column_name, data_type, udt_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('places', 'memories', 'profiles', 'categories')
  and column_name in ('id', 'couple_id', 'favorite_by', 'is_regular',
    'wanted_by', 'wanted_by_ids', 'author', 'author_id', 'added_by',
    'status', 'photo_urls', 'owning_course_id')
order by table_name, ordinal_position
)
select '1_RLS' as section, to_jsonb(q1) as detail from q1
union all
select '2_POLICIES' as section, to_jsonb(q2) as detail from q2
union all
select '3_GRANTS' as section, to_jsonb(q3) as detail from q3
union all
select '4_BUCKET' as section, to_jsonb(q4) as detail from q4
union all
select '5_COLUMNS' as section, to_jsonb(q5) as detail from q5;
