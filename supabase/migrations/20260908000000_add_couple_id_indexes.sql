-- AI 추천 고도화(4단계: buildTasteProfile) 연결 작업 중 발견한 조회 부담 이슈.
-- src/app/api/ai-recommend/route.ts 가 매 요청마다 places/memories 를 couple_id 로
-- 필터링해 조회하는데(kakao-candidates/route.ts 의 기존 places 조회도 동일), 두 테이블
-- 모두 couple_id 에 인덱스가 없다 — schema.sql/기존 migrations 전체를 확인했다.
-- 인덱스가 없으면 이 필터는 "그 커플의 행 수"가 아니라 "테이블 전체 행 수"에 비례해
-- 느려진다(순차 스캔). 지금 데이터량(커플 수·장소 수 적음)에서는 체감 차이가 거의
-- 없지만, 사용자·기록이 늘어날수록 모든 커플의 모든 조회가 함께 느려지는 구조라 미리
-- 잡아두는 게 안전하다. 정렬에 쓰는 컬럼(created_at/date)을 복합 인덱스에 포함해
-- "최근순 정렬 + LIMIT" 패턴도 함께 커버했다.
--
-- 이 파일은 작성만 했고 실행하지 않았다 — 사용자 승인 후 별도로 적용할 것.
-- 인덱스 생성 자체는 기존 쿼리 결과를 바꾸지 않는 안전한 추가 작업이다(순수 조회 성능).
--
-- 롤백: drop index if exists public.places_couple_id_created_at_idx;
--       drop index if exists public.memories_couple_id_idx;

create index if not exists places_couple_id_created_at_idx
  on public.places (couple_id, created_at desc);

create index if not exists memories_couple_id_idx
  on public.memories (couple_id, date desc, created_at desc);
