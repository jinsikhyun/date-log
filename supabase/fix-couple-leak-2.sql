-- ═══════════════════════════════════════════════════════════════
-- 커플 유출 복구 2차 — 파트너 배지가 "지민 → 지민" 으로 뜨는 문제
--
-- 원인: JINJIM-0628 커플에 진짜 두 명(jasonhyun03=진식 / celinaleem=지민) 외에
--       옛 테스트 프로필(특히 가장 먼저 만들어진 jiminbabo=지민)이 아직 남아 있음.
--       Header 는 "created_at 순 첫 번째 중 내가 아닌 사람"을 파트너로 고르므로
--       celinaleem 로그인 시 jiminbabo(지민)가 파트너로 잡힌다.
--
-- 조치: SQL Editor 에서 STEP 순서대로. (fix-couple-leak.sql 의 후속)
-- ═══════════════════════════════════════════════════════════════

-- STEP A ─ 현재 JINJIM-0628 멤버 (email NULL = auth 계정 없는 고아 프로필)
select p.id, p.display_name, p.created_at, u.email,
       (u.id is null) as orphan
from public.profiles p
left join auth.users u on u.id = p.id
where p.couple_id = (select id from public.couples where invite_code = 'JINJIM-0628')
order by p.created_at;


-- STEP B ─ 진짜 커플 두 명만 남기고 나머지 프로필 분리(couple_id = null)
update public.profiles
set couple_id = null
where couple_id = (select id from public.couples where invite_code = 'JINJIM-0628')
  and id not in (
    'ce5ea75a-937d-47a1-8dd9-dee3c635aa0f',  -- 진식  jasonhyun03@gmail.com
    '279411ba-2642-451a-ac93-57625f54e2d5'   -- 지민  celinaleem@gmail.com
  );


-- STEP C ─ auth 계정이 삭제됐는데 profiles 행만 남은 고아 프로필 정리
delete from public.profiles p
where not exists (select 1 from auth.users u where u.id = p.id);


-- STEP D ─ 재확인: 정확히 2줄(진식 jasonhyun03 / 지민 celinaleem)만 나와야 정상
select p.id, p.display_name, p.created_at, u.email
from public.profiles p
join auth.users u on u.id = p.id
where p.couple_id = (select id from public.couples where invite_code = 'JINJIM-0628')
order by p.created_at;
