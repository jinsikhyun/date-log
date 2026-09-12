-- 구성원이 0명인 커플의 잔재 정리 (2026-09-12)
--
-- 배경: 2026-08-30 커플 유출 복구(fix-couple-leak.sql STEP 2)에서 잘못 편입된 프로필을
-- couple_id = null 로 분리했다. 그때 그 프로필들이 이미 만들어 둔 장소 행은 해당 커플에
-- 남았고, 커플에는 구성원이 한 명도 없게 됐다. RLS 는 `couple_id = my_couple_id()` 이므로
-- 지금은 아무도 읽을 수 없는 행이다(노출 위험 없음). 다만 커플 행과 invite_code 가 살아 있어
-- 누군가 그 코드를 알면 connect_couple() 로 합류해 이 데이터를 인계받을 수 있으므로 정리한다.
--
-- 안전장치: 지우기 전에 전체 행을 datelog_private 스키마의 백업 테이블로 그대로 복사한다.
-- 실행 시점에 구성원이 0명인 커플만 대상이며, 구성원이 1명 이상인 커플은 절대 건드리지 않는다.
--
-- 롤백:
--   insert into public.couples    select * from datelog_private.couples_memberless_backup_20260912;
--   insert into public.categories select * from datelog_private.categories_memberless_backup_20260912;
--   insert into public.places     select * from datelog_private.places_memberless_backup_20260912;
--   (places.id 는 identity 이므로 필요하면
--    select setval(pg_get_serial_sequence('public.places','id'), (select max(id) from public.places));)

begin;

create schema if not exists datelog_private;
revoke all on schema datelog_private from public, anon, authenticated;

create temporary table _dead_couples on commit drop as
  select c.id from public.couples c
  where not exists (select 1 from public.profiles p where p.couple_id = c.id);

create table if not exists datelog_private.places_memberless_backup_20260912
  as select * from public.places where false;
create table if not exists datelog_private.categories_memberless_backup_20260912
  as select * from public.categories where false;
create table if not exists datelog_private.couples_memberless_backup_20260912
  as select * from public.couples where false;

alter table datelog_private.places_memberless_backup_20260912     enable row level security;
alter table datelog_private.categories_memberless_backup_20260912 enable row level security;
alter table datelog_private.couples_memberless_backup_20260912    enable row level security;
revoke all on datelog_private.places_memberless_backup_20260912,
              datelog_private.categories_memberless_backup_20260912,
              datelog_private.couples_memberless_backup_20260912
  from public, anon, authenticated;

insert into datelog_private.places_memberless_backup_20260912
  select * from public.places     where couple_id in (select id from _dead_couples);
insert into datelog_private.categories_memberless_backup_20260912
  select * from public.categories where couple_id in (select id from _dead_couples);
insert into datelog_private.couples_memberless_backup_20260912
  select * from public.couples    where id in (select id from _dead_couples);

delete from public.places     where couple_id in (select id from _dead_couples);
delete from public.categories where couple_id in (select id from _dead_couples);
delete from public.couples    where id in (select id from _dead_couples);

-- 검증: 구성원 0명 커플이 남아 있지 않아야 한다.
do $$ declare n integer; begin
  select count(*) into n from public.couples c
    where not exists (select 1 from public.profiles p where p.couple_id = c.id);
  if n <> 0 then raise exception '정리 후에도 구성원 0명 커플이 % 개 남았습니다.', n; end if;
end $$;

commit;
