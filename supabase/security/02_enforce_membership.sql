-- 새 OnboardingView 배포 후 또는 통합 배포 점검 시간에 승인하여 적용. 기존 행 변경/삭제 없음.
-- 통합 전환: 빌드 성공 확인 → 02 → 03 → 즉시 새 앱 운영 배포. 사이에 구버전 온보딩/pick 사용 금지.
-- 이전 공개 SQL을 다시 실행하지 말 것. 사진 보호는 별도 단계다.
begin;
do $$ begin
  if to_regprocedure('public.connect_couple(text,text)') is null then
    raise exception '01_prepare_membership.sql을 먼저 적용해야 합니다.';
  end if;
end $$;

-- 이 세 테이블에 남은 permissive 정책을 모두 제거하고 명시적인 정책으로 교체.
do $$ declare p record; begin
  for p in select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('profiles','couples','categories')
  loop execute format('drop policy %I on public.%I', p.policyname, p.tablename); end loop;
end $$;
alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.categories enable row level security;

-- 테이블 권한뿐 아니라 별도로 부여된 컬럼 권한도 회수한다.
revoke all on public.profiles, public.couples, public.categories from public, anon, authenticated;
do $$ declare c record; begin
  for c in select table_name, column_name from information_schema.columns
    where table_schema = 'public' and table_name in ('profiles','couples','categories')
  loop
    execute format('revoke select (%I), insert (%I), update (%I), references (%I) on public.%I from public, anon, authenticated',
      c.column_name, c.column_name, c.column_name, c.column_name, c.table_name);
  end loop;
end $$;
grant select on public.profiles, public.couples to authenticated;
grant update(display_name) on public.profiles to authenticated;
grant update(start_date) on public.couples to authenticated;
-- 카테고리의 커플별 분리는 별도 제품 결정. 이번에는 비로그인 쓰기만 차단.
grant select, insert, update, delete on public.categories to authenticated;
do $$ declare seq text; begin
  seq := pg_get_serial_sequence('public.categories', 'id');
  if seq is not null then
    execute format('revoke all on sequence %s from public, anon, authenticated', seq);
    execute format('grant usage on sequence %s to authenticated', seq);
  end if;
end $$;

create policy "profiles: read self or partner" on public.profiles for select to authenticated
  using (id = auth.uid() or couple_id = public.my_couple_id());
create policy "profiles: update self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "couples: select own" on public.couples for select to authenticated
  using (id = public.my_couple_id());
create policy "couples: update own" on public.couples for update to authenticated
  using (id = public.my_couple_id()) with check (id = public.my_couple_id());
create policy "categories: authenticated access" on public.categories for all to authenticated
  using (true) with check (true);
commit;
