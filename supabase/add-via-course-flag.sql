-- ─────────────────────────────────────────────────────────────
-- 코스 짜다가 "+ 새 장소 추가" 로 만든 곳: status='wishlist' 로 분류하되
-- /wishlist 페이지(우리가 가고 싶어하는 곳 큐레이션)에는 노출하지 않는다.
-- 구분용 플래그 컬럼 + 버그로 잘못 저장됐던 2건 정정.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. (여러 번 실행해도 안전)
-- ─────────────────────────────────────────────────────────────

alter table public.places
  add column if not exists via_course boolean not null default false;

-- 코스 미니폼 버그로 status='visited' 로 저장됐던 곳 → wishlist + via_course
-- (경복궁 = 코스 #4, 미래빌딩 = 코스 #5. 사진/방문일/한줄평/별점 전부 비어있던 것)
update public.places
set status = 'wishlist', via_course = true
where id in (55, 57);

-- 확인용:
-- select id, name, status, via_course from public.places where id in (55, 57);
