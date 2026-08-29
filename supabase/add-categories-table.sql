-- ─────────────────────────────────────────────────────────────
-- 카테고리를 직접 추가/수정/삭제할 수 있게 별도 테이블로 분리.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. (여러 번 실행해도 안전)
--
-- name  : 카테고리 이름 (places.category 문자열과 매칭, unique)
-- color : tailwind 색 이름 (앱의 COLOR_CLASSES 키: stone/red/orange/amber/…/rose)
-- icon  : 이모지
-- ─────────────────────────────────────────────────────────────

create table if not exists public.categories (
  id         bigint generated always as identity primary key,
  name       text    not null unique,
  color      text    not null default 'stone',
  icon       text    not null default '📍',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

drop policy if exists "categories: public read"   on public.categories;
drop policy if exists "categories: public insert" on public.categories;
drop policy if exists "categories: public update" on public.categories;
drop policy if exists "categories: public delete" on public.categories;
create policy "categories: public read"
  on public.categories for select to anon, authenticated using (true);
create policy "categories: public insert"
  on public.categories for insert to anon, authenticated with check (true);
create policy "categories: public update"
  on public.categories for update to anon, authenticated using (true) with check (true);
create policy "categories: public delete"
  on public.categories for delete to anon, authenticated using (true);

-- 현재 앱 기본 카테고리 시드 (이미 있으면 그대로 둠)
insert into public.categories (name, color, icon, sort_order) values
  ('맛집', 'orange',  '🍽️', 10),
  ('카페', 'amber',   '☕',  20),
  ('술집', 'rose',    '🍶', 30),
  ('바',   'purple',  '🍸', 40),
  ('사진', 'sky',     '📷', 50),
  ('전시', 'fuchsia', '🖼️', 60),
  ('기타', 'stone',   '📍', 70)
on conflict (name) do nothing;

-- 확인용:
-- select * from public.categories order by sort_order;
