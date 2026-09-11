# UX 개선 1차: 집계 기준 통일 · 추억 카드 접근성 · 색 대비 · 지도 버튼 문구 (2026-09-11, 브랜치 `ux/counts-a11y-labels`)

> HANDOFF.md 는 같은 시점에 로컬에서 "관심 없어요(dismiss)" 작업이 수정 중이라 충돌을 피하려고 별도 파일로 둔다. 병합 시 이 내용을 HANDOFF.md 최상단으로 옮길 것.

UX 리뷰(2026-09-09) 6개 항목 중 로컬 dismiss 작업과 파일이 겹치지 않는 1·4·6번. 겹치는 2·3·5번(AI 로딩/개인정보 안내/추천 카드 근거)은 dismiss 커밋 후 그 위에서 진행.

## 1. "가고 싶은 곳" 숫자 불일치 (사이드바 4 · 위시 4 · 기록 7)

**원인은 `via_course` 하나가 아니라 "코스 전용"의 저장 형태가 두 가지인 것.**

| 시기 | 저장 형태 | 만든 SQL |
| --- | --- | --- |
| 초기 | `status='wishlist' AND via_course=true` | `add-via-course-flag.sql` |
| 현재 | `status='course_only' AND via_course=true` | `add-course-only-places.sql` |

사이드바/위시리스트는 `via_course=false` 만, 기록 화면은 `status!='course_only'` 만 걸러서 레거시 행 3건이 기록 화면에서만 "가고 싶은 곳"으로 잡혔다.

**확정한 정의** (`src/lib/placeScope.ts`, 이 파일만 진실):

- 코스 전용 = `status='course_only' OR via_course=true` → 위시/홈/기록/주변 추천 어디에도 안 나온다
- 가고 싶은 곳 = `status='wishlist'` AND 코스 전용 아님
- 다녀온 곳 = `status='visited'` AND 코스 전용 아님

| 파일 | 변경 |
| --- | --- |
| `src/lib/placeScope.ts` (신규) | 클라이언트 predicate `isCourseOnlyPlace / isWishlistPlace / isVisitedPlace` + Supabase 빌더용 `excludeCourseOnly / wishlistScope / visitedScope` + 카운트 갱신 이벤트 `notifyDataChanged()`. 제네릭에 제약을 걸면 count/head 오버로드 빌더에서 TS2589 가 나서 내부 단언으로 처리. |
| `Header.tsx` | 4개 카운트 쿼리를 scope 함수로. `datelog:data-changed` 이벤트를 듣고 즉시 재집계(이전엔 라우트 이동 때만 갱신돼 같은 화면에서 위시 추가·전환 시 숫자가 안 바뀜). |
| `WishlistView.tsx` | 목록 쿼리를 `wishlistScope` 로. "다녀왔어요" 전환·추가 후 `notifyDataChanged()`. |
| `HomeView.tsx` | 목록 쿼리를 `visitedScope` 로(이전엔 via_course 미필터). 장소 추가 2곳에 `notifyDataChanged()`. |
| `RecapDashboard.tsx` | 쿼리 `excludeCourseOnly`, 집계 `isVisitedPlace/isWishlistPlace`. **"사진 N장" → "추억 사진 N장"**: 이전엔 장소 대표 사진 + 추억 사진을 합산해 사용자가 기대하는 "추억에 올린 사진 수"보다 컸다. 이제 추억 사진만 센다. |
| `NearbySimilar.tsx` | `neq course_only` → `excludeCourseOnly` (레거시 코스 전용도 주변 추천에서 제외). |
| `PlaceDetail.tsx` | 추억 추가/삭제, 장소 삭제 후 `notifyDataChanged()`. |
| `supabase/migrations/20260911010000_normalize_legacy_course_only_places.sql` | 레거시 행을 `status='course_only'` 로 정규화(멱등). **운영 실행은 사용자 확인 후.** 앱 코드는 실행 전에도 두 형태를 모두 처리하므로 순서 무관. |

## 4. 추억 카드 링크/버튼 구조 + 색 대비

- `MemoriesFeed.tsx`: 카드 전체를 감싸던 `<Link>` 제거. `<a>` 안에 사진 버튼·반응 버튼이 들어가는 무효 HTML 이었고 키보드/스크린리더에 "카드 = 링크 하나"로 읽혔다. 링크는 **장소명(카테고리 배지 + 이름 + →)** 하나에만 두고 `aria-label="{장소명} 장소 상세 보기"`, `focus-visible` 링 추가. 카드는 `<figure>` → `<article>`. 카드 hover 그림자(링크 hover 의존)는 제거.
- `globals.css` 팔레트 (배경 `paper #f6eee1`, `sidebar #f0e8da`, `card #fff` 기준 대비):

| 토큰 | 이전 | 이후 | paper | sidebar | card |
| --- | --- | --- | --- | --- | --- |
| `--muted-2` (보조 설명, 11~12px 다수) | `#7c766c` (3.9:1) | `#6d675e` | 4.9:1 | 4.6:1 | 5.6:1 |
| `--muted-3` (날짜, 최약 텍스트) | `#a79e90` (2.3:1) | `#827a6d` | 3.7:1 | 3.5:1 | 4.2:1 |

  `--muted-2` 는 AA(4.5:1) 통과, `--muted-3` 는 위계상 가장 옅게 유지하되 3:1 이상. `mapBadge.ts` 의 하드코딩 `#7c766c` 도 같이 교체. `shareCardStyle.ts` 의 `#7c766c` 는 공유 이미지 전용 팔레트라 그대로 둠.

## 6. 지도 버튼 문구

`PlaceDetail.tsx`: `Naver Map / Kakao Map / Google Map` → `네이버에서 보기 / 카카오에서 보기 / 구글에서 보기`. `DirectionsButton.tsx`·`CourseDetail.tsx` 의 `길찾기` → `카카오 길찾기` (어느 서비스로 가는지 같은 규칙으로 드러냄).

## 검증

- `tsc --noEmit` 통과, `eslint` 0 errors (기존 warning 3건 그대로).
- `next build --webpack` 통과 — 샌드박스에서 `fonts.googleapis.com` 이 막혀 `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` 로 폰트만 모킹, Supabase env 는 더미. Turbopack 빌드는 폰트 모킹이 안 먹어 미확인(코드와 무관한 환경 제약).
- 대비값은 WCAG 상대휘도 공식으로 직접 계산.

## 미검증

- 실제 브라우저에서 사이드바 숫자 4/4/4 일치 확인 — 운영 데이터로 재현 필요.
- `notifyDataChanged()` 가 코스 저장(CourseForm)에는 안 붙어 있음 — dismiss 작업과 파일이 겹쳐 뒤로 미룸. 코스 저장은 라우트 이동을 동반해 실사용 영향은 없음.
- 정규화 SQL 은 운영 미실행.
