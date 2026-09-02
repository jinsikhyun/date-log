-- ─────────────────────────────────────────────────────────────
-- 우편함: 데이트 코스 생성 알림만 추가
-- 기존 places/memories/replies 알림 함수는 변경하지 않는다.
-- Supabase SQL Editor에서 통째로 실행. 여러 번 실행해도 안전하다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.notify_partner_course()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id   uuid := auth.uid();
  actor_name text;
  recipient  uuid;
begin
  if actor_id is null then
    return new;
  end if;

  select display_name into actor_name
  from public.profiles
  where id = actor_id;

  select id into recipient
  from public.profiles
  where couple_id = new.couple_id
    and id is distinct from actor_id
  order by created_at asc
  limit 1;

  if recipient is null then
    return new;
  end if;

  insert into public.notifications (
    couple_id,
    recipient_id,
    message,
    related_link
  ) values (
    new.couple_id,
    recipient,
    coalesce(actor_name, '상대방') || '님이 데이트 코스를 만들었습니다',
    '/courses/' || new.id
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_course on public.courses;
create trigger trg_notify_course
  after insert on public.courses
  for each row execute function public.notify_partner_course();

-- 확인용:
-- select id, message, related_link, created_at
-- from public.notifications
-- where related_link like '/courses/%'
-- order by created_at desc;
