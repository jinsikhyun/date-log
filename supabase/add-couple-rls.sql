-- ═════════════════════════════════════════════════════════════
-- 멀티 커플 4단계: RLS (커플 스코프 데이터 격리)
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run. (여러 번 실행해도 안전)
--
-- 요약:
--  · my_couple_id() : 내 profiles.couple_id 를 돌려주는 security-definer 함수
--    (정책 안에서 profiles 를 다시 읽어도 재귀가 안 나도록 RLS 우회)
--  · places/memories/memory_replies/courses : couple_id = my_couple_id() 인 행만
--  · course_places : course_id 가 내 커플 courses 에 속하는지로 판단
--  · profiles : 내 행 + 같은 커플(파트너) 행 읽기 / 내 행만 쓰기
--  · couples  : 로그인 사용자면 select/insert 가능 (합류·생성 플로우용, 민감정보 아님)
--  · set_couple_id 트리거 : insert 시 couple_id 를 자동으로 채움 (앱은 5단계에서 반영)
--  · categories 는 손대지 않음 (커플 무관 공용)
-- ═════════════════════════════════════════════════════════════

-- 0) 헬퍼 함수 ────────────────────────────────────────────────
create or replace function public.my_couple_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$ select couple_id from public.profiles where id = auth.uid() $$;

create or replace function public.set_couple_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.couple_id is null then
    new.couple_id := public.my_couple_id();
  end if;
  return new;
end $$;

-- 1) 기존 데이터/커플 통합 ───────────────────────────────────
--    시드 커플(JINJIM-0628)에 기존 데이터 24/9/3/3 행이 이미 붙어 있음.
--    3단계 테스트로 생긴 별도 커플의 프로필들을 이 시드 커플로 합치고,
--    이제 아무것도 안 가리키는 빈 커플은 삭제한다.
do $$
declare seed uuid;
begin
  select id into seed from public.couples where invite_code = 'JINJIM-0628';
  if seed is null then
    raise exception 'invite_code = JINJIM-0628 커플이 없습니다. add-couples-model.sql 를 먼저 실행하세요.';
  end if;

  update public.profiles
    set couple_id = seed
    where couple_id is distinct from seed;

  delete from public.couples c
  where c.id <> seed
    and not exists (select 1 from public.profiles       x where x.couple_id = c.id)
    and not exists (select 1 from public.places         x where x.couple_id = c.id)
    and not exists (select 1 from public.memories       x where x.couple_id = c.id)
    and not exists (select 1 from public.memory_replies x where x.couple_id = c.id)
    and not exists (select 1 from public.courses        x where x.couple_id = c.id);
end $$;

-- 2) places ─────────────────────────────────────────────────
alter table public.places enable row level security;
drop policy if exists "places: public read"           on public.places;
drop policy if exists "places: public insert"         on public.places;
drop policy if exists "places: public update"         on public.places;
drop policy if exists "places: public delete"         on public.places;
drop policy if exists "places: prototype full access" on public.places;
drop policy if exists "places: couple select" on public.places;
drop policy if exists "places: couple insert" on public.places;
drop policy if exists "places: couple update" on public.places;
drop policy if exists "places: couple delete" on public.places;
create policy "places: couple select" on public.places for select to authenticated
  using (couple_id = public.my_couple_id());
create policy "places: couple insert" on public.places for insert to authenticated
  with check (couple_id = public.my_couple_id());
create policy "places: couple update" on public.places for update to authenticated
  using (couple_id = public.my_couple_id()) with check (couple_id = public.my_couple_id());
create policy "places: couple delete" on public.places for delete to authenticated
  using (couple_id = public.my_couple_id());
drop trigger if exists trg_places_couple_id on public.places;
create trigger trg_places_couple_id before insert on public.places
  for each row execute function public.set_couple_id();

-- 3) memories ───────────────────────────────────────────────
alter table public.memories enable row level security;
drop policy if exists "memories: public read"           on public.memories;
drop policy if exists "memories: public insert"         on public.memories;
drop policy if exists "memories: public update"         on public.memories;
drop policy if exists "memories: public delete"         on public.memories;
drop policy if exists "memories: prototype full access" on public.memories;
drop policy if exists "memories: couple select" on public.memories;
drop policy if exists "memories: couple insert" on public.memories;
drop policy if exists "memories: couple update" on public.memories;
drop policy if exists "memories: couple delete" on public.memories;
create policy "memories: couple select" on public.memories for select to authenticated
  using (couple_id = public.my_couple_id());
create policy "memories: couple insert" on public.memories for insert to authenticated
  with check (couple_id = public.my_couple_id());
create policy "memories: couple update" on public.memories for update to authenticated
  using (couple_id = public.my_couple_id()) with check (couple_id = public.my_couple_id());
create policy "memories: couple delete" on public.memories for delete to authenticated
  using (couple_id = public.my_couple_id());
drop trigger if exists trg_memories_couple_id on public.memories;
create trigger trg_memories_couple_id before insert on public.memories
  for each row execute function public.set_couple_id();

-- 4) memory_replies ─────────────────────────────────────────
alter table public.memory_replies enable row level security;
drop policy if exists "memory_replies: public read"   on public.memory_replies;
drop policy if exists "memory_replies: public insert" on public.memory_replies;
drop policy if exists "memory_replies: public update" on public.memory_replies;
drop policy if exists "memory_replies: public delete" on public.memory_replies;
drop policy if exists "memory_replies: couple select" on public.memory_replies;
drop policy if exists "memory_replies: couple insert" on public.memory_replies;
drop policy if exists "memory_replies: couple update" on public.memory_replies;
drop policy if exists "memory_replies: couple delete" on public.memory_replies;
create policy "memory_replies: couple select" on public.memory_replies for select to authenticated
  using (couple_id = public.my_couple_id());
create policy "memory_replies: couple insert" on public.memory_replies for insert to authenticated
  with check (couple_id = public.my_couple_id());
create policy "memory_replies: couple update" on public.memory_replies for update to authenticated
  using (couple_id = public.my_couple_id()) with check (couple_id = public.my_couple_id());
create policy "memory_replies: couple delete" on public.memory_replies for delete to authenticated
  using (couple_id = public.my_couple_id());
drop trigger if exists trg_memory_replies_couple_id on public.memory_replies;
create trigger trg_memory_replies_couple_id before insert on public.memory_replies
  for each row execute function public.set_couple_id();

-- 5) courses ────────────────────────────────────────────────
alter table public.courses enable row level security;
drop policy if exists "courses: public read"   on public.courses;
drop policy if exists "courses: public insert" on public.courses;
drop policy if exists "courses: public update" on public.courses;
drop policy if exists "courses: public delete" on public.courses;
drop policy if exists "courses: couple select" on public.courses;
drop policy if exists "courses: couple insert" on public.courses;
drop policy if exists "courses: couple update" on public.courses;
drop policy if exists "courses: couple delete" on public.courses;
create policy "courses: couple select" on public.courses for select to authenticated
  using (couple_id = public.my_couple_id());
create policy "courses: couple insert" on public.courses for insert to authenticated
  with check (couple_id = public.my_couple_id());
create policy "courses: couple update" on public.courses for update to authenticated
  using (couple_id = public.my_couple_id()) with check (couple_id = public.my_couple_id());
create policy "courses: couple delete" on public.courses for delete to authenticated
  using (couple_id = public.my_couple_id());
drop trigger if exists trg_courses_couple_id on public.courses;
create trigger trg_courses_couple_id before insert on public.courses
  for each row execute function public.set_couple_id();

-- 6) course_places (자체 couple_id 없음 → courses 로 조인 판단) ─
alter table public.course_places enable row level security;
drop policy if exists "course_places: public read"   on public.course_places;
drop policy if exists "course_places: public insert" on public.course_places;
drop policy if exists "course_places: public update" on public.course_places;
drop policy if exists "course_places: public delete" on public.course_places;
drop policy if exists "course_places: couple all" on public.course_places;
create policy "course_places: couple all" on public.course_places for all to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = course_places.course_id
        and c.couple_id = public.my_couple_id()
    )
  )
  with check (
    exists (
      select 1 from public.courses c
      where c.id = course_places.course_id
        and c.couple_id = public.my_couple_id()
    )
  );

-- 7) profiles (내 행 + 파트너 읽기 / 내 행만 쓰기) ────────────
alter table public.profiles enable row level security;
drop policy if exists "profiles: read self or partner" on public.profiles;
drop policy if exists "profiles: insert self" on public.profiles;
drop policy if exists "profiles: update self" on public.profiles;
create policy "profiles: read self or partner" on public.profiles for select to authenticated
  using (id = auth.uid() or couple_id = public.my_couple_id());
create policy "profiles: insert self" on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy "profiles: update self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- 8) couples (로그인 사용자면 select/insert 가능) ────────────
alter table public.couples enable row level security;
drop policy if exists "couples: insert authed" on public.couples;
drop policy if exists "couples: select authed" on public.couples;
create policy "couples: insert authed" on public.couples for insert to authenticated
  with check (true);
create policy "couples: select authed" on public.couples for select to authenticated
  using (true);
-- update/delete 정책 없음 → 커플 수정·삭제 불가 (의도)

-- ═════════════════════════════════════════════════════════════
-- 확인용:
-- select tablename, policyname, cmd
--   from pg_policies where schemaname='public'
--   and tablename in ('places','memories','memory_replies','courses','course_places','profiles','couples')
--   order by tablename, cmd;
-- select invite_code, (select count(*) from public.profiles p where p.couple_id = c.id) members
--   from public.couples c;                          -- JINJIM-0628 한 줄, members 2
-- select couple_id, count(*) from public.places group by couple_id;  -- 한 줄 (전부 같은 커플)
-- ═════════════════════════════════════════════════════════════
