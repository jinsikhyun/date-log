-- ─────────────────────────────────────────────────────────────
-- places 에 위도/경도 컬럼 추가 (카카오 장소검색 자동완성이 채운다).
-- 값이 있으면 지도가 지오코딩 없이 바로 마커를 찍고, 없으면 기존처럼 주소를 지오코딩한다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. (여러 번 실행해도 안전)
-- ─────────────────────────────────────────────────────────────

alter table public.places add column if not exists lat double precision;
alter table public.places add column if not exists lng double precision;

-- 확인용:
-- select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'places'
--   and column_name in ('lat','lng');
