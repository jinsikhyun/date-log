-- ─────────────────────────────────────────────────────────────
-- 멀티 커플 1단계: 데이터 모델만 준비 (UI 변경 없음, RLS 는 다음 단계).
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run. (여러 번 실행해도 안전)
-- ─────────────────────────────────────────────────────────────

-- 1) couples
create table if not exists public.couples (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  invite_code text unique,
  created_at  timestamptz not null default now()
);

-- 2) profiles — auth.users 와 1:1, 커플에 소속
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  couple_id    uuid references public.couples(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- 3) 기존 4개 테이블에 couple_id FK 컬럼 추가
alter table public.places         add column if not exists couple_id uuid references public.couples(id);
alter table public.memories       add column if not exists couple_id uuid references public.couples(id);
alter table public.memory_replies add column if not exists couple_id uuid references public.couples(id);
alter table public.courses        add column if not exists couple_id uuid references public.couples(id);

-- 4) 첫 커플 "진식지민" 생성 + 기존 데이터 전부 이 커플로 이관
insert into public.couples (name, invite_code)
values ('진식지민', 'JINJIM-0628')
on conflict (invite_code) do nothing;

update public.places
  set couple_id = (select id from public.couples where invite_code = 'JINJIM-0628')
  where couple_id is null;
update public.memories
  set couple_id = (select id from public.couples where invite_code = 'JINJIM-0628')
  where couple_id is null;
update public.memory_replies
  set couple_id = (select id from public.couples where invite_code = 'JINJIM-0628')
  where couple_id is null;
update public.courses
  set couple_id = (select id from public.couples where invite_code = 'JINJIM-0628')
  where couple_id is null;

-- ⚠️ 이 단계에서는 RLS 를 명시적으로 꺼둔다. 다음 단계(커플 스코프)에서 켤 것.
-- (Supabase 가 새 테이블에 RLS 를 기본 ON 으로 만드는 경우가 있어 명시적으로 OFF)
alter table public.couples  disable row level security;
alter table public.profiles disable row level security;

-- ── 확인용 ──────────────────────────────────────────────────
-- select id, name, invite_code, created_at from public.couples;
-- select
--   (select count(*) from public.places         where couple_id is null) as places_null,
--   (select count(*) from public.memories       where couple_id is null) as memories_null,
--   (select count(*) from public.memory_replies where couple_id is null) as replies_null,
--   (select count(*) from public.courses        where couple_id is null) as courses_null;
--   -- 네 값 모두 0 이어야 정상
