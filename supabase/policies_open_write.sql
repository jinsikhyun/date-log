-- ─────────────────────────────────────────────────────────────
-- 방문자(anon)에게 UPDATE / DELETE 도 허용 (읽기·추가는 이미 열려 있음).
-- 이미 schema.sql / policies_public.sql 을 실행한 DB에서 이것만 추가 실행.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.
--
-- ⚠️ 이제 링크만 알면 누구나 장소/추억을 수정·삭제할 수 있다. 앱의 확인창이 유일한 안전장치.
--    실제 사용자가 생기면 Supabase Auth 도입 후 소유자 기반 정책으로 교체할 것.
-- ─────────────────────────────────────────────────────────────

-- places
drop policy if exists "places: public update" on public.places;
drop policy if exists "places: public delete" on public.places;

create policy "places: public update"
  on public.places for update
  to anon, authenticated
  using (true) with check (true);

create policy "places: public delete"
  on public.places for delete
  to anon, authenticated
  using (true);

-- memories
-- (place 삭제 시 FK ON DELETE CASCADE 로 함께 지워지지만, 개별 수정/삭제도 열어둔다)
drop policy if exists "memories: public update" on public.memories;
drop policy if exists "memories: public delete" on public.memories;

create policy "memories: public update"
  on public.memories for update
  to anon, authenticated
  using (true) with check (true);

create policy "memories: public delete"
  on public.memories for delete
  to anon, authenticated
  using (true);

-- 확인용:
-- select tablename, policyname, cmd from pg_policies
-- where tablename in ('places','memories') order by tablename, cmd;
