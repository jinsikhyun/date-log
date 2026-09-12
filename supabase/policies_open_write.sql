-- ⛔ 레거시 스크립트 실행 방지 장치 (security/README.md 의 "레거시 스크립트 실행 방지 장치" 항목)
-- security/02_enforce_membership.sql 로 커플 격리를 하드닝한 DB 에서 이 파일을 다시 실행하면
-- 예전 공개 정책(using(true))이 PERMISSIVE 로 다시 추가된다. PostgreSQL 은 PERMISSIVE 정책을
-- OR 로 합치므로, 이름이 다른 공개 정책이 하나만 살아 있어도 커플 격리가 통째로 무효가 된다
-- (2026-09-09 categories 사고와 같은 구조).
-- 하드닝 여부는 connect_couple RPC 존재로 판정한다(security/01_prepare_membership.sql 이 만든다).
-- 새로 설치하는 DB 에는 RPC 가 없으므로 이 가드는 걸리지 않는다.
do $$ begin
  if to_regprocedure('public.connect_couple(text,text)') is not null then
    raise exception '레거시 스크립트 실행 차단: 이 DB 는 security/01·02 로 하드닝되어 있습니다. 이 파일을 재실행하면 커플 격리 정책이 되돌아갑니다. (legacy script blocked)';
  end if;
end $$;

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
