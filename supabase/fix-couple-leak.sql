-- ═════════════════════════════════════════════════════════════
-- 커플 유출 복구
--
-- 원인: add-couple-rls.sql 의 (구) "1) 기존 데이터/커플 통합" 블록이
--        update public.profiles set couple_id = <JINJIM-0628>
--          where couple_id is distinct from seed;
--       라서, 이 스크립트를 재실행할 때마다 **모든 계정 프로필을 진식지민 커플로
--       강제 편입**시켰다. 그래서 새로 가입한 계정도 JINJIM-0628 에 묶여
--       진식지민 데이터가 다 보이고, 헤더 부제목도 "진식/지민"으로 떴다.
--
-- 조치: 아래를 SQL Editor 에서 STEP 순서대로 실행.
--       (add-couple-rls.sql 의 해당 블록은 코드에서 제거함 → 앞으로 재실행해도 안전)
-- ═════════════════════════════════════════════════════════════

-- STEP 1 ─ 지금 JINJIM-0628 커플에 누가 붙어 있나? (진식·지민 2명만 있어야 정상)
select p.id, p.display_name, p.created_at, u.email
from public.profiles p
join auth.users u on u.id = p.id
where p.couple_id = (select id from public.couples where invite_code = 'JINJIM-0628')
order by p.created_at;


-- STEP 2 ─ "진짜 커플" 두 명만 남기고 나머지 프로필을 분리(couple_id = null).
--          분리된 계정은 다음 로그인 때 /onboarding 으로 감.
--
--   2026-08-30 결정: 진짜 커플 = jasonhyun03@gmail.com(진식) + celinaleem@gmail.com(지민).
--   당시 JINJIM-0628 에 7명이 붙어 있었고(유출 버그), 아래 5명 분리:
--     jiminbabo / jinsikbabo / babojimin(지밍) / jinguri(징구리) / minguri(밍구리)
update public.profiles
set couple_id = null
where couple_id = (select id from public.couples where invite_code = 'JINJIM-0628')
  and id not in (
    'ce5ea75a-937d-47a1-8dd9-dee3c635aa0f',  -- 진식  jasonhyun03@gmail.com
    '279411ba-2642-451a-ac93-57625f54e2d5'   -- 지민  celinaleem@gmail.com
  );


-- STEP 3 ─ 그 계정이 잘못 편입돼 있는 동안 등록한 데이터가 진식지민 커플에
--          섞였는지 점검. (insert 트리거가 couple_id 를 JINJIM-0628 로 찍었을 수 있음)
--          STEP 2 를 먼저 실행한 뒤 돌려야 정확하다.
--          = "현재 커플 구성원 이름이 아닌 added_by/author" 를 가진 행.

-- 3-a) 장소
select id, name, category, added_by, status, created_at
from public.places
where couple_id = (select id from public.couples where invite_code = 'JINJIM-0628')
  and coalesce(added_by, '') <> ''
  and added_by not in (
    select display_name from public.profiles
    where couple_id = (select id from public.couples where invite_code = 'JINJIM-0628')
      and display_name is not null
  )
order by created_at desc;

-- 3-b) 추억
select id, place_id, left(coalesce(content, ''), 50) as content_preview, author, created_at
from public.memories
where couple_id = (select id from public.couples where invite_code = 'JINJIM-0628')
  and coalesce(author, '') <> ''
  and author not in (
    select display_name from public.profiles
    where couple_id = (select id from public.couples where invite_code = 'JINJIM-0628')
      and display_name is not null
  )
order by created_at desc;

-- 3-c) 대댓글
select id, memory_id, left(coalesce(content, ''), 50) as content_preview, author, created_at
from public.memory_replies
where couple_id = (select id from public.couples where invite_code = 'JINJIM-0628')
  and coalesce(author, '') <> ''
  and author not in (
    select display_name from public.profiles
    where couple_id = (select id from public.couples where invite_code = 'JINJIM-0628')
      and display_name is not null
  )
order by created_at desc;

-- 검토 후 삭제가 필요하면 (id 를 직접 지정):
-- delete from public.memory_replies where id in (...);
-- delete from public.memories       where id in (...);
-- delete from public.places         where id in (...);


-- STEP 4 ─ 다시 STEP 1 을 실행해서 JINJIM-0628 에 진식·지민만 남았는지 확인.
