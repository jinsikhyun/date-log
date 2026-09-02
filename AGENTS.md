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
