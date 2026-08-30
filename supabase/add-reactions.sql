-- ═════════════════════════════════════════════════════════════
-- 이모지 반응(리액션): 추억(memory) / 답글(reply) 에 카톡처럼 이모지 하나.
-- 한 사람이 한 항목에 반응 1개 (다른 이모지로 바꾸면 덮어씀 = upsert).
--
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run. (여러 번 실행해도 안전)
-- 전제: add-couples-model.sql + add-couple-rls.sql (my_couple_id(), couple_id 스탬프)
-- ═════════════════════════════════════════════════════════════

-- 1) 테이블 ──────────────────────────────────────────────────
create table if not exists public.reactions (
  id          bigint generated always as identity primary key,
  target_type text  not null check (target_type in ('memory', 'reply')),
  target_id   bigint not null,
  profile_id  uuid  not null references public.profiles(id) on delete cascade,
  emoji       text  not null,
  created_at  timestamptz not null default now(),
  -- 한 사람 = 한 항목에 반응 하나 (upsert 로 이모지 교체)
  constraint reactions_one_per_target unique (target_type, target_id, profile_id)
);

create index if not exists reactions_target_idx
  on public.reactions (target_type, target_id);

-- 2) 대상(memory/reply)이 내 커플 것인지 판정하는 헬퍼 ──────────
create or replace function public.reaction_target_is_mine(t_type text, t_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case t_type
    when 'memory' then exists (
      select 1 from public.memories m
      where m.id = t_id and m.couple_id = public.my_couple_id()
    )
    when 'reply' then exists (
      select 1 from public.memory_replies r
      where r.id = t_id and r.couple_id = public.my_couple_id()
    )
    else false
  end;
$$;

-- 3) RLS — 우리 커플 항목의 반응만 읽기 / 내 반응만 쓰기 ────────
alter table public.reactions enable row level security;

drop policy if exists "reactions: read couple"  on public.reactions;
drop policy if exists "reactions: insert own"   on public.reactions;
drop policy if exists "reactions: update own"   on public.reactions;
drop policy if exists "reactions: delete own"   on public.reactions;

create policy "reactions: read couple" on public.reactions
  for select to authenticated
  using (public.reaction_target_is_mine(target_type, target_id));

create policy "reactions: insert own" on public.reactions
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and public.reaction_target_is_mine(target_type, target_id)
  );

create policy "reactions: update own" on public.reactions
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "reactions: delete own" on public.reactions
  for delete to authenticated
  using (profile_id = auth.uid());

-- ── 확인용 ──────────────────────────────────────────────────
-- select target_type, target_id, emoji, count(*)
--   from public.reactions group by 1,2,3 order by 2 desc;
