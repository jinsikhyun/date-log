-- ─────────────────────────────────────────────────────────────
-- date.log 스키마 + 시드 (개인 프로토타입)
-- 실행: Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run.
-- 여러 번 실행해도 안전하도록 짜여 있음:
--   테이블/인덱스는 CREATE ... IF NOT EXISTS,
--   정책은 DROP POLICY IF EXISTS 후 CREATE POLICY (PostgreSQL 은 CREATE POLICY IF NOT EXISTS 미지원),
--   시드는 ON CONFLICT DO NOTHING.
--
-- 정책 요약: 방문자(anon)에게 SELECT / INSERT / UPDATE / DELETE 전부 허용.
--   (둘이서만 쓰는 프로토타입. 실수 방지는 앱의 확인창이 담당.)
-- ⚠️ 다음 단계: Supabase Auth 도입 후 UPDATE/DELETE 를 소유자에게만 허용하고,
--    memories 에 is_private 컬럼 + 비공개 정책을 추가한다.
-- ─────────────────────────────────────────────────────────────

-- ── places ───────────────────────────────────────────────────
create table if not exists public.places (
  id               bigint generated always as identity primary key,
  name             text    not null,
  category         text    not null,
  address          text    not null,
  naver_map_link   text,
  kakao_map_link   text,                             -- 카카오 place_url 또는 장소명 검색 링크
  via_course       boolean not null default false,   -- 코스 미니폼으로 생성 → /wishlist 에는 숨김
  rating           numeric(2,1),
  first_visit_date date,
  description      text,
  image_url        text,
  lat              double precision,
  lng              double precision,
  status           text not null default 'visited', -- 'visited' | 'wishlist'
  wanted_by        text,                             -- (구) 단일값. 참고용으로 남김. 이제 wanted_by_ids 사용
  wanted_by_ids    uuid[] not null default '{}',      -- 이 위시를 원하는 커플 구성원 profile id (0~2), 독립 토글
  added_by         text,                             -- 등록한 사람 (로그인 사용자 display_name)
  memory_count     integer not null default 0,
  visit_order      integer,
  image_captured_date date,
  created_at       timestamptz not null default now()
  -- 장소 유일성은 커플 단위 (couple_id, name, address) — couple_id 컬럼이 생긴 뒤
  -- 아래 "멀티 커플 모델" 섹션에서 places_couple_name_address_key 로 건다.
);
alter table public.places add column if not exists visit_order integer;
alter table public.places add column if not exists image_captured_date date;

-- 기존 DB 에도 컬럼 보장
alter table public.places add column if not exists image_url text;
alter table public.places add column if not exists lat double precision; -- 카카오 장소검색 위도
alter table public.places add column if not exists lng double precision; -- 카카오 장소검색 경도
alter table public.places add column if not exists status text not null default 'visited';
alter table public.places add column if not exists wanted_by text;
-- 위시 "누가 원해요" 를 배열로 (migrate-wanted-by-to-ids.sql 참고)
alter table public.places add column if not exists wanted_by_ids uuid[] not null default '{}';
alter table public.places drop constraint if exists places_status_check;
alter table public.places add constraint places_status_check check (status in ('visited', 'wishlist', 'course_only'));
-- 코스 전용 장소: 이 코스가 삭제되면 함께 삭제 (add-course-only-places.sql 참고)
alter table public.places add column if not exists owning_course_id bigint references public.courses(id) on delete cascade;
create index if not exists places_owning_course_idx on public.places (owning_course_id);
-- wanted_by 는 이제 커플별 profiles.display_name 을 값으로 가지므로 고정 CHECK 없음
-- (drop-wanted-by-check.sql 참고)
alter table public.places drop constraint if exists places_wanted_by_check;
alter table public.places add column if not exists added_by text;
-- 즐겨찾기 태그 (add-favorite-tags.sql)
alter table public.places add column if not exists favorite_by uuid[] not null default '{}';
alter table public.places add column if not exists is_regular boolean not null default false;
alter table public.places add column if not exists kakao_map_link text;
alter table public.places add column if not exists via_course boolean not null default false;
update public.places set status = 'visited' where status is null or status = '';
update public.places set added_by = '진식' where added_by is null;
update public.places
  set kakao_map_link = 'https://map.kakao.com/link/search/' || replace(name, ' ', '%20')
  where kakao_map_link is null or kakao_map_link = '';

alter table public.places enable row level security;

-- 방문자(anon)에게 읽기·추가·수정·삭제 전부 허용. (프로토타입 — 확인창이 안전장치)
drop policy if exists "places: prototype full access" on public.places;
drop policy if exists "places: public read"   on public.places;
drop policy if exists "places: public insert" on public.places;
drop policy if exists "places: public update" on public.places;
drop policy if exists "places: public delete" on public.places;
create policy "places: public read"
  on public.places for select
  to anon, authenticated
  using (true);
create policy "places: public insert"
  on public.places for insert
  to anon, authenticated
  with check (true);
create policy "places: public update"
  on public.places for update
  to anon, authenticated
  using (true) with check (true);
create policy "places: public delete"
  on public.places for delete
  to anon, authenticated
  using (true);

-- ── memories (구조만 준비, 이번 단계 UI 없음) ──────────────────
create table if not exists public.memories (
  id         bigint generated always as identity primary key,
  place_id   bigint not null references public.places(id) on delete cascade,
  date       date,
  content    text,
  mood_tag   text,
  author     text, -- 작성한 사람 ('진식' / '지민')
  photo_urls text[] not null default '{}', -- 첨부 사진 public URL 목록 (place-photos 버킷)
  created_at timestamptz not null default now()
);

alter table public.memories add column if not exists author text;
update public.memories set author = '진식' where author is null;
alter table public.memories add column if not exists photo_urls text[] not null default '{}';

create index if not exists memories_place_id_idx on public.memories (place_id);

alter table public.memories enable row level security;

-- places 와 동일: 읽기·추가·수정·삭제 전부 허용.
drop policy if exists "memories: prototype full access" on public.memories;
drop policy if exists "memories: public read"   on public.memories;
drop policy if exists "memories: public insert" on public.memories;
drop policy if exists "memories: public update" on public.memories;
drop policy if exists "memories: public delete" on public.memories;
create policy "memories: public read"
  on public.memories for select
  to anon, authenticated
  using (true);
create policy "memories: public insert"
  on public.memories for insert
  to anon, authenticated
  with check (true);
create policy "memories: public update"
  on public.memories for update
  to anon, authenticated
  using (true) with check (true);
create policy "memories: public delete"
  on public.memories for delete
  to anon, authenticated
  using (true);

-- ── memory_replies (추억 대댓글) ────────────────────────────
create table if not exists public.memory_replies (
  id         bigint generated always as identity primary key,
  memory_id  bigint not null references public.memories(id) on delete cascade,
  author     text,
  content    text,
  created_at timestamptz not null default now()
);
create index if not exists memory_replies_memory_id_idx on public.memory_replies (memory_id);
alter table public.memory_replies enable row level security;
drop policy if exists "memory_replies: public read"   on public.memory_replies;
drop policy if exists "memory_replies: public insert" on public.memory_replies;
drop policy if exists "memory_replies: public update" on public.memory_replies;
drop policy if exists "memory_replies: public delete" on public.memory_replies;
create policy "memory_replies: public read"
  on public.memory_replies for select to anon, authenticated using (true);
create policy "memory_replies: public insert"
  on public.memory_replies for insert to anon, authenticated with check (true);
create policy "memory_replies: public update"
  on public.memory_replies for update to anon, authenticated using (true) with check (true);
create policy "memory_replies: public delete"
  on public.memory_replies for delete to anon, authenticated using (true);

-- ── categories (카테고리 직접 관리) ─────────────────────────
create table if not exists public.categories (
  id         bigint generated always as identity primary key,
  name       text    not null unique,
  color      text    not null default 'stone', -- tailwind 색 이름
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

insert into public.categories (name, color, icon, sort_order) values
  ('맛집', 'orange',  '🍽️', 10),
  ('카페', 'amber',   '☕',  20),
  ('술집', 'rose',    '🍶', 30),
  ('바',   'purple',  '🍸', 40),
  ('사진', 'sky',     '📷', 50),
  ('전시', 'fuchsia', '🖼️', 60),
  ('기타', 'stone',   '📍', 70)
on conflict (name) do nothing;

-- ── 시드: 장소 11개 ──────────────────────────────────────────
insert into public.places (name, category, address, naver_map_link, rating, first_visit_date, description) values
  ('산체스 막걸리', '맛집', '서울 종로구 윤보선길 26 지하1층', 'https://naver.me/xZVbAn1W', 4.5, '2025-06-28', '안국의 느낌좋은 막걸리 바'),
  ('오키드고멧 안국', '카페', '서울 종로구 창덕궁길 35 2층 오키드고멧', 'https://naver.me/F42McSoO', 4.0, '2025-06-28', '창덕궁 뷰의 운치있는 카페'),
  ('테일러커피 서촌 경복궁점', '카페', '서울 종로구 효자로 15 1층', 'https://naver.me/FUQQqI32', 4.0, '2025-11-09', '효자로 뷰 커피 맛있는 카페'),
  ('카멜커피 서촌점', '카페', '서울 종로구 효자로 31 1층, 2층', 'https://naver.me/xAFoG5mD', 4.5, '2025-11-09', '효자로 뷰 라떼 맛있는 카페'),
  ('영카이브 서촌점', '전시', '서울 종로구 필운대로 47', 'https://map.naver.com/p/search/%EC%98%81%EC%B9%B4%EC%9D%B4%EB%B8%8C%20%EC%84%9C%EC%B4%8C%EC%A0%90', 5.0, '2026-08-29', '한옥 외관이 매력적인 감성 셀프 사진관'),
  ('올드앤와이즈', '기타', '서울 종로구 자하문로 23 지하1층', 'https://map.naver.com/p/search/%EC%98%AC%EB%93%9C%EC%95%A4%EC%99%80%EC%9D%B4%EC%A6%88', 4.5, '2026-08-29', '신청곡을 틀어주는 분위기 끝판왕 서촌 LP바. 술 한잔하며 음악 듣기 최고!'),
  ('할매집', '맛집', '서울 종로구 사직로12길 1-5', 'https://map.naver.com/p/search/%ED%95%A0%EB%A7%A4%EC%A7%91', 4.0, '2026-08-29', '미슐랭 빕구르망에 빛나는 매콤한 족발과 감자탕의 환상적인 조합.'),
  ('안주마을', '맛집', '서울 종로구 자하문로1길 3', 'https://map.naver.com/p/search/%EC%95%88%EC%A3%BC%EB%A7%88%EC%9D%84', 5.0, '2026-08-29', '웨이팅이 아깝지 않은 서촌 최고의 해산물 실내 포장마차.'),
  ('도량', '맛집', '서울 종로구 자하문로6길 6 2층', 'https://map.naver.com/p/search/%EB%8F%84%EB%9F%89', 4.5, '2026-08-29', '고급스럽고 깔끔한 분위기에서 즐기는 훠궈와 동파육 맛집.'),
  ('시노라 서촌점', '카페', '서울 종로구 자하문로 116', 'https://map.naver.com/p/search/%EC%8B%9C%EB%85%B8%EB%9D%BC%20%EC%84%9C%EC%B4%8C%EC%A0%90', 4.5, '2026-08-29', '드립 커피 향이 가득한, 조용히 머무르며 이야기 나누기 좋은 감성 카페.'),
  ('에디션덴마크 쇼룸', '카페', '서울 종로구 자하문로9길 24', 'https://map.naver.com/p/search/%EC%97%90%EB%94%94%EC%85%98%EB%8D%B4%EB%A7%88%ED%81%AC%20%EC%87%BC%EB%A3%B8', 4.0, '2026-08-29', '서촌에서 느끼는 작은 덴마크. 차 한잔과 함께 북유럽의 여유를 즐길 수 있는 곳.')
on conflict (name, address) do nothing;

-- ── 멀티 커플 모델 (1단계: 구조만, RLS 없음) ────────────────
create table if not exists public.couples (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  invite_code text unique,
  start_date  date,                              -- 관계 시작일 (설정 페이지에서 입력)
  created_at  timestamptz not null default now()
);
alter table public.couples add column if not exists start_date date;

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email        text, -- 가입 이메일 (설정 페이지 "파트너 계정" 표시용)
  birth_date   date, -- 프로필 생일 (캘린더 기념일 표시용)
  couple_id    uuid references public.couples(id) on delete set null,
  created_at   timestamptz not null default now()
);
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists birth_date date;
update public.profiles p set email = u.email
  from auth.users u where u.id = p.id and (p.email is null or p.email = '');

alter table public.places         add column if not exists couple_id uuid references public.couples(id);
alter table public.memories       add column if not exists couple_id uuid references public.couples(id);
alter table public.memory_replies add column if not exists couple_id uuid references public.couples(id);
alter table public.courses        add column if not exists couple_id uuid references public.couples(id);

insert into public.couples (name, invite_code, start_date)
values ('진식지민', 'JINJIM-0628', date '2025-06-28')
on conflict (invite_code) do nothing;
update public.couples set start_date = date '2025-06-28'
  where invite_code = 'JINJIM-0628' and start_date is null;

update public.places         set couple_id = (select id from public.couples where invite_code = 'JINJIM-0628') where couple_id is null;
update public.memories       set couple_id = (select id from public.couples where invite_code = 'JINJIM-0628') where couple_id is null;
update public.memory_replies set couple_id = (select id from public.couples where invite_code = 'JINJIM-0628') where couple_id is null;
update public.courses        set couple_id = (select id from public.couples where invite_code = 'JINJIM-0628') where couple_id is null;

-- 장소 유일성을 (name, address) 전역 → (couple_id, name, address) 커플 단위로.
-- (전역이면 다른 커플이 같은 장소를 못 넣음)  → scope-place-uniqueness.sql 도 참고
alter table public.places drop constraint if exists places_name_address_key;
alter table public.places drop constraint if exists places_couple_name_address_key;
alter table public.places add constraint places_couple_name_address_key
  unique (couple_id, name, address);

-- RLS 는 다음 단계에서 커플 스코프로 켤 것. 지금은 명시적으로 OFF.
alter table public.couples  disable row level security;
alter table public.profiles disable row level security;

-- ⚠️ 4단계에서 places/memories/memory_replies/courses/course_places/profiles/couples 의
--    "public" 개방 정책을 커플 스코프 정책으로 교체한다.
--    (my_couple_id() 함수 + set_couple_id() insert 트리거 포함)
--    전체 내용은 supabase/add-couple-rls.sql 참고.

-- 관계 시작일(설정 페이지) 저장을 위해 couples UPDATE 정책 추가.
-- 전체 내용은 supabase/add-couple-start-date.sql 참고.
-- create policy "couples: update own" on public.couples for update to authenticated
--   using (id = public.my_couple_id()) with check (id = public.my_couple_id());

-- ── 우편함 알림 (notifications) ──────────────────────────────
-- 테이블만 여기 두고, 트리거/함수/RLS 전체는 supabase/add-notifications.sql 참고.
create table if not exists public.notifications (
  id           bigint generated always as identity primary key,
  couple_id    uuid not null references public.couples(id)  on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message      text not null,
  related_link text,
  is_read      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, is_read, created_at desc);
-- places/memories/memory_replies 에 AFTER INSERT 트리거(notify_partner) → 파트너에게 알림.

-- ── 이모지 반응 (reactions) ─────────────────────────────────
-- 테이블만 여기 두고, 헬퍼 함수/RLS 전체는 supabase/add-reactions.sql 참고.
create table if not exists public.reactions (
  id          bigint generated always as identity primary key,
  target_type text  not null check (target_type in ('memory', 'reply')),
  target_id   bigint not null,
  profile_id  uuid  not null references public.profiles(id) on delete cascade,
  emoji       text  not null,
  created_at  timestamptz not null default now(),
  constraint reactions_one_per_target unique (target_type, target_id, profile_id)
);
create index if not exists reactions_target_idx on public.reactions (target_type, target_id);
