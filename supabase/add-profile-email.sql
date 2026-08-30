-- ─────────────────────────────────────────────────────────────
-- profiles 에 email 컬럼 추가 + 기존 행 채우기 (설정 페이지의 "파트너 계정" 표시용).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. (여러 번 실행해도 안전)
-- ─────────────────────────────────────────────────────────────

alter table public.profiles add column if not exists email text;

-- 기존 프로필(진식/지민 등)의 이메일을 auth.users 에서 채운다
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and (p.email is null or p.email = '');

-- 확인용:
-- select id, display_name, email, couple_id from public.profiles order by created_at;
