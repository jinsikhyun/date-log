-- ─────────────────────────────────────────────────────────────
-- 장소 취향 태그 — places 테이블에 tags 컬럼 추가.
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run. (여러 번 실행해도 안전)
--
-- tags : text[]. AI_RECOMMENDATION_HANDOFF.md §6 확정 태그 체계 + 사용자 직접 추가 태그.
--        방문/위시/코스전용 상태와 무관하게 저장. 선택 사항이라 빈 배열이 기본값.
-- ─────────────────────────────────────────────────────────────

alter table public.places
  add column if not exists tags text[] not null default '{}';

-- 확인용:
-- select id, name, tags from public.places where array_length(tags, 1) > 0;
-- select column_name, data_type, column_default from information_schema.columns
--   where table_schema='public' and table_name='places' and column_name='tags';
