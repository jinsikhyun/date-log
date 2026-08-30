-- ─────────────────────────────────────────────────────────────
-- "누가 가고 싶어해요?" 선택지를 '나'/'여자친구' → 이름(진식/지민)으로 변경.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. (여러 번 실행해도 안전)
--
-- ⚠️ 6단계(멀티 커플)에서 이 파일이 다시 추가하는 places_wanted_by_check 는
--    drop-wanted-by-check.sql 로 제거된다. 이 파일을 나중에 재실행했다면
--    drop-wanted-by-check.sql 도 다시 실행할 것.
-- ─────────────────────────────────────────────────────────────

-- 1) 새 값이 옛 CHECK 를 위반하므로 제약부터 제거
alter table public.places drop constraint if exists places_wanted_by_check;

-- 2) 기존 값 이관: '나' → 등록자 본인(added_by), '여자친구' → 상대방
update public.places
set wanted_by = case
  when wanted_by = '나'       then coalesce(added_by, '진식')
  when wanted_by = '여자친구' then case when added_by = '지민' then '진식' else '지민' end
  else wanted_by
end
where wanted_by in ('나', '여자친구');

-- 3) 새 CHECK 제약
alter table public.places add constraint places_wanted_by_check
  check (wanted_by is null or wanted_by in ('진식', '지민', '둘다'));

-- 확인용:
-- select wanted_by, count(*) from public.places where wanted_by is not null group by wanted_by;
