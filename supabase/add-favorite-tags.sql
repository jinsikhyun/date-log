-- ─────────────────────────────────────────────────────────────
-- 즐겨찾기 태그: 장소에 "{이름} pick"(0~2명) + "우리 단골" 표시.
-- wanted_by(위시리스트 전용)와는 완전 별개.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. (여러 번 실행해도 안전)
-- ─────────────────────────────────────────────────────────────

-- 이 장소를 "즐겨찾기"한 사람들의 profiles.id (0~2개)
alter table public.places
  add column if not exists favorite_by uuid[] not null default '{}';

-- 우리 단골인지
alter table public.places
  add column if not exists is_regular boolean not null default false;

-- 확인용:
-- select id, name, favorite_by, is_regular from public.places
--   where cardinality(favorite_by) > 0 or is_regular;
