-- ─────────────────────────────────────────────────────────────
-- 레거시 "코스 전용" 장소 정규화
--
-- add-via-course-flag.sql 시절에는 코스 미니폼이 만든 장소를
--   status='wishlist' AND via_course=true
-- 로 저장했고, add-course-only-places.sql 이후에는
--   status='course_only' AND via_course=true AND owning_course_id=<코스>
-- 로 저장한다. 두 표현이 섞여 있어 화면마다 "가고 싶은 곳" 숫자가 달랐다
-- (사이드바·위시리스트 4 vs 기록 화면 7).
--
-- 앱 코드는 src/lib/placeScope.ts 로 두 형태를 모두 "코스 전용"으로 취급하지만,
-- 데이터도 한 형태로 맞춰 두면 이후 쿼리가 단순해진다.
--
-- ⚠️ status 만 바꾸고 owning_course_id 를 비워 두면 안 된다. CourseForm 은
--    `status != course_only OR owning_course_id = 이 코스` 로만 조회해서, 소유 코스가
--    없는 course_only 장소는 코스 수정 화면에서 조용히 빠진 채 저장될 수 있다.
--    그래서 코스 하나에만 들어 있는 행만 골라 소유 코스까지 함께 채운다.
--    (2026-09-11 운영: 55 경복궁→코스4, 57 미래빌딩→코스5, 59 아르켓→코스8 적용 완료)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. (여러 번 실행해도 안전)
-- ─────────────────────────────────────────────────────────────

-- 0) 확인: 대상 행과 소속 코스
-- select p.id, p.name, p.status, p.via_course, p.owning_course_id,
--        array_agg(cp.course_id) filter (where cp.course_id is not null) as course_ids
--   from public.places p
--   left join public.course_places cp on cp.place_id = p.id
--  where p.via_course = true
--  group by p.id order by p.id;

-- 1) 코스 하나에만 들어 있는 레거시 행 → course_only + 소유 코스
with single_course as (
  select cp.place_id, min(cp.course_id) as course_id
    from public.course_places cp
   group by cp.place_id
  having count(distinct cp.course_id) = 1
)
update public.places p
   set status = 'course_only',
       owning_course_id = coalesce(p.owning_course_id, s.course_id)
  from single_course s
 where s.place_id = p.id
   and p.via_course = true
   and (p.status = 'wishlist' or p.owning_course_id is null);

-- 2) 어떤 코스에도 없는 via_course 행은 남겨 둔다 — 자동으로 지우지 않고 아래 조회로
--    사람이 판단한다(진짜 위시로 승격: via_course=false / 고아면 삭제).
-- select id, name, status, via_course, owning_course_id
--   from public.places p
--  where via_course = true
--    and not exists (select 1 from public.course_places cp where cp.place_id = p.id);
