-- ─────────────────────────────────────────────────────────────
-- AI 추천 비용 제한을 DB 기반으로 — 커플당 시간당 호출 횟수를 이 테이블에 기록하고
-- /api/ai-recommend 가 최근 1시간 행 수를 세어 제한한다(기존 서버 인스턴스 메모리
-- 방식은 Vercel 서버리스에서 인스턴스가 여러 개/재시작되면 안 지켜지는 문제가 있었음).
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run. (여러 번 실행해도 안전)
-- add-couple-rls.sql 의 my_couple_id() / set_couple_id() 를 그대로 재사용한다.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.ai_recommend_calls (
  id         bigint generated always as identity primary key,
  couple_id  uuid not null references public.couples(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ai_recommend_calls_couple_created_idx
  on public.ai_recommend_calls (couple_id, created_at desc);

alter table public.ai_recommend_calls enable row level security;

drop policy if exists "ai_recommend_calls: couple select" on public.ai_recommend_calls;
drop policy if exists "ai_recommend_calls: couple insert" on public.ai_recommend_calls;

create policy "ai_recommend_calls: couple select" on public.ai_recommend_calls for select to authenticated
  using (couple_id = public.my_couple_id());
create policy "ai_recommend_calls: couple insert" on public.ai_recommend_calls for insert to authenticated
  with check (couple_id = public.my_couple_id());
-- update/delete 정책 없음 — 호출 기록은 추가만 하고 고치거나 지우지 않는다.

drop trigger if exists trg_ai_recommend_calls_couple_id on public.ai_recommend_calls;
create trigger trg_ai_recommend_calls_couple_id before insert on public.ai_recommend_calls
  for each row execute function public.set_couple_id();

-- 확인용:
-- select couple_id, count(*) from public.ai_recommend_calls
--   where created_at > now() - interval '1 hour' group by couple_id;
