-- ─────────────────────────────────────────────────────────────
-- 추억에 대댓글(답장) — 채팅 말풍선 느낌.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. (여러 번 실행해도 안전)
--
-- author  : 답장 단 사람 ('진식' / '지민') — 브라우저 localStorage 값
-- content : 답장 내용
-- ─────────────────────────────────────────────────────────────

create table if not exists public.memory_replies (
  id         bigint generated always as identity primary key,
  memory_id  bigint not null references public.memories(id) on delete cascade,
  author     text,
  content    text,
  created_at timestamptz not null default now()
);

create index if not exists memory_replies_memory_id_idx
  on public.memory_replies (memory_id);

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

-- 확인용:
-- select memory_id, count(*) from public.memory_replies group by memory_id;
