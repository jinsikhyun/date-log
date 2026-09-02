-- 프로필 별명/사진 관리. 01~03 적용 후 SQL Editor에서 1회 실행.
begin;

alter table public.profiles add column if not exists avatar_path text;

-- 별명과 avatar_path는 아래 RPC만 변경한다.
-- 별명 직접 UPDATE를 막아 과거 작성자 문자열 연동을 우회하지 못하게 한다.
revoke update(display_name) on public.profiles from public, anon, authenticated;

create or replace function public.update_my_display_name(p_display_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_old text; v_couple uuid; v_name text := btrim(p_display_name);
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  if length(v_name) not between 1 and 30 then raise exception '별명은 1~30자로 입력해 주세요'; end if;
  select display_name, couple_id into v_old, v_couple from public.profiles where id=v_uid for update;
  if not found then raise exception '프로필을 찾을 수 없습니다'; end if;
  if exists(select 1 from public.profiles where couple_id=v_couple and id<>v_uid and lower(btrim(display_name))=lower(v_name)) then
    raise exception '파트너와 다른 별명을 사용해 주세요';
  end if;
  update public.profiles set display_name=v_name where id=v_uid;
  -- 레거시 작성자 문자열도 한 트랜잭션에서 갱신한다.
  update public.places set added_by=v_name where couple_id=v_couple and added_by=v_old;
  update public.memories set author=v_name where couple_id=v_couple and author=v_old;
  update public.memory_replies set author=v_name where couple_id=v_couple and author=v_old;
  return v_name;
end $$;
revoke all on function public.update_my_display_name(text) from public, anon;
grant execute on function public.update_my_display_name(text) to authenticated;

create or replace function public.set_my_avatar_path(p_avatar_path text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_expected text;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  v_expected := v_uid::text || '/avatar.jpg';
  if p_avatar_path is distinct from v_expected then raise exception '올바르지 않은 프로필 사진 경로입니다'; end if;
  update public.profiles set avatar_path=v_expected where id=v_uid;
  if not found then raise exception '프로필을 찾을 수 없습니다'; end if;
  return v_expected;
end $$;
revoke all on function public.set_my_avatar_path(text) from public, anon;
grant execute on function public.set_my_avatar_path(text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-avatars','profile-avatars',false,5242880,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg'];

drop policy if exists "profile avatars: couple read" on storage.objects;
drop policy if exists "profile avatars: own insert" on storage.objects;
drop policy if exists "profile avatars: own update" on storage.objects;
drop policy if exists "profile avatars: own delete" on storage.objects;
create policy "profile avatars: couple read" on storage.objects for select to authenticated using (
  bucket_id='profile-avatars' and exists(select 1 from public.profiles owner join public.profiles me on me.id=auth.uid() where owner.id::text=(storage.foldername(name))[1] and owner.couple_id=me.couple_id)
);
create policy "profile avatars: own insert" on storage.objects for insert to authenticated with check (bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "profile avatars: own update" on storage.objects for update to authenticated using (bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "profile avatars: own delete" on storage.objects for delete to authenticated using (bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text);

commit;

-- 네 값이 모두 true면 앱 배포 준비 완료.
select
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='avatar_path'
  ) as avatar_column_ready,
  to_regprocedure('public.update_my_display_name(text)') is not null as display_name_rpc_ready,
  to_regprocedure('public.set_my_avatar_path(text)') is not null as avatar_rpc_ready,
  exists (select 1 from storage.buckets where id='profile-avatars' and public=false) as private_bucket_ready;
