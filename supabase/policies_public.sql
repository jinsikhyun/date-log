-- ═════════════════════════════════════════════════════════════
-- 폐기된 스크립트 — 실행 불가
--
-- 이 파일은 프로토타입 시절 places/memories 를 비로그인(anon)에게까지 열어주던
-- 공개 읽기·추가 정책을 설치했다. 실사용자 커플이 생긴 지금 이 SQL 은 단 한 줄도
-- 운영에 들어가면 안 된다. PostgreSQL 은 PERMISSIVE 정책을 OR 로 합치므로,
-- 이런 정책이 하나만 다시 생겨도 커플 격리가 통째로 무효가 된다.
--
-- 그래서 내용을 남겨두지 않는다 — 파일을 통째로 실행하든, 일부만 잘라
-- 붙여넣든 위험한 SQL 자체가 없어야 하기 때문이다.
-- 예전 내용이 필요하면 git 이력에서 확인한다:
--     git log --follow -p -- supabase/policies_public.sql
--
-- 현재 정책의 근거 파일:
--   supabase/add-couple-rls.sql            — 커플 스코프 RLS
--   supabase/security/01_prepare_membership.sql
--   supabase/security/02_enforce_membership.sql
--   supabase/security/test-couple-isolation.mjs  — 격리 회귀 테스트
-- ═════════════════════════════════════════════════════════════

do $$ begin
  raise exception '폐기된 스크립트입니다 — supabase/policies_public.sql 는 실행할 수 없습니다. 커플 격리를 되돌리는 내용이었고, 현재 정책은 add-couple-rls.sql 과 security/01·02 가 담당합니다. (legacy script removed)';
end $$;
