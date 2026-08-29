-- ─────────────────────────────────────────────────────────────
-- "누가 추가/작성했는지" — 로그인 없이 브라우저(localStorage)에 저장한 이름을 함께 기록.
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run. (여러 번 실행해도 안전)
--
-- places.added_by  : 그 장소를 등록한 사람 이름 (text, nullable) — '진식' / '지민'
-- memories.author  : 그 추억을 작성한 사람 이름 (text, nullable)
-- ─────────────────────────────────────────────────────────────

alter table public.places   add column if not exists added_by text;
alter table public.memories add column if not exists author   text;

-- 지금까지 등록된 건 사실상 전부 진식이 넣은 것 → '진식' 으로 채움 (틀린 건 나중에 수정)
update public.places   set added_by = '진식' where added_by is null;
update public.memories set author   = '진식' where author   is null;

-- 확인용:
-- select added_by, count(*) from public.places   group by added_by;
-- select author,   count(*) from public.memories group by author;
