-- ─────────────────────────────────────────────────────────────
-- 데이트 코스 (courses) + 코스에 담긴 장소 순서 (course_places)
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run. (여러 번 실행해도 안전)
--
-- 정책: 프로토타입이라 anon 에게 SELECT/INSERT/UPDATE/DELETE 전부 허용.
--   (다른 테이블과 동일. 실제 사용자 생기면 Supabase Auth + 소유자 정책으로 교체.)
-- ─────────────────────────────────────────────────────────────

-- ── courses ──────────────────────────────────────────────────
create table if not exists public.courses (
  id         bigint generated always as identity primary key,
  title      text not null,
  concept    text,
  created_at timestamptz not null default now()
);

alter table public.courses enable row level security;

drop policy if exists "courses: public read"   on public.courses;
drop policy if exists "courses: public insert" on public.courses;
drop policy if exists "courses: public update" on public.courses;
drop policy if exists "courses: public delete" on public.courses;
create policy "courses: public read"
  on public.courses for select to anon, authenticated using (true);
create policy "courses: public insert"
  on public.courses for insert to anon, authenticated with check (true);
create policy "courses: public update"
  on public.courses for update to anon, authenticated using (true) with check (true);
create policy "courses: public delete"
  on public.courses for delete to anon, authenticated using (true);

-- ── course_places (코스 안의 장소 + 순서) ────────────────────
create table if not exists public.course_places (
  id          bigint generated always as identity primary key,
  course_id   bigint  not null references public.courses(id) on delete cascade,
  place_id    bigint  not null references public.places(id)  on delete cascade,
  order_index integer not null default 0
);

create index if not exists course_places_course_id_idx on public.course_places (course_id);
create index if not exists course_places_place_id_idx  on public.course_places (place_id);

alter table public.course_places enable row level security;

drop policy if exists "course_places: public read"   on public.course_places;
drop policy if exists "course_places: public insert" on public.course_places;
drop policy if exists "course_places: public update" on public.course_places;
drop policy if exists "course_places: public delete" on public.course_places;
create policy "course_places: public read"
  on public.course_places for select to anon, authenticated using (true);
create policy "course_places: public insert"
  on public.course_places for insert to anon, authenticated with check (true);
create policy "course_places: public update"
  on public.course_places for update to anon, authenticated using (true) with check (true);
create policy "course_places: public delete"
  on public.course_places for delete to anon, authenticated using (true);

-- 확인용:
-- select tablename, policyname, cmd from pg_policies
--   where tablename in ('courses','course_places') order by tablename, cmd;
