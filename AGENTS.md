<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## date.log 작업 인수 기준

- 시작 시 `HANDOFF.md`를 읽고 현재 코드와 대조한다. 과거 Claude 메모를 현재 운영 상태로 단정하지 않는다.
- 사용자 확정 의도: pick은 본인만 수정하며 상대방 pick은 읽기 전용. 단골은 공동 스위치로, 둘 중 누구나 설정/해제 가능. UI 제한만으로 DB 권한 문제가 해결됐다고 보고하지 않는다.
- 운영 SQL 실행, 실제 데이터 생성/변경, commit/push/배포는 별도 사용자 확인 후 수행한다. 과거 채팅의 토큰은 재사용하지 않는다.
- `fix-couple-leak*.sql`은 특정 사고 복구용이다. 일괄 마이그레이션이나 신규 설치 과정에 포함하지 않는다.
- 작업 후 검증 결과와 미검증 사항을 `HANDOFF.md`에 갱신한다. 비밀정보와 개인 데이터는 문서에 넣지 않는다.

## 실브라우저 QA 계정 규칙

2026-09-11 Google 사진 QA 가 **다른 커플의 실제 장소**에 테스트 사진을 올리고 `google_place_id` 까지
쓴 사고가 있었다. 원인은 RLS 가 아니라, 브라우저가 이틀 전 로그인한 다른 계정의 세션을 그대로
들고 있었던 것이다(`@supabase/ssr` 세션은 `path=/` 쿠키라 브라우저 프로필 하나에 세션도 하나).
같은 실수를 반복하지 않기 위해 다음을 지킨다.

- QA 는 **전용 테스트 계정 + 전용 브라우저 프로필**에서만 한다. 에이전트와 사람이 같은 브라우저를
  공유하지 않는다. 공유가 불가피하면 QA 시작 전에 로그아웃 후 다시 로그인한다.
- **쓰기 동작(사진 업로드·수정·삭제·저장) 전에 반드시 `/settings` 로 로그인 계정과 커플을 먼저
  확인하고, 확인한 값(계정·couple_id)을 작업 기록에 남긴다.** 확인 없이 쓰면 안 된다.
- 실브라우저 QA 대상 장소 id 는 고르기 전에 그 장소가 **내 커플 소유인지** 확인한다.
- QA 로 만든 데이터(장소·추억·사진·코스)는 같은 세션 안에서 원복한다. 사진은 `image_url` 을
  비우는 것만으로는 부족하다 — Storage 객체까지 지워야 한다(Storage API 또는 대시보드.
  `storage.objects` 직접 DELETE 는 트리거가 막고, 뚫으면 실제 파일이 고아로 남는다).
- 관측한 이상 현상은 추측으로 닫지 말고 소유 커플·`owner`·로그인 시각으로 역추적해 확정한다.
