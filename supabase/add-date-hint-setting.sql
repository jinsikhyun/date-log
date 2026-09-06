-- 데이트 힌트 팝업 개인 설정(ON/OFF).
-- 커플 공유(couples)가 아니라 개인 preference라 profiles에 저장한다.
-- 기존 profiles RLS(본인 행만 update)로 이미 격리되어 있어 별도 정책 불필요.
--
-- 실행은 사용자가 직접 한다 — 이 파일은 작성만, 여기서 실행하지 않는다.

alter table public.profiles
  add column if not exists date_hint_enabled boolean not null default true;

comment on column public.profiles.date_hint_enabled is
  '데이트 힌트 팝업 수신 여부(개인 설정). 커플 한 명이 꺼도 상대방에는 영향 없음.';
