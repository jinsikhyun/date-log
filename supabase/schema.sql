-- ─────────────────────────────────────────────────────────────
-- date.log 스키마 + 시드 (개인 프로토타입)
-- 실행: Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run.
-- 여러 번 실행해도 안전하도록 짜여 있음:
--   테이블/인덱스는 CREATE ... IF NOT EXISTS,
--   정책은 DROP POLICY IF EXISTS 후 CREATE POLICY (PostgreSQL 은 CREATE POLICY IF NOT EXISTS 미지원),
--   시드는 ON CONFLICT DO NOTHING.
--
-- 정책 요약(공개 배포 기준): 방문자(anon)는 SELECT + INSERT 만. UPDATE/DELETE 는 거부.
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
  rating           numeric(2,1),
  first_visit_date date,
  description      text,
  memory_count     integer not null default 0,
  created_at       timestamptz not null default now(),
  constraint places_name_address_key unique (name, address)
);

alter table public.places enable row level security;

-- 공개 배포 기준: 방문자(anon)는 읽기 + 추가(INSERT)만. 수정/삭제는 정책 없음 = 거부.
-- ⚠️ 다음 단계: Supabase Auth 도입 후 UPDATE/DELETE 는 소유자에게만 허용.
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

-- ── memories (구조만 준비, 이번 단계 UI 없음) ──────────────────
create table if not exists public.memories (
  id         bigint generated always as identity primary key,
  place_id   bigint not null references public.places(id) on delete cascade,
  date       date,
  content    text,
  mood_tag   text,
  created_at timestamptz not null default now()
);

create index if not exists memories_place_id_idx on public.memories (place_id);

alter table public.memories enable row level security;

-- places 와 동일: 읽기 + 추가만. (아직 UI 없음)
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
