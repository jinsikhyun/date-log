-- 프로필 생일 등록·수정
-- 각 사용자는 자신의 생일만 RPC로 변경할 수 있다.

alter table public.profiles
  add column if not exists birth_date date;

revoke update(birth_date) on public.profiles from public, anon, authenticated;

create or replace function public.update_my_birth_date(p_birth_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if p_birth_date is not null and p_birth_date > current_date then
    raise exception '생일은 오늘 이후로 설정할 수 없습니다.';
  end if;

  update public.profiles
     set birth_date = p_birth_date
   where id = auth.uid();

  if not found then
    raise exception '프로필을 찾지 못했습니다.';
  end if;
end;
$$;

revoke all on function public.update_my_birth_date(date) from public, anon;
grant execute on function public.update_my_birth_date(date) to authenticated;

-- 확인
-- select id, display_name, birth_date from public.profiles order by created_at;
