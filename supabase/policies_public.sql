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
