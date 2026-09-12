-- 읽기 전용. 2026-09-12 관측된 "다른 커플의 위시 장소가 보이고 수정까지 허용됨" 현상의
-- 원인을 (A) 세션/계정 전환 vs (B) 운영 RLS 정책 드리프트 로 가르기 위한 진단.
-- 장소명·주소·좌표·초대코드·이메일·사진 URL 등 식별 가능한 원문은 조회하지 않는다.
-- 실행: Supabase SQL Editor. 결과를 그대로 공유.
--
-- 판정 방법
--   2_OPEN_POLICIES 에 한 줄이라도 있으면 → (B) 정책 드리프트. 즉시 차단 조치.
--   비어 있고 3_PLACE_OWNER 의 couple_id 가 관측 커플과 같으면 → (A) 세션/계정 전환 쪽.
--   4_MEMBERSHIP 은 "그때 그 브라우저가 어느 커플이었나"를 프로필 소속으로 되짚는 용도.
with
q1 as (
  -- 커플 스코프가 걸려야 하는 테이블의 RLS 활성 여부
  select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p')
    and c.relname in ('places','memories','memory_replies','courses','course_places',
                      'profiles','couples','categories','reactions','notifications',
                      'ai_recommend_dismissals','place_preferences')
),
q2 as (
  -- ⚠️ 핵심: 커플 스코프 테이블에 남아 있는 "무조건 통과" 정책.
  --    PERMISSIVE 정책은 OR 로 합쳐지므로 여기 한 줄이라도 있으면 격리가 무효다.
  select tablename, policyname, permissive, roles::text as roles, cmd, qual, with_check
  from pg_policies
  where schemaname = 'public'
    and tablename in ('places','memories','memory_replies','courses','course_places',
                      'profiles','couples','categories','reactions','notifications',
                      'ai_recommend_dismissals','place_preferences')
    and (coalesce(qual,'') in ('true') or coalesce(with_check,'') in ('true'))
),
q3 as (
  -- 전체 정책 목록(드리프트 확인용). 정의식에 개인정보 없음.
  select tablename, policyname, permissive, roles::text as roles, cmd, qual, with_check
  from pg_policies
  where schemaname = 'public'
    and tablename in ('places','memories','memory_replies','courses','course_places',
                      'profiles','couples','categories','reactions','notifications',
                      'ai_recommend_dismissals','place_preferences')
),
q4 as (
  -- anon 에게 남아 있는 테이블 권한(RLS 가 꺼지면 즉시 노출되는 표면)
  select table_name, grantee, privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon','PUBLIC')
    and table_name in ('places','memories','memory_replies','courses','course_places',
                       'profiles','couples','categories')
),
q5 as (
  -- 커플별 규모만. 이름·초대코드·장소명 없음.
  select p.couple_id,
         (select count(*) from public.profiles x where x.couple_id = p.couple_id) as members,
         count(*) filter (where p.status = 'visited')  as visited,
         count(*) filter (where p.status = 'wishlist') as wishlist
  from public.places p
  group by p.couple_id
),
q6 as (
  -- 문제의 장소 id 소유 커플. :place_id 를 실제 값으로 바꿔 실행.
  select id, couple_id, status, via_course, (image_url is not null) as has_user_photo,
         (google_place_id is not null) as has_google_place_id, created_at
  from public.places where id = 136
),
q7 as (
  -- 3명 이상 묶인 커플 / 소속 없는 프로필 — 과거 유출 사고의 잔재 점검
  select
    (select count(*) from (select couple_id from public.profiles
        where couple_id is not null group by couple_id having count(*) > 2) s) as couples_over_two,
    (select count(*) from public.profiles where couple_id is null) as unlinked_profiles,
    (select count(*) from public.couples) as couples_total
)
select '1_RLS'            as section, to_jsonb(q1) as detail from q1
union all select '2_OPEN_POLICIES', to_jsonb(q2) from q2
union all select '3_ALL_POLICIES',  to_jsonb(q3) from q3
union all select '4_ANON_GRANTS',   to_jsonb(q4) from q4
union all select '5_COUPLE_SIZES',  to_jsonb(q5) from q5
union all select '6_PLACE_OWNER',   to_jsonb(q6) from q6
union all select '7_MEMBERSHIP',    to_jsonb(q7) from q7;
