-- ─────────────────────────────────────────────────────────────
-- 장소 유일성을 커플 단위로 바꾼다.
--
-- 기존: places 에 unique (name, address)  ← 전역
--   → 다른 커플이 이미 누가 등록한 장소(같은 이름+주소)를 추가하면
--     "duplicate key value violates unique constraint" 로 막혔다.
--
-- 변경: unique (couple_id, name, address)  ← 커플 안에서만 중복 방지
--   → 커플끼리는 완전히 독립. 같은 장소를 각자 따로 가질 수 있다.
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. (여러 번 실행해도 안전)
-- 전제: add-couples-model.sql 로 places.couple_id 가 이미 있어야 함.
-- ─────────────────────────────────────────────────────────────

alter table public.places drop constraint if exists places_name_address_key;
alter table public.places drop constraint if exists places_couple_name_address_key;

alter table public.places
  add constraint places_couple_name_address_key unique (couple_id, name, address);

-- 확인용:
-- select conname, pg_get_constraintdef(oid)
--   from pg_constraint where conrelid = 'public.places'::regclass and contype = 'u';
