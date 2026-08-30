-- ═════════════════════════════════════════════════════════════
-- 우편함 알림: 장소 알림 문구를 status(다녀온 곳/가고 싶은 곳)로 구분한다.
--   - visited  : "{이름}님이 장소를 기록했습니다"        (그대로)
--   - wishlist : "{이름}님이 가고 싶은 장소를 추가했습니다" (신규)
-- memories / memory_replies 분기는 그대로. 트리거는 이 함수를 이름으로
-- 참조하므로 create or replace 만으로 끝 (트리거 재생성 불필요).
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. (여러 번 실행해도 안전)
-- ═════════════════════════════════════════════════════════════

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
    if new.status = 'wishlist' then
      msg := coalesce(actor_name, '상대방') || '님이 가고 싶은 장소를 추가했습니다';
    else
      msg := coalesce(actor_name, '상대방') || '님이 장소를 기록했습니다';
    end if;
    link := '/places/' || new.id;

  elsif tg_table_name = 'memories' then
    msg  := coalesce(actor_name, '상대방') || '님이 추억을 기록했습니다';
    link := '/places/' || new.place_id;

  elsif tg_table_name = 'memory_replies' then
    preview := coalesce(new.content, '');
    if char_length(preview) > 25 then
      preview := left(preview, 25) || '...';
    end if;
    msg := coalesce(actor_name, '상대방')
           || '님이 댓글을 남겼습니다: "' || preview || '"';
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

-- ── 확인용 ──────────────────────────────────────────────────
-- select id, message, related_link, created_at
--   from public.notifications order by created_at desc limit 10;
