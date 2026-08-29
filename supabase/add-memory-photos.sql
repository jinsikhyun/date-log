-- ─────────────────────────────────────────────────────────────
-- 추억(memories)에 여러 장의 사진 첨부. 장소 대표 사진(places.image_url)과는 별개.
-- 파일은 기존 place-photos Storage 버킷을 그대로 쓴다 (새 버킷 없음).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. (여러 번 실행해도 안전)
--
-- photo_urls : text[] — 첨부 사진들의 public URL 목록. 기본값 빈 배열.
-- ─────────────────────────────────────────────────────────────

alter table public.memories
  add column if not exists photo_urls text[] not null default '{}';

-- 확인용:
-- select id, array_length(photo_urls, 1) as n from public.memories order by id;
