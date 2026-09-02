-- 운영 적용은 별도 승인. 기존 커플 소속 변경 방어(02)가 먼저 필요하다.
begin;
do $$ begin
  if has_column_privilege('authenticated','public.profiles','couple_id','UPDATE')
     or has_column_privilege('authenticated','public.profiles','couple_id','INSERT') then
    raise exception '프로필 소속 직접 변경 권한을 먼저 차단해야 합니다 (02_enforce_membership.sql).';
  end if;
end $$;
create table if not exists public.place_preferences (
  place_id bigint not null references public.places(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind = 'pick'),
  created_at timestamptz not null default now(),
  primary key(place_id,user_id,kind)
);
alter table public.place_preferences enable row level security;
revoke all on public.place_preferences from public, anon, authenticated;
grant select, insert, delete on public.place_preferences to authenticated;
drop policy if exists "preferences read couple" on public.place_preferences;
drop policy if exists "preferences insert self" on public.place_preferences;
drop policy if exists "preferences delete self" on public.place_preferences;
create policy "preferences read couple" on public.place_preferences for select to authenticated
 using (exists (select 1 from public.places p where p.id=place_id and p.couple_id=public.my_couple_id()));
create policy "preferences insert self" on public.place_preferences for insert to authenticated
 with check (user_id=auth.uid() and exists
   (select 1 from public.places p where p.id=place_id and p.couple_id=public.my_couple_id()));
create policy "preferences delete self" on public.place_preferences for delete to authenticated
 using (user_id=auth.uid() and exists
   (select 1 from public.places p where p.id=place_id and p.couple_id=public.my_couple_id()));

-- 최초 1회만 이관. 재실행해도 사용자가 해제한 pick이 되살아나지 않는다.
-- 이관 중 구버전이 배열을 수정하여 선택이 누락되는 것을 방지한다.
lock table public.places in share row exclusive mode;
create table if not exists datelog_private.preference_migrations(key text primary key);
revoke all on datelog_private.preference_migrations from public, anon, authenticated;
do $$ begin
  if not exists(select 1 from datelog_private.preference_migrations where key='legacy-picks-v1') then
    insert into public.place_preferences(place_id,user_id,kind)
      select p.id, pr.id, 'pick' from public.places p
      join public.profiles pr on pr.id=any(p.favorite_by) and pr.couple_id=p.couple_id
      on conflict do nothing;
    insert into datelog_private.preference_migrations values('legacy-picks-v1');
  end if;
end $$;

-- 단골은 커플 공동 스위치로 유지. 레거시 pick 배열만 쓰기 차단.
create or replace function public.freeze_legacy_preferences()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op='INSERT' then
    if coalesce(cardinality(new.favorite_by),0)>0 then
      raise exception '개인 pick은 place_preferences로 저장해 주세요.' using errcode='42501';
    end if;
  elsif new.favorite_by is distinct from old.favorite_by then
    raise exception '이전 pick 배열은 읽기 전용입니다.' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.freeze_legacy_preferences() from public, anon, authenticated;
drop trigger if exists freeze_legacy_preferences on public.places;
create trigger freeze_legacy_preferences before insert or update on public.places
for each row execute function public.freeze_legacy_preferences();
commit;
