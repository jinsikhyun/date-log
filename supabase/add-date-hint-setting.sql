-- 데이트 힌트 팝업 개인 설정(ON/OFF).
-- 커플 공유(couples)가 아니라 개인 preference라 profiles에 저장한다.
--
-- [총검토 중 수정] 원래 주석은 "기존 profiles RLS(본인 행만 update)로 이미 격리되어
-- 있어 별도 정책 불필요"라고 가정했으나, 실측 결과 잘못된 가정이었다. profiles 테이블은
-- REST(PostgREST) 직접 UPDATE가 애초에 막혀 있고(PATCH 403 실측 확인), display_name/
-- birth_date/avatar_path 모두 SECURITY DEFINER RPC(update_my_display_name 등)를 통해서만
-- 쓴다. date_hint_enabled 도 같은 패턴을 따라야 저장이 실제로 동작한다.
--
-- 실행은 사용자가 직접 한다 — 이 파일은 작성만, 여기서 실행하지 않는다.

alter table public.profiles
  add column if not exists date_hint_enabled boolean not null default true;

comment on column public.profiles.date_hint_enabled is
  '데이트 힌트 팝업 수신 여부(개인 설정). 커플 한 명이 꺼도 상대방에는 영향 없음.';

-- 기존 update_my_display_name/update_my_birth_date 와 동일한 패턴: SECURITY DEFINER 로
-- profiles 의 직접 UPDATE 제한을 우회하되, auth.uid() 로 반드시 본인 행만 건드리게 한다.
create or replace function public.update_my_date_hint_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.profiles
  set date_hint_enabled = p_enabled
  where id = auth.uid();
end;
$$;

grant execute on function public.update_my_date_hint_enabled(boolean) to authenticated;
