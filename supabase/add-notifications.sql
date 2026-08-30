-- ═════════════════════════════════════════════════════════════
-- "우편함" 알림: notifications 테이블 + places/memories/memory_replies
-- AFTER INSERT 트리거로 파트너에게 조용히 알림을 쌓는다. (팝업 없음)
--
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run. (여러 번 실행해도 안전)
-- 전제: add-couples-model.sql (couples/profiles/couple_id) 이 먼저 적용돼 있어야 함.
-- ═════════════════════════════════════════════════════════════

-- 1) 테이블 ──────────────────────────────────────────────────
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

-- 2) RLS — 수신자 본인만 읽기/수정(읽음처리). 삽입은 트리거(security definer)만. ──
alter table public.notifications enable row level security;

drop policy if exists "notifications: read own"   on public.notifications;
drop policy if exists "notifications: update own" on public.notifications;

create policy "notifications: read own" on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid());

create policy "notifications: update own" on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());
-- insert/delete 정책 없음 → 사용자가 직접 못 만들고 못 지움. 생성은 아래 트리거만.

-- 3) 트리거 함수 — 방금 이 행을 만든 사람(auth.uid())의 display_name 을 찾고,
--    같은 couple_id 의 "나머지 한 명"을 recipient 로 알림을 삽입한다. ───────────
create or replace function public.notify_partner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id   uuid := auth.uid();
  actor_name text;
  recipient  uuid;
  msg        text;
  link       text;
  preview    text;
  place_ref  bigint;
begin
  -- 로그인 세션 밖(서비스 롤/마이그레이션 등)에서 들어온 insert 는 알림 대상 아님
  if actor_id is null then
    return new;
  end if;

  -- 방금 만든 사람 이름
  select display_name into actor_name
  from public.profiles where id = actor_id;

  -- 같은 커플에서 나 아닌 사람 (파트너)
  select id into recipient
  from public.profiles
  where couple_id = new.couple_id
    and id is distinct from actor_id
  order by created_at asc
  limit 1;

  -- 파트너가 없으면(혼자) 알림 생성 안 함
  if recipient is null then
    return new;
  end if;

  if tg_table_name = 'places' then
    msg  := coalesce(actor_name, '상대방') || '님이 장소를 기록했습니다';
    link := '/places/' || new.id;

  elsif tg_table_name = 'memories' then
    msg  := coalesce(actor_name, '상대방') || '님이 추억을 기록했습니다';
    link := '/places/' || new.place_id;

  elsif tg_table_name = 'memory_replies' then
    preview := coalesce(new.content, '');
    -- 25자 초과면 앞 25자 + "..." / 25자 이하면 그대로
    if char_length(preview) > 25 then
      preview := left(preview, 25) || '...';
    end if;
    msg := coalesce(actor_name, '상대방')
           || '님이 댓글을 남겼습니다: "' || preview || '"';
    -- 답글이 달린 추억이 속한 장소
    select place_id into place_ref
    from public.memories where id = new.memory_id;
    link := '/places/' || place_ref;

  else
    return new;
  end if;

  insert into public.notifications (couple_id, recipient_id, message, related_link)
  values (new.couple_id, recipient, msg, link);

  return new;
end;
$$;

-- 4) 트리거 부착 (AFTER INSERT — couple_id 는 set_couple_id BEFORE 트리거가 이미 채움) ──
drop trigger if exists trg_notify_place        on public.places;
drop trigger if exists trg_notify_memory       on public.memories;
drop trigger if exists trg_notify_memory_reply on public.memory_replies;

create trigger trg_notify_place
  after insert on public.places
  for each row execute function public.notify_partner();

create trigger trg_notify_memory
  after insert on public.memories
  for each row execute function public.notify_partner();

create trigger trg_notify_memory_reply
  after insert on public.memory_replies
  for each row execute function public.notify_partner();

-- ── 확인용 ──────────────────────────────────────────────────
-- select id, recipient_id, message, related_link, is_read, created_at
--   from public.notifications order by created_at desc limit 20;
