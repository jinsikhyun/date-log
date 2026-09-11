-- ─────────────────────────────────────────────────────────────
-- AI 추천 고도화 6단계 — "관심 없어요" (CLAUDE_AI_RECOMMENDATION_UPGRADE_HANDOFF.md §6단계)
--
-- 사용자가 AI 추천 카드에서 "관심 없어요"를 누른 후보를 개인별로 기록하고, 그 사람에게만
-- 일정 기간 다시 보여주지 않는다. 2026-09-11 사용자 확정 정책:
--   · 개인 귀속: 누른 사람에게만 숨긴다. 파트너는 그대로 본다(한 사람의 거절이 상대 선호를 지우지 않음).
--     → SELECT 정책 자체를 user_id = auth.uid() 로 잠가 "내 것만 보인다"를 구조적으로 보장한다.
--   · 즉시 숨기고 사유는 선택 사항(없어도 기록됨). 사유별 재노출 제한 기간은 서버(src/lib/
--     recommendationDismissal.ts)가 계산해 expires_at 에 넣는다 — 취향 아님 180일 / 이미 알아요 90일 /
--     사유 없음 90일 / 너무 멀어요 30일(+ 거절했을 때의 출발지 근처에서만 적용, origin_lat/lng 참고).
--   · 취소 가능: 본인 행 DELETE. UPDATE 는 사유(reason)·만료 변경용으로만 본인 행에 허용.
--   · "미저장·미클릭"은 기록하지 않는다 — 명시적 클릭만 행이 된다.
--
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run. (여러 번 실행해도 안전)
-- add-couple-rls.sql 의 my_couple_id() / set_couple_id() 를 그대로 재사용한다.
-- 이 파일은 작성만 했고 실행하지 않았다 — 사용자 승인 후 별도로 적용할 것.
--
-- 롤백: drop table if exists public.ai_recommend_dismissals;
-- ─────────────────────────────────────────────────────────────

create table if not exists public.ai_recommend_dismissals (
  id            bigint generated always as identity primary key,
  couple_id     uuid not null references public.couples(id) on delete cascade,
  user_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  -- 카카오 place id. 코스 모드의 위시 후보는 "wish-<places.id>" 형식(서버가 그대로 넘기는 후보 id).
  candidate_id  text not null check (char_length(candidate_id) between 1 and 80),
  mode          text not null check (mode in ('place_detail', 'course')),
  reason        text check (reason in ('too_far', 'not_my_taste', 'already_know')),
  -- 거절 당시의 기준점(장소 상세 = 그 장소, 코스 = 마지막 정거장). "너무 멀어요"의 적용 범위 판정용.
  origin_lat    double precision,
  origin_lng    double precision,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);

-- 조회 패턴: "내가 남긴, 아직 안 지난 것" — kakao-candidates 가 매 요청마다 읽는다.
create index if not exists ai_recommend_dismissals_user_expires_idx
  on public.ai_recommend_dismissals (user_id, expires_at desc);

alter table public.ai_recommend_dismissals enable row level security;

drop policy if exists "ai_recommend_dismissals: own select" on public.ai_recommend_dismissals;
drop policy if exists "ai_recommend_dismissals: own insert" on public.ai_recommend_dismissals;
drop policy if exists "ai_recommend_dismissals: own update" on public.ai_recommend_dismissals;
drop policy if exists "ai_recommend_dismissals: own delete" on public.ai_recommend_dismissals;

-- 개인 귀속의 핵심: 같은 커플이라도 파트너의 거절 행은 읽히지 않는다.
create policy "ai_recommend_dismissals: own select" on public.ai_recommend_dismissals
  for select to authenticated
  using (user_id = auth.uid());
create policy "ai_recommend_dismissals: own insert" on public.ai_recommend_dismissals
  for insert to authenticated
  with check (user_id = auth.uid() and couple_id = public.my_couple_id());
create policy "ai_recommend_dismissals: own update" on public.ai_recommend_dismissals
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and couple_id = public.my_couple_id());
create policy "ai_recommend_dismissals: own delete" on public.ai_recommend_dismissals
  for delete to authenticated
  using (user_id = auth.uid());

drop trigger if exists trg_ai_recommend_dismissals_couple_id on public.ai_recommend_dismissals;
create trigger trg_ai_recommend_dismissals_couple_id before insert on public.ai_recommend_dismissals
  for each row execute function public.set_couple_id();

-- 확인용:
-- select user_id, candidate_id, mode, reason, expires_at from public.ai_recommend_dismissals
--   where expires_at > now() order by created_at desc;
