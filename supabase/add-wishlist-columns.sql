-- ─────────────────────────────────────────────────────────────
-- "가고 싶은 곳(위시리스트)" — places 테이블에 상태 컬럼 2개 추가.
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run. (여러 번 실행해도 안전)
--
-- status    : 'visited'(다녀온 곳, 기본값) | 'wishlist'(가고 싶은 곳)
-- wanted_by : 위시리스트 항목에서만 사용. '나' | '여자친구' | '둘다' | NULL
-- ─────────────────────────────────────────────────────────────

alter table public.places
  add column if not exists status text not null default 'visited';
alter table public.places
  add column if not exists wanted_by text;

-- 허용값 제약 (재실행 대비 drop 후 add)
alter table public.places drop constraint if exists places_status_check;
alter table public.places
  add constraint places_status_check check (status in ('visited', 'wishlist'));

alter table public.places drop constraint if exists places_wanted_by_check;
alter table public.places
  add constraint places_wanted_by_check
  check (wanted_by is null or wanted_by in ('나', '여자친구', '둘다'));

-- 기존 행은 전부 '다녀온 곳' 으로 명시
update public.places set status = 'visited' where status is null or status = '';

-- 확인용:
-- select status, count(*) from public.places group by status;
-- select column_name, data_type, column_default from information_schema.columns
--   where table_schema='public' and table_name='places'
--   and column_name in ('status','wanted_by');
