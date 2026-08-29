-- ─────────────────────────────────────────────────────────────
-- 공개 배포용 정책으로 교체 (이미 schema.sql 을 실행한 DB에서 이것만 추가 실행).
-- 방문자(anon): 읽기(SELECT) + 추가(INSERT) 만. 수정(UPDATE)/삭제(DELETE) 는 정책 없음 = 거부.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.
--
-- ⚠️ 다음 단계: Supabase Auth 도입 후 UPDATE/DELETE 를 소유자에게만 허용.
-- ─────────────────────────────────────────────────────────────

-- places
drop policy if exists "places: prototype full access" on public.places;
drop policy if exists "places: public read"   on public.places;
drop policy if exists "places: public insert" on public.places;

create policy "places: public read"
  on public.places for select
  to anon, authenticated
  using (true);

create policy "places: public insert"
  on public.places for insert
  to anon, authenticated
  with check (true);

-- memories (UI 없음, 동일 정책)
drop policy if exists "memories: prototype full access" on public.memories;
drop policy if exists "memories: public read"   on public.memories;
drop policy if exists "memories: public insert" on public.memories;

create policy "memories: public read"
  on public.memories for select
  to anon, authenticated
  using (true);

create policy "memories: public insert"
  on public.memories for insert
  to anon, authenticated
  with check (true);

-- 확인용: places 에 걸린 정책 목록
-- select policyname, cmd from pg_policies where tablename = 'places';
