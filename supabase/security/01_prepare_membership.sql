-- 검토용: 운영 자동 적용 금지. README.md의 사전 점검/배포 순서를 따를 것.
-- 기존 데이터/정책은 유지하고 새 온보딩 RPC만 준비한다.
begin;

create schema if not exists datelog_private;
revoke all on schema datelog_private from public, anon, authenticated;
create table if not exists datelog_private.join_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  attempts integer not null
);
alter table datelog_private.join_attempts enable row level security;
revoke all on datelog_private.join_attempts from public, anon, authenticated;

-- user_id / couple_id / email을 클라이언트 입력으로 받지 않는다.
-- p_invite_code=NULL: 생성, 나머지: 초대코드 검증 후 합류.
create or replace function public.connect_couple(p_display_name text, p_invite_code text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_couple uuid;
  v_code text;
  v_attempts integer;
begin
  if v_user is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if p_display_name is null or length(btrim(p_display_name)) not between 1 and 50 then
    raise exception '이름은 1~50자로 입력해 주세요.' using errcode = '22023';
  end if;

  -- 프로필이 아직 없는 사용자도 직렬화. 생성/합류 동시 요청에 공통 잠금 사용.
  select u.email into v_email from auth.users u where u.id = v_user for update;
  if not found then raise exception '계정을 확인할 수 없어요.' using errcode = '42501'; end if;
  select p.couple_id into v_couple from public.profiles p where p.id = v_user;
  if v_couple is not null then
    return jsonb_build_object('error', '이미 커플에 연결되어 있어요.');
  end if;

  if p_invite_code is null then
    -- 기존 코드 유지. 신규 코드는 무작위 UUID(122비트)를 사용한다.
    v_code := upper(replace(gen_random_uuid()::text, '-', ''));
    insert into public.couples(invite_code) values (v_code) returning id into v_couple;
  else
    -- 실패도 JSON으로 반환해서 시도 횟수가 롤백되지 않게 한다.
    insert into datelog_private.join_attempts as a values (v_user, clock_timestamp(), 1)
    on conflict (user_id) do update set
      attempts = case when a.window_started_at < clock_timestamp() - interval '15 minutes'
        then 1 else a.attempts + 1 end,
      window_started_at = case when a.window_started_at < clock_timestamp() - interval '15 minutes'
        then clock_timestamp() else a.window_started_at end
    returning attempts into v_attempts;
    if v_attempts > 5 then
      return jsonb_build_object('error', '시도가 너무 많아요. 15분 뒤 다시 시도해 주세요.');
    end if;
    if length(btrim(p_invite_code)) not between 1 and 64 then
      return jsonb_build_object('error', '초대코드를 확인해 주세요.');
    end if;
    select c.id, c.invite_code into v_couple, v_code
      from public.couples c where c.invite_code = upper(btrim(p_invite_code)) for update;
    if not found then return jsonb_build_object('error', '초대코드를 확인해 주세요.'); end if;
    -- 같은 커플로 동시에 합류하는 경우에도 최대 두 명.
    if (select count(*) from public.profiles p where p.couple_id = v_couple) >= 2 then
      return jsonb_build_object('error', '이미 두 명이 연결된 커플이에요.');
    end if;
  end if;

  insert into public.profiles(id, display_name, email, couple_id)
    values (v_user, btrim(p_display_name), v_email, v_couple)
  on conflict (id) do update set display_name = excluded.display_name,
    email = excluded.email, couple_id = excluded.couple_id;
  return jsonb_build_object('couple_id', v_couple, 'invite_code', v_code);
end;
$$;
revoke all on function public.connect_couple(text, text) from public, anon, authenticated;
grant execute on function public.connect_couple(text, text) to authenticated;
commit;
