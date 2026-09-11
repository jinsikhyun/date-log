# UX 개선 2차: AI 로딩 단계·타임아웃·재시도 · 데이터 사용 안내 · 추천 카드 근거 (2026-09-11, 로컬 반영 — commit/push 안 함)

> HANDOFF.md 는 로컬 dismiss 작업이 수정 중이라 별도 파일. 병합 시 HANDOFF.md 최상단으로 옮길 것.
> 1차(집계 기준·접근성·지도 문구)는 `docs/handoff-2026-09-11-ux-counts-a11y.md`.

UX 리뷰 2·3·5번. §6단계 "관심 없어요"(dismiss) 로컬 작업 **위에** 얹었다 — 작업 시점의 로컬 파일을 스냅샷해 그 위에서 수정했고, 적용 전 mtime 이 동일함을 확인했다.
"좋아요/별로예요"는 dismiss 가 "별로예요"를 이미 담당하므로 **추가하지 않았다**(리뷰 피드백 단계에서 보류 합의).

## 공통 모듈 (신규)

| 파일 | 역할 |
| --- | --- |
| `src/lib/aiRecommendClient.ts` | 장소 상세·코스 공용. `AiLoadStage`(`idle → candidates → ranking`), 단계별 타임아웃 `AI_TIMEOUT_MS`(후보 12s / 선별 25s), `postAiStage()`(AbortController 타임아웃 + 오류 분류 `AiRecommendError{kind,stage,status}`), `describeAiError()`(오류 → 사용자 문구 + 재시도 가능 여부), `AI_DATA_NOTICE`(데이터 사용 안내 문구), `kakaoCategoryDetail()`, `ORIGIN_LABEL`. |
| `src/components/AiRecommendationStatus.tsx` | `AiLoadingSteps`(2단계 진행 표시, `role=status aria-live=polite aria-busy`), `AiErrorNotice`(`role=alert` + "다시 시도"), `AiDataNotice`. `compact` 변형은 코스 리스트용. |
| `scripts/ai-recommend-client.test.mjs` | 7개 — 카카오 분류 축약, 단계별 타임아웃 문구 분리, 5xx 원문 비노출, 4xx 서버 문구 보존/권한 오류 재시도 불가, 타임아웃 범위. |

## 2. AI 로딩 경험

**진단**: 재시도 버튼("다시 추천받기")은 있었지만 `visible.length > 0` 안에 있어서 **성공했을 때만** 보였다 — 실패·빈 결과에서만 없었다. 로딩은 카카오→OpenAI 두 fetch 가 한 불리언에 묶여 15초 넘게 같은 문구. 타임아웃 없음. 오류는 서버 `error` 원문 그대로.

| 파일 | 변경 |
| --- | --- |
| `AiRecommendationSection.tsx` | `loading` → `stage` 상태(+파생 `loading`). 두 fetch 를 `postAiStage("candidates"/"ranking")` 로. 추천 요청 실패는 `loadError: AiErrorView`(재시도 버튼 포함), 카드 액션 실패(위시 추가·숨김)는 기존 `error` 문자열 — 성격이 달라 분리. 빈 결과에도 "다시 찾아보기". 좌표 없음은 재시도 불가 + 힌트. |
| `CourseForm.tsx` | 동일. `aiVersion` 가드는 `resolveCoord` 뒤에도 추가(이전엔 좌표 해석 중 입력이 바뀌면 옛 요청이 진행됨). `aiInputKey` 효과에서 `aiStage`/`aiLoadError` 초기화. |

오류 분류 규칙(`describeAiError`): 타임아웃은 단계별 문구("주변 장소를 찾는 데…" / "추천을 고르는 데…"), 네트워크, 429 는 서버 힌트 보존, 401/403 은 서버 문구 그대로 + 재시도 숨김, **5xx 는 서버 원문을 절대 노출하지 않고** "○○에 잠시 문제가 있어요", 4xx 는 이미 사용자용 한국어라 그대로.

## 3. 데이터 사용 안내

토글 헤더 부제 `우리의 취향을 담은 추천 · GPT-5.6 Luna` → **`이 장소 정보와 우리 기록에서 고른 추억 일부를 바탕으로 추천해요`** (장소 상세·코스 양쪽). 펼친 영역 하단에 각주(`AiDataNotice`):

> 추천을 만들 때 이 장소의 이름·카테고리·주소와, 우리 기록에서 고른 장소 정보(이름·카테고리·별점·태그)와 추억 한줄평 발췌(최대 10곳, 각 80자)가 OpenAI(GPT-5.6 Luna)로 전송돼요. 두 사람의 이름, 사진, 추억 전문은 보내지 않아요.

이 문구는 `api/ai-recommend/route.ts` 의 `userPayload` 와 `tasteProfile.ts` 의 `QUOTE_BUDGET_TOTAL=10 / QUOTE_MAX_CHARS=80`, 그리고 member_1/2 치환을 **그대로 옮긴 것**이다. 정책이 바뀌면 `AI_DATA_NOTICE` 도 같이 바꿔야 한다(주석으로 명시).

## 5. 추천 카드 근거

**진단**: API 는 `alreadyOnWishlist`/`wishPlaceId` 를 이미 돌려주고 있었는데 장소 상세 `toCardPlace()` 가 버렸다. 카카오 원본 분류(`categoryName`)는 AI 프롬프트에만 넣고 응답에서 뺐다.

| 파일 | 변경 |
| --- | --- |
| `api/ai-recommend/route.ts` | 응답에 `kakaoCategoryName: c.categoryName ?? null` 추가(스키마엔 이미 optional 로 있었음). |
| `AiRecommendationCard.tsx` | `origin?: "wishlist" \| "new"`, `kakaoCategoryName?` prop. 이미지 영역 좌하단에 "♡ 우리 위시리스트" / "✦ 새로 발견" 배지. 주소 아래 "카카오 분류 · 일본식라면"(대분류·우리 카테고리와 겹치는 조각은 숨김). 위시 후보면 위시 추가 버튼 비활성 + "위시에 있어요". |
| `AiRecommendationSection.tsx` | `toCardPlace` 가 `origin`/`kakaoCategoryName` 전달. |
| `CourseForm.tsx` | 리스트 항목에 "♡ 위시리스트" / "✦ 새로 발견" 배지(이전엔 위시만 표시), 카카오 분류 줄. **추가 버튼 라벨 분기**: `+ 위시에서 담기` / `+ 새 장소로 담기` + 아래 "이 코스에만 저장돼요", `title` 로 저장 범위 설명. 로직(`addAiCandidate` 의 insert 생략 분기)은 이미 있었고 라벨만 없었다. |

## 검증

- 클라우드 복제본: `tsc --noEmit` 0, `eslint` 0 errors(기존 warning 3), `node --test` **48 통과**(41 + 7), `next build --webpack` 통과(폰트 모킹·더미 env).
- Mac 작업 트리(적용 후): `tsc` 0, 단위테스트 48 통과.

## 미검증

- 브라우저에서 단계 전환이 실제로 보이는지, 타임아웃 25초에 "다시 시도"가 뜨는지, 스크린리더가 단계를 읽는지.
- 배지: 코스 모드에서 위시 후보가 실제로 "♡" 로 뜨는지(§5단계 브라우저 검증에선 위시 배지만 확인됨). 장소 상세 모드는 위시 후보를 주입하지 않으므로 전부 "✦ 새로 발견"이 정상.
- `next build` (Turbopack) — 샌드박스 폰트 차단으로 webpack 만 확인.
- commit/push 없음. HANDOFF.md 미수정(충돌 회피).
