-- ─────────────────────────────────────────────────────────────
-- Google Places 자동 대표사진 (GOOGLE_PLACES_PHOTO_FEATURE_HANDOFF.md)
--
-- places.google_place_id 컬럼 1개만 추가한다. Google 정책상(policies 문서 직접 확인)
-- place_id는 캐싱 제한의 명시적 예외라 장기 저장이 허용된다. 그 외 Google 데이터
-- (사진 리소스 이름, 사진 URL, attribution, 이미지 바이트)는 절대 저장하지 않고
-- 화면에 표시할 때마다 서버(/api/place-google-photo)가 새로 조회한다.
--
-- 이 컬럼은 캐시 최적화용이다 — 없어도 기능은 동작한다(매번 Text Search로 재매칭할 뿐).
-- 값이 있으면 재매칭 단계(Text Search)를 건너뛰고 바로 Place Details를 호출해 호출량을 줄인다.
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. (여러 번 실행해도 안전)
-- 이 파일은 작성만 했고 실행하지 않았다 — 사용자 승인 후 별도로 적용할 것.
--
-- 롤백: alter table public.places drop column if exists google_place_id;
-- ─────────────────────────────────────────────────────────────

alter table public.places
  add column if not exists google_place_id text;

comment on column public.places.google_place_id is
  'Google Places API (New) place id. 재매칭을 건너뛰기 위한 캐시 값일 뿐 — 사진·리뷰 등 다른 Google 데이터는 저장하지 않고 표시 시점마다 재조회한다.';

-- 별도 RLS 정책 불필요: 기존 places 테이블의 커플 스코프 RLS(select/update)가 이 컬럼에도
-- 그대로 적용된다(add-couple-rls.sql).
