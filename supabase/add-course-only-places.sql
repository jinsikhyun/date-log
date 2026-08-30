-- ═════════════════════════════════════════════════════════════
-- 코스 전용 장소: status 에 'course_only' 추가 + owning_course_id (코스 삭제 시 함께 삭제)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. (여러 번 실행해도 안전)
--
-- ⚠️ 요청에는 owning_course_id 를 uuid 로 적혀 있었지만, courses.id 는 bigint 라서
--    FK 를 걸려면 같은 타입이어야 함 → bigint 로 만든다.
-- ═════════════════════════════════════════════════════════════

-- 1) status 허용값에 'course_only' 추가
alter table public.places drop constraint if exists places_status_check;
alter table public.places
  add constraint places_status_check
  check (status in ('visited', 'wishlist', 'course_only'));

-- 2) owning_course_id: 이 값이 설정된 place 는 그 코스가 삭제될 때 함께 삭제된다
alter table public.places
  add column if not exists owning_course_id bigint
  references public.courses(id) on delete cascade;

create index if not exists places_owning_course_idx
  on public.places (owning_course_id);

-- 확인용:
-- select id, name, status, owning_course_id from public.places
--   where status = 'course_only' or owning_course_id is not null;
