-- ─────────────────────────────────────────────────────────────
-- 관계 시작일: couples.start_date 컬럼 + 시드 커플 값 + 멤버 UPDATE 정책
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run. (여러 번 실행해도 안전)
-- ─────────────────────────────────────────────────────────────

-- 1) start_date 컬럼 (date, nullable)
alter table public.couples add column if not exists start_date date;

-- 2) 기존 "진식지민" 커플에 2025-06-28 채우기 (이미 값 있으면 안 건드림)
update public.couples
  set start_date = date '2025-06-28'
  where invite_code = 'JINJIM-0628'
    and start_date is null;

-- 3) 커플 구성원이 자기 커플 행을 수정할 수 있게 UPDATE 정책 추가.
--    add-couple-rls.sql 에는 couples 에 update 정책이 없어서(=아무도 못 고침)
--    설정 페이지에서 start_date 를 저장하려면 이 정책이 필요하다.
--    ⚠️ 정책은 "행 단위"라 같은 커플 구성원이면 name/invite_code 도 바꿀 수 있음.
--       2인 개인용 앱이라 허용. (앱 UI 는 start_date 만 노출)
drop policy if exists "couples: update own" on public.couples;
create policy "couples: update own" on public.couples for update to authenticated
  using (id = public.my_couple_id())
  with check (id = public.my_couple_id());

-- ── 확인용 ──────────────────────────────────────────────────
-- select id, name, invite_code, start_date from public.couples;
