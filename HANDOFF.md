# date.log — 인수인계 (Codex 이전용)

## 현재 기준 상태 — Claude Code는 이 항목부터 확인 (2026-09-06)

- **신규: 공유 카드 개편 — 장소+코스 모두 완료 (로컬 완료 — commit/push 전, 사용자 확인 대기)**. 아래 "장소·코스 공유 카드 개편" 항목 참고. `date.log_공유기능개선.md` 스펙 기반, 비율 선택(4:5/9:16/1:1) → 전체화면 미리보기 → 저장/공유 흐름을 장소·코스 양쪽에 구현했다. `ShareRatioModal`/`SharePreviewModal`을 `renderCard` 콜백을 받는 범용 컴포넌트로 리팩터해 두 카드가 공유한다. 기존 `ShareCard.tsx`/`CourseShareCard.tsx`는 `ShareCaptureQA.tsx`(dev QA 하네스) 전용으로만 남음.
- Git: `main`/`origin/main`이 `f36efd2 Add free-text place search and a map-based search-and-add flow`로 일치한다(직전 확인 기준은 `6f3fe2c`). `f36efd2`의 Production 배포·`datelog.kr` 반영 여부는 아직 확인 못함 — Vercel 대시보드 확인 필요.
- **신규: 자유텍스트 검색 + 홈 지도 검색·추가**. 아래 "장소 검색 + 지도 검색·추가 (신규)" 항목 참고. `f36efd2`까지 push 완료, 배포 확인 대기.
- 비공개 사진: `place-photos` private 버킷과 커플 격리 RLS가 운영에 적용되었다고 사용자가 확인했다. 앱은 인증 → `can_access_place_photo` 권한 검사 → Storage 다운로드 순서의 `/api/place-photo` 경로로 표시하며 서비스 키를 사용하지 않는다.
- 썸네일: 허용 너비 160/320/640/960/1280px, 품질 85, contain 변환을 사용한다. 카드에는 640/960 반응형 이미지와 160px 흐림 미리보기를 사용하고, 상세는 1280px, 사진 확대 화면은 원본을 요청한다. Supabase 이미지 변환이 불가능하면 원본으로 안전하게 폴백한다. 브라우저 캐시는 private 1시간 + stale-while-revalidate 1일이다.
- 사진 검증: `tests/private-photos.test.mjs` 7개 통과. 프로덕션 Webpack 빌드도 28개 경로에서 통과했다. 실제 모바일 환경에서는 카드 로딩 속도·화질, 상세 1280px, 확대 원본을 한 번 더 비교할 것.
- **업로드 시점 썸네일 사전 생성 — SQL 운영 적용 완료, 앱 코드 commit·push 완료, Vercel 배포 상태 미확인**: 아래 "사진 로딩 속도 개선 — 업로드 시 썸네일 사전 생성" 항목 참고. `20260905020000_allow_place_photo_thumbnails.sql` 운영 실행 성공을 사용자가 확인했고, 사용자 승인에 따라 커밋 `6f3fe2c`를 `origin/main`에 push했다. 이 세션에 Vercel CLI가 없어 자동 재배포 완료(READY)와 `datelog.kr` 반영 여부는 직접 확인하지 못함 — Vercel 대시보드에서 확인 필요.
- 코스 진입: 다녀온 곳/가고 싶은 곳에서 선택한 장소는 저장된 초안보다 먼저 배치되어 기준 장소가 된다. 코스 페이지는 기준 장소 2km 이내 후보를 거리순으로 먼저 보여주고 나머지는 카테고리 아코디언에 둔다.
- 모바일 UI: 홈·위시·코스의 주요 버튼과 필터 칩이 좁은 화면에서 글자 단위로 두 줄이 되지 않도록 정리되어 배포되었다.
- 보안 주의: private 버킷이나 커플 격리를 해제하지 않는다. 운영 SQL/실데이터 변경/commit/push/배포는 사용자에게 별도 확인받은 뒤 수행한다.
- 작업 트리에는 사용자 소유의 비추적 ZIP/디자인 폴더와 `src/app/.layout.tsx.swp`가 있다. 임의로 삭제하거나 커밋하지 않는다.

### 다음 권장 작업

1. Vercel 배포(`f36efd2`) 완료 및 `datelog.kr` 반영 확인.
2. 실제 기기에서 홈 지도 검색 전체 흐름(검색→마커/카드→추가, 이 근처 둘러보기, panTo/강조) 눈으로 확인.
3. 운영 모바일에서 카드 → 상세 → 확대의 이미지 요청 크기와 체감 속도를 검증한다.
4. `/api/place-photo?...&w=...` 요청이 변환 결과를 반환하는지 확인하고, 폴백 비율이 높으면 서버 로그에 개인정보 없는 진단 신호를 추가한다.
5. 이후 수정은 관련 테스트와 `npm run build -- --webpack`을 통과시킨 뒤 사용자 승인에 따라 커밋·배포한다.

## 장소·코스 공유 카드 개편 (장소+코스 모두 완료, 로컬 완료 — commit/push 전)

- 목적: 사용자가 올린 `date.log_공유기능개선.md` 스펙에 따라 공유 이미지를 Ivory/Archive Teal/Soft Black 기반 새 디자인 시스템 + 비율별(4:5/9:16/1:1) 전용 레이아웃으로 교체. 기존 "버튼→즉시 미리보기" 단일 모달을 "비율 선택→렌더링→전체화면 미리보기" 2단계로 변경. 장소 먼저 구현·검증 후 사용자가 "데이트코스 카드에도 적용해줘"로 확장 요청해 코스까지 완료. 계획 파일: `~/.claude/plans/modular-herding-thimble.md`(장소 phase 기준, 코스 확장은 계획 문서 갱신 없이 동일 패턴으로 바로 구현).
- 확정 사항(사용자 승인): 프레임 번호(장소만) = 첫 방문일 오름차순 방문 순번(`src/lib/shareFrame.ts`의 `getFrameNumber()`, `status='visited'` + `first_visit_date` 있는 곳만 대상, 없으면 자연스럽게 생략). OUR PICK = `place.favorite_by.length > 0`. 코스의 날짜는 생략, 지역은 첫 스탑 주소 기반(`placeRegion()`). 사진은 항상 리사이즈 사본이 아닌 저장된 원본 요청(아래 "사진 화질" 참고, 현재 수준으로 충분하다고 확정).
- 공용 인프라: `src/lib/shareOutputs.ts`(`ShareRatio`/`SHARE_OUTPUTS`), `src/lib/useDialogA11y.ts`(모달 공용 포커스 트랩/Escape/복귀). `src/components/ShareRatioModal.tsx`/`SharePreviewModal.tsx`는 특정 카드 타입에 종속되지 않도록 `renderCard` 콜백을 받는 범용 컴포넌트로 설계돼 있어 장소·코스 버튼이 그대로 재사용한다.
- 장소: `src/lib/shareFrame.ts`, `src/components/PlaceShareCard.tsx`(비율별 레이아웃), `src/components/SharePlaceButton.tsx`(2단계 흐름 오케스트레이션, 외부 시그니처 `<SharePlaceButton place={place} />` 불변이라 `PlaceDetail.tsx` 수정 없음).
- 코스: `src/components/ShareCourseCard.tsx`(`CourseShareStop` 타입 — 기존 `ShareStop`엔 없던 `address` 추가해 첫 스탑 지역 계산에 사용), `src/components/ShareCourseButton.tsx`(내부 전면 교체, 외부 시그니처 `{title, concept, stops, coords}` 유지하되 `stops`에 `address` 추가 필요 — 호출부 `CourseDetail.tsx`에서 `s.places!.address`를 매핑에 추가). 4:5/9:16은 Archive Teal 헤더+Ivory 세로 경로, **1:1은 세로형을 축소한 게 아니라 좌 40%(Teal 브랜드 패널)/우 60%(Ivory 경로 패널) 2열 전용 레이아웃**(스펙 6절 명시 요구사항). 장소 수가 늘면 행 간격을 단계적으로 줄이되 최소값 아래로는 안 내려가게 처리(멀티페이지 분할은 미구현 — 스펙도 "고려" 수준으로만 요구).
- 캡처 파이프라인: `src/lib/shareCapture.ts`의 `captureCard(source, engine, opts?)`에 `opts.pixelRatio`를 추가해, 주어지면 기존 `min(2, sqrt(12e6/(w*h)))` 자동 계산을 건너뛰고 그 값을 그대로 쓴다. 새 카드는 DOM을 목표 크기(1080×1350 등) 그대로 렌더링 후 `pixelRatio:1`로 캡처해 **정확한 픽셀 출력**을 보장한다. 옵션 미지정 시 QA 하네스 경로는 기존 자동 계산 그대로 동작(하위 호환 확인 완료). `src/lib/shareImage.ts`에 `toFilenameSlug()` 추가.
- 검증: `npx tsc --noEmit` / 신규·수정 파일 `eslint` / `npm run build` 모두 통과. 로컬 dev 서버 + Claude in Chrome으로 장소·코스 각각 4:5(1080×1350)/9:16(1080×1920)/1:1(1080×1080) 저장 PNG 픽셀 크기를 `sips`로 직접 검증(전부 정확히 일치). 장소: 사진 있음/없음, OUR PICK 있음/없음, 평점·한줄평 있음/없음, 방문 전 장소(프레임 번호 생략) 확인. 코스: 3스탑 기준 4:5/9:16/1:1 전부 렌더 확인, 1:1의 2열 레이아웃과 좌측 패널 흰색 반전 로고(`brightness(0) invert(1)`) 확인. 모달 닫기 후 트리거 버튼으로 포커스 복귀 확인. `ShareRatioModal`/`SharePreviewModal` 리팩터 후 장소 공유 흐름 회귀 없음 재확인.
- 사진 화질: 공유 카드는 `photoDisplayUrl()`을 폭 파라미터 없이 호출해 `/api/place-photo?path=...`(`&w=` 없음)로 저장된 원본을 그대로 요청한다 — 네트워크 탭으로 직접 확인함. 의도를 코드에 못박기 위해 `src/lib/photoUrls.ts`에 `photoOriginalUrl()`을 추가하고 `PlaceShareCard.tsx`가 이걸 쓰도록 함. 이 앱의 "원본"은 업로드 시 이미 가로 최대 1600px/quality 0.85로 처리된 파일이며(`src/lib/photos.ts`) 진짜 카메라 원본은 어디에도 저장되지 않는다 — 기존 "사진 크게 보기" 뷰어와 동일한 파일. **사용자가 이 수준으로 충분하다고 확인함 — 더 높은 화질의 별도 원본 저장 계획 없음.**
- 미검증: 실제 모바일 기기(iOS Safari/Android Chrome)에서 bottom sheet 레이아웃과 Web Share API 동작, 2줄 초과 매우 긴 이름/주소·코스명의 `-webkit-line-clamp` 캡처 결과, 코스 5곳 이상일 때의 압축 간격 실제 가독성, 키보드만으로의 전체 흐름 조작. 스펙이 요구하는 "작업 완료 보고"는 세션 응답으로 전달했으나 이 문서엔 요약만 남김.
- 범위 밖: `ShareCard.tsx`/`CourseShareCard.tsx`(구) 삭제(아직 `ShareCaptureQA.tsx` 개발용 QA 페이지가 참조 중이라 유지), 카메라 원본 별도 보존, 코스 5곳 이상 멀티페이지 분할. commit/push/배포는 사용자 별도 승인 후 진행.
- **후속 수정 — 글자·로고 크기 및 여백 재조정(완료)**: 첫 버전이 "미리보기 대비 캔버스 안 글자·로고가 너무 작고 중간/하단에 빈 공간이 크다"는 피드백을 받아, 사용자가 준 상세 프롬프트(비율별 정확한 px 범위 지정)에 맞춰 `PlaceShareCard.tsx`의 `layoutFor()`와 `ShareCourseCard.tsx`의 `COURSE_SHARE_TOKENS`(신규)를 전면 재조정했다. 장소: 이름/주소/평점(별)/한줄평/로고를 비율별로 큰 폭 확대(예: 4:5 이름 58→74px, 로고는 `height` 대신 `width` 기준으로 전환). 코스: 헤더를 `grid-template-rows: auto auto auto 1fr auto`로, 장소 목록을 `grid-template-rows: repeat(n, minmax(0,1fr))`로 바꿔 남는 공간을 균등 분배(기존엔 `flex + justifyContent:center`라 중간에 몰려 있었음), 번호 원-연결선-장소명-카테고리-이동정보를 `.course-share-stop` 그리드(레일 컬럼 + 이름/카테고리 1행 + 이동정보 2행)로 통일, 연결선은 첫/마지막 원 중심을 정확히 잇는 절대배치 1개로 교체(원이 위에 얹혀 끊김 없이 이어짐).
  - **버그 발견·수정**: 재조정 중 Header 컴포넌트의 루트 div에 `height:"100%"`가 없어서 내부 `1fr` spacer 행이 0으로 접혀 Teal 헤더가 자기 몫(headerH)을 다 못 채우고 그 아래 여백이 흰색(캔버스 배경색)으로 노출되는 버그를 발견해 수정함(`height:"100%"` 추가). 캡처 후 실제 PNG를 열어 픽셀 단위로 확인하지 않았다면 놓쳤을 종류의 버그 — 이후 유사 grid/flex 혼합 레이아웃 작업 시 자식이 부모의 fixed size를 상속받는지 항상 실제 캡처본으로 확인할 것.
  - 경로 모티프(장식용 SVG)도 사용자 요청으로 비율별 `motifW` 토큰화(높이는 항상 `motifW/2`로 계산해 SVG 원본 2:1 비율 유지 — 폭만 바뀌어도 찌그러지지 않음).
  - 검증: 장소·코스 각 3비율 재캡처 후 `sips`로 픽셀 크기 재확인(전부 정확), 실제 PNG를 열어 흰 여백/잘림/찌그러짐 없는지 육안 확인 완료.
- **후속 수정 — 장소 카드 캡처 시 요소 겹침 버그(완료)**: 사용자가 "장소 카드 캡쳐에서 요소들끼리 겹치는 문제"를 보고. 원인: `PlaceShareCard.tsx`의 `clamp2()`(이름/주소/한줄평에 쓰는 2줄 말줄임 헬퍼)가 `-webkit-line-clamp:2` + `lineHeight`만 지정하고 `height`는 지정하지 않아, 실제 렌더된 줄 수가 예상보다 적게 잡히는 경우(특히 `overflowWrap:anywhere`와 공백 없는 긴 텍스트가 겹칠 때) 박스가 2줄 몫보다 짧게 접혀버렸다 — 그 결과 바로 다음 요소(주소/평점 등)의 `marginTop`이 그 짧아진 박스 기준으로 계산되면서 시각적으로 겹쳐 보였다. **재현**: `src/components/ShareCaptureQA.tsx`의 기존 `basePlace` fixture(공백 없는 45자 이름 + 3줄 설명)로 재현 확인 — 재현/회귀 방지용으로 이 QA 페이지(`/auth/share-qa`, dev 전용)에 `PlaceShareCard`/`ShareCourseCard` 비율별 스트레스 테스트 섹션을 새로 추가해 남겨둠(스케일 0.35로 3비율 동시 렌더).
  - **수정**: `clamp2()`에 `height: lineHeight * 2`를 명시해 실제 줄 수와 무관하게 항상 2줄 몫의 높이를 고정 확보하도록 함. 같은 클래스의 버그가 `ShareCourseCard.tsx`의 헤더 제목/소개(`WebkitLineClamp:2`)와 1:1 좌측 패널 제목/소개(`WebkitLineClamp:3`)에도 있어 동일하게 `height` 고정을 추가.
  - **부가 발견**: 코스 카드가 12스탑처럼 극단적으로 많을 때 `StopRow`(번호 원+이름+카테고리+이동정보 그리드)에 `overflow` 지정이 없어 콘텐츠가 배정된 1fr 행 높이를 넘으면 위/아래 이웃 행으로 흘러넘쳐 겹치는 것도 발견 — `StopRow` 루트에 `overflow:"hidden"`을 추가해 겹침 대신 안전하게 잘리도록 방어(스펙이 이미 "5곳 이상은 여러 장 분할을 고려"라고 명시했고 멀티페이지는 범위 밖이라, 겹침만 없애는 선에서 처리 — 5곳 이상 코스의 실제 가독성은 여전히 미검증).
  - 검증: 스트레스 fixture로 장소(4:5/9:16/1:1)·코스(12스탑, 4:5/9:16/1:1) 전부 겹침 사라짐을 육안 확인. 실제 DB 데이터(정상 길이 텍스트)로도 재캡처해 회귀 없음 확인(`sips`로 1080×1350 재확인). `tsc`/`eslint`/`build` 통과.
- **후속 수정 — 별점(★) 폰트 폭 문제(완료, 사용자가 코드 제공)**: 위 겹침 버그와 별개로, 평점 별표가 유니코드 "★"/"☆" 텍스트라 폰트마다 글리프 폭이 달라 캡처 엔진이 폭을 오계산해 옆 숫자("5.0 / 5.0")와 겹칠 수 있는 문제. 사용자가 직접 수정 코드를 제공: 신규 `src/components/ShareStars.tsx`(별을 SVG path로 직접 그려 폰트 의존성 제거, 컨테이너 폭을 `size*5+gap*4`로 명시). `PlaceShareCard.tsx`의 별점 행을 `ShareStars` + `marginLeft`(flex gap 대신 — 캡처 엔진이 flex gap을 무시할 수 있어서) 조합으로 교체, `lineHeight`를 별 높이와 동일한 절대값으로 맞춰 baseline 어긋남 방지. 사진 없을 때의 카테고리 이모지 placeholder도 같은 이유로 명시적 `width/height:140px` 래퍼로 교체(기존엔 `fontSize`/`lineHeight:"1"`만 있어 이모지 글리프 폭도 같은 위험이 있었음). 기존 텍스트 기반 `stars()` 헬퍼는 제거.
  - 검증: `/auth/share-qa` 스트레스 fixture(회전율 3비율)와 실제 DB 데이터(평점 5.0 장소) 양쪽으로 캡처 → 별 5개가 고정폭으로 나란히 렌더되고 숫자와 겹치지 않음을 육안 확인. 저장 PNG 1080×1350 픽셀 크기 재확인. `tsc`/`eslint`/`build` 통과.
  - **참고(버그 아님)**: 이 세션에서 로컬 dev 서버를 매우 오래 띄워둔 채(수 시간 동안 반복 HMR) 캡처를 여러 번 반복하다 보니, 캡처 자체가 15~25초까지 느려지고 간헐적으로 30초 타임아웃("이미지 생성이 오래 걸려 중단했어요")이 발생하는 걸 목격함 — 재시도하면 매번 성공했고 결과물도 정상이라 코드 결함이 아니라 dev 서버/브라우저 탭이 오래 열려 누적된 세션 성능 저하로 보임(황재벌 테스트에서 새 코드 적용 전에도 이미 한 번 발생). 운영 배포 환경(매 요청 새 프로세스)에서는 재현되지 않을 가능성이 높지만, 배포 후 실제 캡처 소요 시간을 한 번 확인해볼 가치는 있음.
- **후속 수정 — 장소 카드가 "확정 D안"과 다른 디자인(pill 카테고리, 별점)으로 보이는 문제(완료)**: 사용자가 "구형 템플릿과 신형 footer가 섞여 렌더링된다"며 렌더링 경로 자체를 의심하는 상세 진단 요청을 보냄. **먼저 렌더링 경로를 fork 서브에이전트로 grep 검증**: `SharePlaceButton.tsx`→`ShareRatioModal`/`SharePreviewModal`(둘 다 `renderCard` 콜백만 받는 범용 컴포넌트, 내부에 하드코딩된 카드 없음)→오직 `PlaceShareCard`만 렌더링. `PlaceShareCard`는 `SharePlaceButton.tsx`와 dev 전용 `ShareCaptureQA.tsx` 외 어디서도 import 안 됨, 동일/유사 이름의 중복 파일도 없음, 구형 `ShareCard.tsx`는 `ShareCaptureQA.tsx`에서만 참조됨(실서비스 경로 아님) — **legacy 컴포넌트 혼용이나 잘못된 import 경로는 없었다.** 실제 원인은 `PlaceShareCard.tsx` 자신의 스타일링이 스펙 참고 이미지(카테고리 mono label + 숫자 평점 위주)와 다르게(pill 배경 카테고리, 별 아이콘 평점) 구현되어 있던 것 — "잘못된 컴포넌트를 캡처"하는 버그가 아니라 "맞는 컴포넌트를 잘못된 디자인으로 구현"한 것.
  - **수정**: 카테고리를 pill(`catTag().bg` 배경)에서 mono 텍스트 라벨(배경 없음, `catTag().fg` 색상만 유지)로 변경. 평점을 별 아이콘(`ShareStars`)에서 굵은 숫자(`{rating.toFixed(1)}` + `/ 5.0`) 텍스트로 되돌림 — 그 결과 지난 턴에 추가한 `ShareStars` 사용을 제거함(파일 자체는 삭제하지 않고 남겨둠, import만 제거 — 재사용 원하면 알려달라고 안내). 정보 패널에 Teal 톤 hairline 3개(카테고리 아래/주소 아래/footer 위) + footer 아래 마지막 hairline 1개 추가. 상단 메타 바 높이를 비율별 명시 토큰(`headerH`: 4:5=77px, 9:16=94px, 1:1=68px)으로 고정해 사진/정보 패널과 독립적으로 계산되게 함. 진단용으로 루트에 `data-share-card-type="place-v2"`, `data-share-card-ratio={ratio}` 속성 추가(유지해도 무해, 향후 디버깅에 유용).
  - 검증: 4:5/9:16/1:1 전부 실제 캡처 → mono 카테고리 라벨, 숫자 평점, Teal hairline, OUR PICK/SAVED IN footer가 정확히 적용됨을 육안 확인. 저장 PNG 픽셀 크기(1080×1350/1920/1080) 전부 `sips`로 재확인. `tsc`/`eslint`/`build` 통과.
- **총검토 중 발견·수정한 버그 2건(완료)**: 사용자가 "지금까지 추가·개선한 기능 총검토, 로컬 실행 후 버그 있으면 설명"을 요청해 정적 검사(tsc/eslint/build) + 실제 브라우저(장소/코스, 여러 데이터 조합, 키보드 접근성)로 점검. 홈/지도 검색 등 이번 세션 이전에 이미 push된 기능은 회귀 없음만 스모크 확인(별도 수정 없음).
  1. **이름/주소 아래 불필요한 빈 공간(신규 발견·수정)**: 겹침 버그를 고칠 때 넣은 `clamp2()`의 `height: lineHeight*2` 강제가, 정작 실제 데이터 대부분(짧은 이름·주소)에서는 1줄만 차지하는 텍스트 아래에 안 쓰는 한 줄만큼의 빈 공간을 만들고 있었다 — 극단적으로 긴 텍스트 겹침을 막으려던 수정이 흔한 케이스(거의 모든 실제 장소)를 오히려 어색하게 만든 회귀. **수정**: `height` 강제 대신 `minHeight: lineHeight`(완전 붕괴만 방지) + 이 블록만 `overflowWrap`/`wordBreak: "break-word"`로 오버라이드(카드 루트의 `overflowWrap: "anywhere"`가 공백 없는 긴 텍스트와 만나 `-webkit-line-clamp`의 줄 수 계산을 틀어지게 하던 원인 자체를 해결). `/auth/share-qa`의 극단 fixture(공백 없는 45자 이름)로 겹침이 재발하지 않는 것과, 실제 DB의 짧은 이름(예: 모코시야)에서 빈 공간이 사라진 것을 캡처 PNG로 모두 재확인.
  2. **모달 닫을 때 트리거 버튼으로 focus가 복귀하지 않음(신규 발견·수정, 접근성)**: `src/lib/useDialogA11y.ts`가 `open` prop이 `true→false`로 바뀌는 것을 감지하는 `if/else`로 focus 복귀를 구현했는데, `ShareRatioModal`/`SharePreviewModal`은 `open`을 항상 `true`로 고정한 채 조건부 렌더링(mount/unmount)으로 여닫는다 — 언마운트는 effect를 다시 실행하지 않고 cleanup만 호출하므로, `else` 분기가 영원히 실행되지 않아 Escape·취소·닫기 버튼 어디로 닫아도 focus가 `<body>`로 떨어졌다(스펙 12절 "닫으면 원래 공유 버튼으로 focus 복귀" 위반). **수정**: capture 로직을 `useEffect`의 cleanup 함수로 옮겨 컴포넌트가 언마운트되든 `open`이 토글되든 항상 복귀하도록 함. `document.activeElement`/`document.querySelector('[role=dialog]')`를 직접 확인해 Escape 한 번으로 비율 모달이 닫힐 때, 그리고 미리보기 모달(2단계 깊이)에서 Escape로 전체 흐름을 닫을 때 모두 원래 "이미지로 공유" 버튼으로 focus가 정확히 돌아옴을 확인.
  - 그 외 확인: 코스 카드 4스탑(서촌 데이트) 정상 렌더 및 1080×1350 저장 확인. Tab 키로 비율 모달 포커스 트랩이 첫 항목→마지막 항목 이후 첫 항목으로 정확히 순환함을 확인. `canShareImage()`가 true를 반환하는 이 브라우저 환경에서 "공유하기" 버튼이 정상 노출됨(실제 OS 공유 시트를 열면 자동화가 멈출 수 있어 클릭까지는 하지 않음).
  - **미검증으로 남은 것**: 이번 세션의 브라우저 자동화 도구로는 뷰포트를 실제로 좁히지 못해(resize_window 호출이 반영되지 않음) 모바일 bottom sheet 레이아웃은 코드 리뷰(`items-end sm:items-center` 등 Tailwind 클래스 확인)로만 검증했고 시각적으로 확인하지 못함 — 실기기나 다른 도구로 한 번 확인 필요. iOS Safari/Android Chrome 실제 Web Share 완료 흐름도 여전히 미검증.

## 장소 검색 + 지도 검색·추가 (신규, 로컬 완료 + push 완료, 배포 확인 대기)

- **자유텍스트 검색 공용화**: `src/lib/placeSearch.ts`(`matchesQuery`/`matchRank`) — 이름·주소·카테고리·설명·태그 대상 AND(토큰)/OR(필드) 매칭. 검색어가 공백 제외 3자 미만이면 주소·설명·카테고리는 빼고 이름·태그만 본다(도로명 주소 "…로/…길" 접미사로 인한 짧은 검색어 오탐 방지). `matchRank`는 이름 시작(0)>이름 포함(1)>태그(2)>그 외(3) 순 정렬용. 홈·위시리스트 검색창(`PlaceSearchBox`)과 CourseForm의 기존 장소 검색(이름만 하던 것)이 전부 이걸 쓴다.
- **검색 결과 없음 → 빠른 추가**: 홈/위시 모두 "이 이름으로 추가" 진입 시 `AddPlaceForm`이 이름 채운 채로 열리고 카카오 자동완성도 즉시 한 번 실행된다(`AddPlaceForm.tsx`, `blankPlaceInput`).
- **홈 지도 검색(`MapSearchPanel` + `KakaoMap` 확장)**: 검색창은 2자 이상 키워드만 제출되고(`runMapSearch`), "이 지역에서 다시 검색"/"이 근처 둘러보기" 버튼(`searchThisArea`)은 검색어가 있으면 키워드, 없으면 주변 맛집·카페(`searchNearby`)를 부른다 — 후자가 "주변 검색" 기능의 유일한 진입로다. 매칭된 우리 장소(실선)/비매칭(흐림)은 카카오 응답과 무관하게 로컬 `matchesQuery`로 타이핑마다 즉시 갈라지고, 카카오는 새 후보(점선) 찾기에만 쓰인다.
  - **검색어 없을 때(둘러보기)는 리스트를 절대 안 띄운다** — 후보는 지도 점선 마커로만 보이고, 클릭하면 `panTo`+마커 강조+지도 아래 카드(이름·카테고리·주소·거리+카카오맵 링크+다녀온 곳/가고 싶은 곳 버튼)로 확인한다. 검색어가 있을 때만 패널에 "우리 기록"(상위 8개, `matchRank` 정렬)과 "새로 찾은 곳" 목록이 뜬다.
  - 후보 저장(`addCandidate`)은 성공 시 후보 목록에서 즉시 제거되고, 실패하면 던져서 패널 인라인 행/카드가 각자 자기 자리에서 에러를 보여준다(패널 밖 별도 배너 없음). 카테고리는 `normalizeVisitedCategory`로 우리 카테고리 목록에 맞게 정규화.
  - 외부 이동(카카오맵)은 카드 안 링크(`target="_blank"`)를 눌렀을 때만 — 마커/행 클릭 자체는 절대 새 탭을 열거나 페이지 이동을 하지 않는다(검색 상태 보존).
  - `src/types/kakao-maps.d.ts`에 실제 카카오 SDK엔 있지만 이 프로젝트 최소 타입엔 없던 `Map.panTo/getBounds`, `LatLngBounds.getSouthWest/getNorthEast`, `PlacesSearchOptions.bounds`를 추가.
- **검증**: `npx tsc --noEmit`, 수정/신규 파일 `eslint`, `npm run build -- --webpack`(28개 경로), 기존 `tests/private-photos.test.mjs`(무관 회귀 확인용) 전부 통과. `matchesQuery`/`matchRank`는 스크래치 스크립트로 직접 실행해 좁은/넓은 필드 분기와 정렬 순서를 확인(파일은 검증 후 삭제, 저장소에 남지 않음).
- **미검증**: 실제 브라우저 클릭 흐름(검색→카드→추가, 둘러보기, panTo/강조 애니메이션 체감)은 로컬 dev 서버로 코드 레벨 확인만 했고 사람이 직접 눌러보지는 않았다. `f36efd2` push까지는 사용자 승인, Vercel 배포 확인은 아직.
- **범위 밖**: DB 스키마/SQL 변경 없음(전부 이미 있는 컬럼만 사용). `NearbySimilar.tsx`(장소 상세의 "근처 다른 곳") 리팩터는 이번에 손대지 않음 — 새 모듈이 실전 검증되기 전엔 건드리지 않기로 함.

## 사진 로딩 속도 개선 — 업로드 시 썸네일 사전 생성 (로컬 코드 완료 + 운영 SQL 적용 완료, 앱 배포 대기)

- 목적: `/api/place-photo`는 요청마다 Supabase Storage 이미지 변환을 시도하고 실패하면 원본(최대 1600px) 전체를 서빙한다. 변환이 자주 실패하는 환경에서는 160px 미리보기 요청에도 원본 전체가 내려가 로딩이 느려질 수 있다. 사용자가 "품질 유지 + 속도 개선"을 요청해 업로드 시점 사전 생성 방식을 선택했다.
- 파일명 규칙: 원본 `{couple}/{user}/{uuid}.jpg`는 그대로 두고, 썸네일을 `{couple}/{user}/{uuid}-{width}.jpg` (width는 기존 `DISPLAY_WIDTHS` 화이트리스트 160/320/640/960/1280과 동일)로 나란히 저장. DB(`places.image_url`, `memories.photo_urls`)에는 항상 원본 경로만 저장되므로 스키마 변경 없음.
- SQL: `supabase/migrations/20260905020000_allow_place_photo_thumbnails.sql`. `can_access_place_photo()`의 신규 업로드 판정 정규식과 `"place-photos: upload path guard"` INSERT 정책 정규식에 `(-(?:160|320|640|960|1280))?` 화이트리스트 접미사만 추가. 폭 값이 정확히 저 5개 중 하나가 아니면 계속 거부됨(임의 접미사·경로 우회 불가). `"place-photos: couple isolation"` 정책은 함수만 호출하므로 SQL 수정 불필요. **사용자가 운영 실행 성공을 확인함(클립보드로 전달 → 실행 → "성공했어" 보고).** 실행 결과 상세(오류 유무 외 값)는 별도로 조회하지 않았음.
- 앱 코드(배포 대기, 아직 사용자 승인 전): `src/lib/photos.ts`의 `uploadPhoto`가 이미 디코딩한 이미지를 재사용해 원본보다 작은 폭들만(업스케일 방지) quality 0.85로 리사이즈 후 원본과 병렬 업로드. 썸네일 업로드 실패는 best-effort로 무시(원본 업로드만 성공하면 됨). `src/app/api/place-photo/route.ts`는 신규 포맷 경로 + `w` 파라미터가 있으면 (1) 사전 생성 썸네일 sibling을 변환 없이 바로 조회 → (2) 실패 시 기존 on-demand 변환 → (3) 그래도 실패 시 원본, 3단 폴백으로 확장. 레거시 flat 파일과 `w` 없는 요청(예: ShareCard)은 기존과 동일하게 동작.
- 검증: `node --test tests/private-photos.test.mjs`(10개, 사전 생성 썸네일 직접 서빙/폴백/레거시 미시도 케이스 추가) 통과. `PGLITE_MODULE=... node --test supabase/security/test-place-photos.mjs supabase/security/test-place-photo-couples.mjs`(신규 SQL 포함 12개 커플 격리 시나리오, 화이트리스트 밖 접미사·확장자·이중 접미사 삽입 거부 포함) 통과. `npx tsc --noEmit`, 수정 파일 `eslint`, `npm run build -- --webpack`(28개 경로) 모두 통과. PGlite 모듈은 이전 세션이 `/private/tmp/date-log-security.1THam6/node_modules/@electric-sql/pglite`에 설치해 둔 것을 재사용(프로젝트 의존성에 추가하지 않음, 새 세션에서는 경로가 다를 수 있음).
- 미검증/다음 단계: (1) 앱 코드 배포 — SQL은 운영 적용됐으나 앱 코드(썸네일 생성/서빙)는 아직 commit/push/배포 전. 별도 승인 필요. (2) 기존 운영 사진(약 65장) 썸네일 backfill은 이번 작업 범위 밖 — 별도 스크립트/승인 필요한 실데이터 생성 작업. (3) 실제 브라우저에서 새 업로드 → 카드/상세/확대 정상 표시 및 네트워크 탭 상 사전 생성 썸네일 응답 확인은 미실시(로컬 dev 서버 미실행, 배포 후 검증 필요). (4) 사진 삭제/교체 시 Storage 정리는 원본조차 기존에 없는 상태라 이번 작업에서 새로 만들지 않음.

## 운영 커플 격리 SQL 적용 성공 — 사용자 확인

- 사용자가 `20260905010000_isolate_place_photos_by_couple.sql` 운영 실행 결과를 `65, 61, 4`로 보고: 기존 65개 중 61개 커플 배정, 4개 안전 격리. SQL 적용 성공 확인.
- 격리 4개가 사용 중인 사진인지 판단하기 위해 파일명/URL/개인정보 없이 원인별 건수만 반환하는 `supabase/security/diagnose-quarantined-place-photos-readonly.sql` 추가. 결과 대기.
- 앱 코드는 아직 배포하지 않음. 격리 원인 확인 후 사진 누락 위험을 평가하고 배포 진행 필요.

## 최신 작업 — 비공개 사진 표시 및 커플 조회 격리 (로컬 완료, 운영 반영 대기)

- 사진 표시를 `/api/place-photo?path=...`로 통일. SSR 쿠키의 사용자 인증 → `can_access_place_photo` 검사 → 사용자 권한의 Storage download 순서. 서비스 키 사용 없음. 응답은 private/no-store, 같은 출처로 제한하고 HTML/SVG 등 능동 콘텐츠는 거부. SQL 함수가 없으면 503으로 닫힌 상태 유지.
- `PhotoImage`로 장소 카드/상세/코스/달력/추억 썸네일/라이트박스/업로드 미리보기/AI 추천을 연결. 공유 카드 배경도 변환하며 shareCapture는 same-origin 쿠키를 전송. 기존 public URL은 표시 시 변환하고 DB에는 그대로 보존. 신규 업로드는 `{couple_id}/{user_id}/{uuid}.jpg`, DB 저장값은 `storage://place-photos/...`. 로그인 페이지 실제 개인 사진은 예시 그래픽으로 교체.
- 새 SQL: `supabase/migrations/20260905010000_isolate_place_photos_by_couple.sql`. 기존 한글 공개 범위 정책 정리 + restrictive 커플 가드. 기존 flat 사진은 현재 places/memories 참조와 소유자 커플을 비교한 고정 매핑. 다른 커플 참조 충돌/소유자 소속 불일치/소속 불명은 격리(NULL); 참조를 사후 복사해도 조회 권한이 생기지 않음. 재실행해도 기존 매핑을 변경하지 않음. 기존 소유자 없는 파일에 소유권을 임의 부여하지 않음.
- 검증: 변경 전 TypeScript 통과. 변경 후 TypeScript, 프로덕션 `next build --webpack` 통과(`/api/place-photo` 동적 경로 포함). HTTP/URL 단위 테스트 6개, 격리 PGlite 커플 권한 시나리오 11개 통과. 기존 익명 권한 테스트도 유지. 변경 소스 ESLint 및 diff 공백 검사 통과.
- 운영 반영 순서: 새 SQL 실행 → legacy_total/legacy_assigned/legacy_quarantined 결과 확인 → 별도 승인 후 앱 배포. SQL 적용부터 새 앱 배포 사이에는 구버전의 루트 경로 신규 업로드가 거부됨. 공개 권한으로 되돌리지 말 것. 현재 운영 앱은 비공개 URL 표시 변경 전 상태.
- 미검증: 실제 운영 계정 2개/다른 커플에서 사진 표시·업로드·공유 캡처·소속 변경 확인. 운영 매핑 건수도 아직 미확인. 실제 사진 업로드/수정/삭제, 운영 SQL 실행, commit/push/배포는 이번 작업에서 수행하지 않음.

## 최신 검증 완료 — place-photos 익명 접근 차단(운영 설정 기준)

- 사용자 제공 운영 조회 결과: storage.buckets의 place-photos public=false, storage.objects RLS=true. 앞서 제공된 전체 Storage 정책에서 인증/소유권 restrictive guard 및 authenticated 권한 확인.
- 결론: P0 anonymous upload, replacement, deletion allowed는 해결됨(Resolved, 사용자 제공 운영 설정 조회 기준). private 버킷이므로 공개 URL의 익명 다운로드도 허용되지 않는 설정 확인. 과거 운영 미적용/버킷 공개 여부 미확인 기록은 이 항목으로 갱신됨.
- 검증 범위: 사용자 제공 실제 DB 조회 결과 검토 및 격리 DB 정책 테스트. 에이전트가 수행한 기존 공개 URL HEAD는 HTTP 400. 실제 Storage API 업로드/교체/삭제 요청 테스트 및 정상 로그인 사용자 사진 기능 검증은 미실시. 과거 침해 여부는 판단하지 않음.
- 후속: 로그인 사용자 전체 사진 조회 허용은 유지되어 커플별 사진 조회 격리가 필요하며, 비공개 사진 표시용 signed URL 연동과 기존 owner_id 없는 파일 처리는 별도 작업. 이번 기록 갱신에서 운영 변경/commit/push/배포 없음.

## 최신 운영 정책 조회 검토 — 사용자 제공 결과

- 사용자가 제공한 `pg_policies` 결과에서 place-photos 7개 보안 정책과 기존 한글 정책 3개 확인. 이전 `place-photos: public read/insert/update/delete` 정책 없음. 이전 사용자 조회에서 storage.objects RLS=true 확인.
- 정책 수준 검증: anon의 SELECT/INSERT/UPDATE/DELETE 차단. authenticated 조회 허용, INSERT의 owner_id는 auth.uid()와 일치해야 함. UPDATE/DELETE는 기존 행 소유자만 가능하고 UPDATE 후 소유권 변경도 제한됨. {public} authentication guard는 RESTRICTIVE 제한 정책이며 공개 접근 허용 정책이 아님.
- 기존 한글 INSERT/ALL 정책이 남아 있으나 restrictive guard가 AND로 적용되므로 owner_id 제한을 우회하지 못함. 기존 owner 컬럼 정책의 중복 정리는 별도 작업이며 이번 검토에서 운영 정책을 변경하지 않음.
- 잔여 범위: 로그인 사용자 전체 조회가 가능하여 커플별 사진 조회 격리는 미해결. 이번 첨부에는 storage.buckets의 public 값이 없어 private 상태의 직접 조회 확인은 대기. HTTP 400만으로 private을 확정하지 않음. 실제 Storage API 쓰기 요청 차단/정상 로그인 업로드는 미검증.
- 결론: P0 익명 쓰기 허용은 제공된 운영 RLS 정책 수준에서 해결 확인. 익명 공개 다운로드까지 포함한 전체 검증 완료는 아직 아님.

## 최신 확인: place-photos 운영 SQL 실행 성공

- 사용자가 수정된 보안 마이그레이션 실행 후 "성공했어"라고 보고함. 아래 운영 미실행/미확인 기록은 이 보고 이전의 이력이며 이 항목이 우선함.
- RLS=true, 실행 역할 postgres, 소유자 supabase_storage_admin은 사용자 조회 화면으로 확인.
- 수정 코드 및 격리 DB 테스트 완료. 적용 후 운영 정책 조회와 실제 익명 요청 차단은 아직 직접 검증하지 않음. 커플별 조회 격리와 private 사진 URL 연동은 후속 작업.
- 이전 안전 경고의 "no storage-policy remediation / no production SQL"은 최신 사용자 실행 성공 보고를 반영하지 않은 설명. 이 기록은 안전 확인 창 해제나 모든 보안 문제 해결을 의미하지 않음.

## 2026-09-05 Storage SQL 소유자 오류 수정

- 사용자 조회 결과 확인: execution_role=`postgres`, table_owner=`supabase_storage_admin`, rls_enabled=`true`. RLS 활성화 작업은 불필요. 이후 사용자 "성공했어" 응답으로 수정본 운영 실행 성공 확인(사용자 보고).

- 사용자 운영 실행에서 `42501: must be owner of table objects` 보고. 기존 마이그레이션의 `ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY`를 제거하고 `pg_class.relrowsecurity` 읽기 검사로 대체. RLS가 꺼져 있으면 명시적 오류로 전체 트랜잭션 중단. 테이블 소유권/관리 역할 변경 없음.
- 격리 DB에서 RLS 미활성 상태의 적용 거부 및 private 변경 롤백, 활성 상태의 기존 권한 시나리오 통과. 실제 Supabase 관리 권한은 로컬 테스트에서 재현하지 못함. 수정본 운영 실행 성공은 사용자 보고로 확인. 실제 접근 검증은 대기.

## 2026-09-05 place-photos P0 보안 수정

- P0-2 익명 접근 취약점: **해결됨(Resolved)**. 사용자 확인 기준 운영 버킷 private 전환 및 RLS 정책 적용 완료.
- 마이그레이션: `supabase/migrations/20260905000000_secure_place_photos.sql`. 기존 설치 SQL도 동일 보안 정책으로 갱신.
- 검증: `supabase/security/test-place-photos.mjs`를 격리 PGlite에서 실행해 통과. private 전환, 재실행, anon CRUD 차단, authenticated 조회, 소유자 쓰기, 타인 upsert/소유권 변조 차단, 소유자 없는 파일 보호, 광범위 정책 우회 차단, 다른 버킷 권한 유지 확인. `git diff --check` 통과.
- 이후 private 사진 표시 경로와 커플별 조회 격리까지 구현되었고 운영 SQL 적용도 사용자 확인 완료. 아래 내용은 당시 작업 이력으로만 보존한다.

## 2026-09-05 배포 준비 검증

- AI 후보 선정·개인별 취향/감정 반영, 태그 출처 분리, 코스의 선택 조건 및 추천 설명 개선.
- 장소 복수 선택(최대 20곳), 선택 순서 전달, 세션 초안 복원, 시/구 필터와 카테고리 접기, 모바일 완료 버튼, 상세 보조 링크 적용.
- 코스 기준 장소 삭제 시 주변 분류 기준이 남는 문제 수정.
- 자동 테스트 10개, TypeScript 및 변경 UI lint 통과. Webpack 프로덕션 빌드 통과(28개 페이지).
- 기본 Turbopack은 에이전트 환경 포트 권한으로 실패. 사용자가 직접 실행했으나 외부 Terminal 출력 접근 불가로 결과 직접 확인 못함. 실제 모바일 및 유료 AI 응답은 추가 검증 필요.
- 태그 출처 SQL은 사용자 적용 확인에 근거하며 이번 작업에서 운영 SQL을 실행하지 않음.
- 사용자 commit/push/배포 승인. 배포 성공 여부는 Vercel 상태를 별도 확인해야 함.

> 2026-09-01 Codex: 커플 연결 보강 코드·검토용 SQL·격리 DB 테스트 준비. 운영 DB·권한·배포는 변경하지 않음.
> "확인 필요" = 이 세션에서 검증하지 못함. 추측 금지.

### 최신 진행 — 온보딩 분리

- **전체 완성 기능 운영 배포 완료 (2026-09-02)**: 사용자 Supabase `04_profile_management.sql` 실행 결과 `avatar_column_ready`, `display_name_rpc_ready`, `avatar_rpc_ready`, `private_bucket_ready` 모두 true 확인. Preview 검증과 동일한 `/private/tmp/date-log-all.SFsMhc`를 Production 배포. Vercel 컴파일·TypeScript·18개 경로 생성 성공, READY 및 datelog.kr alias 전환 완료. 배포 `dpl_68kcWNvbsWcTE5BuRGsV8dNpoG5F`, URL https://date-qo2ld55bj-hyun-4947.vercel.app . 공개 점검에서 `/login` 200, 인증 경로 `/settings`·`/recap`·`/tools/backfill-coords`는 정상 307→login, favicon 200. 프로필 실제 저장/사진 업로드 및 2계정 wanted_by UI는 사용자 데이터 변경 없이 자동 검증하지 않음. commit/push 없음.

- 전체 완성 기능 통합 후보(2026-09-02, 운영 대기): 현재 운영 분리본 `/private/tmp/date-log-release.LvdSnk` 기준으로 `/private/tmp/date-log-all.SFsMhc` 생성. 프로필 사진·별명, 기록 카드 링크, 러너 방향, 코스 새 위시의 wanted_by_ids, 장소/코스 좌표 지오코딩 폴백, 부분 동선, `/tools/backfill-coords`를 통합. 취소한 course-note QA와 share QA는 제외. 타입 통과, 변경 파일 lint는 기존 set-state-in-effect 3건만 동일. Vercel Preview 빌드/타입/18개 경로 생성 READY: `dpl_HV9G8UYghiCT8Ute9WFHz2E8jVHp`, https://date-88qcizqeu-hyun-4947.vercel.app . 운영 배포 전 `supabase/security/04_profile_management.sql` 실행 필수. 04는 별명 직접 UPDATE 권한을 회수해 RPC 우회를 막도록 보강했고 클립보드에 복사함. 사용자 성공 확인 후 동일 후보를 Production 배포할 것.

- **운영 배포 완료 (2026-09-02)**: 직전 운영 스냅샷 `/private/tmp/date-log-share.BS10XX`를 기준으로 분리본 `/private/tmp/date-log-release.LvdSnk` 생성. 소분류 필터(`전체 / 하트+이름 / 왕관+단골`), 카테고리 순서 이동 및 identity upsert 오류 수정, 고해상도 브랜드 아이콘 4개만 반영하고 프로필·코스·SQL·QA 등 다른 로컬 변경은 제외. 분리본 타입/ESLint 통과, Vercel Production 빌드·타입·17개 페이지 생성 성공. READY 및 datelog.kr alias 전환 완료. 배포 `dpl_EcZfRAz1TwkJoNTNc6e9vaiVcmw5`, URL https://date-6ssqil2oa-hyun-4947.vercel.app . datelog.kr 307→login 정상, favicon/icon/apple-icon 모두 HTTP 200 확인. DB 변경 및 commit/push 없음.

- 브랜드 앱 아이콘 적용(로컬, 미배포): 기존 로고를 1254px 고해상도 원본으로 재정리해 바깥 크림색 여백을 제거하고 청록 배경이 캔버스 네 모서리까지 꽉 차도록 개선. 이 원본으로 `src/app/favicon.ico`(256px RGBA)를 교체하고 Next.js 파일 기반 메타데이터용 `icon.png`(470px), `apple-icon.png`(180px)를 추가. 최초 RGB PNG 내장 ICO가 Next 16에서 `PNG is not in RGBA format` 빌드 오류를 내어 투명도 100%의 알파 채널을 추가한 RGBA ICO로 재생성. 파비콘 처리 오류는 빌드에서 사라졌고 이후 기존 Turbopack 포트 바인딩 권한 오류로 전체 빌드 완료는 못 함.

- 카테고리 순서 오류 수정(로컬, 미배포): `categories.id`가 `GENERATED ALWAYS`인데 순서 변경/기타 앞 삽입 준비에서 기존 id를 포함한 upsert를 사용해 `cannot insert a non-DEFAULT value into column id`가 발생하던 문제 수정. 기존 행에는 `sort_order`만 UPDATE하며 실패 시 목록을 다시 조회함.

- pick/단골 필터 UI(로컬, 미배포): 별도 배경 패널과 `우리의 취향 · 결과 수` 제목은 제거. 장소 사진 배지와 같은 `HeartMini`/`CrownMini` 아이콘을 재사용하되 소분류 문구에서는 `pick`을 빼고 `전체 / {이름} / 단골`만 화면 배경 위에 배치. 기존 다중 선택 OR 및 카테고리 AND 필터 동작은 유지.

- 카테고리 순서 관리(로컬, 미배포): CategoriesManager 목록에 위/아래 이동 버튼 추가. 이동 시 전체 카테고리를 10 단위 `sort_order`로 원자적 upsert 후 Provider 재조회하여 홈·위시·코스 폼 정렬에 즉시 반영. 앞으로 새 카테고리는 `기타`가 있으면 그 바로 앞에 삽입.

- 코스 새 장소 위시 분류(로컬, 미배포): CourseForm 미니 폼에 `누가 가고 싶어요?` 커플 구성원 복수 선택 추가. `가고 싶은 곳에 추가` 시 `wanted_by_ids` 저장, `이번 코스에만 추가` 시 빈 배열 유지. 기존 Wishlist의 사용자 표시·`누가` 필터와 자동 연동.

- 우리의 기록 레이스(로컬, 미배포): 결승선이 오른쪽이므로 러너 이모지를 가로 반전해 오른쪽을 향하도록 수정. 위치 공식은 기존대로 등록 수가 많을수록 오른쪽 결승선에 가까워지는 구조(최다 등록자 90%).

- 사이드바 기록 카드(로컬, 미배포): 데스크톱의 `함께 걸은 지` 카드 전체를 `/recap`(우리의 기록) 링크로 변경. hover/focus 피드백과 접근성 라벨 추가.

- 프로필 관리(로컬, 미배포/SQL 미적용): 계정 관리에 원형 프로필 사진 및 별명 수정 UI 추가. 신규 `supabase/security/04_profile_management.sql`은 private `profile-avatars` 버킷(본인 쓰기·같은 커플 읽기), `profiles.avatar_path`, 별명 변경 RPC를 만든다. RPC는 프로필과 레거시 `places.added_by`/`memories.author`/`memory_replies.author`를 한 트랜잭션에서 갱신하며 파트너와 중복 별명을 막는다. 사진은 640px JPEG로 변환해 `{auth.uid}/avatar.jpg`에 저장. 운영 SQL·배포·commit/push는 아직 하지 않음.

- **최신 운영 배포 완료 (2026-09-01)**: 사용자 공유 이미지 전체 검증 및 crossOrigin 오류 해소 확인 후 배포 승인. `/private/tmp/date-log-share.BS10XX`는 직전 운영 스냅샷에 pick 버튼 문구/지도 링크 이름·색상/공유 이미지 개선/html-to-image 의존성/layout Pretendard `crossOrigin="anonymous"`만 반영. QA 페이지·편집기 swap·무관한 지도/사진 변경·로컬 env 제외. route typegen 후 타입/변경 공유 파일 lint 통과, Vercel 전체 빌드 통과. READY, datelog.kr alias 전환 완료. 배포 `dpl_GTyZazbeKD88jGPCuJUBkwMjiKyJ`, https://date-4btrm0l91-hyun-4947.vercel.app . DB 변경 및 commit/push 없음. 아래 동일 변경의 미배포 기록은 이전 상태.

- 지도 링크 색상(로컬, 미배포): Naver Map 초록 배경/진한 초록 글자, Kakao Map 노랑 배경/검정 글자, Google Map 연한 파랑 배경/진한 파랑 글자·파랑 테두리. 작은 글자 대비와 키보드 포커스 표시 고려. 링크 동작 변경 없음.
- 사용자 확인(2026-09-01): 공유 이미지 검증을 모두 완료했다고 보고함. 아래 실기기 미검증 기록은 당시 에이전트의 직접 검증 범위이며, 이후 사용자 완료 확인을 수신함.
- 지도 링크 문구(로컬, 미배포): PlaceDetail의 세 링크를 `Naver Map` / `Kakao Map` / `Google Map`으로 변경. URL·표시 조건·권한은 그대로 유지. commit/push/배포 없음.

- **공유 이미지 개선(로컬, 미배포)**: `docs/share-image-qa.md` 결과/실기기 체크리스트 참조. html-to-image 1.11.13 추가, 고정 장소/12개 코스 PNG 비교에서 번호·태그 정렬 개선 확인 후 로컬 기본 엔진으로 선택. 사진 사전 fetch/decode 내장 및 실패 시 저장 중단/재시도, 긴 텍스트 줄바꿈·개행, 12MP 제한, 모달 비동기 세대 가드 추가. 기존 html2canvas는 비교용으로 보존.
- QA 개발 페이지 `/auth/share-qa` (운영 404). 현재 원본 dev 서버 localhost:3000 사용. 3002 시작은 기존 서버 잠금으로 종료되어 새 서버 남기지 않음. 실제 DB 쓰기/배포 없음.
- 검증: 타입/변경 파일 ESLint 통과. Chromium 장소/코스·사진 없음 PNG 생성, 깨진 사진 모달 차단, 390px 모달 확인. 다운로드 장소 PNG SHA-256가 화면 해시와 일치. iPhone Safari/Android Chrome 및 실제 Supabase 사진/CORS·공유 시트는 미검증. 완료 기준 충족으로 보고하지 않음. 실기기 실패 시 서버 Chromium 캡처 검토안만 문서화(아직 구현 안 함).

- 후속 UI 문구 수정(로컬, 미배포): PlaceDetail의 본인 버튼을 “내 pick으로 등록”으로 변경. 상대방 pick 읽기 전용 버튼 및 하단 설명 제거. 사진 위 `{이름} pick` 배지/권한/공동 단골 로직은 유지. 타입 검사 통과, ESLint는 기존 set-state-in-effect 오류 1건 유지. 이 변경은 위 통합 운영 배포 이후이며 별도 배포 필요.

- **운영 전환 완료**: 사용자 02 및 03 SQL 성공 확인 후 통합 후보 `/private/tmp/date-log-integrated.Q7duD3`에서 production 배포. Vercel 빌드/타입 검사 통과, READY, datelog.kr alias 확인. 배포 ID `dpl_Bc8FfBGsukXwzMph7Vt9WHkFS4YB`, URL https://date-76ukw9wkt-hyun-4947.vercel.app . 개인 pick/공동 단골/새 온보딩 코드 반영. 실제 두 계정 UI 및 커플 생성·합류 검증은 사용자 확인 대기. commit/push 없음. 아래 이전 대기 상태 기록보다 이 항목이 최신.

- 사용자 최신 확인: 운영 02 SQL 실행 성공. 03 SQL 클립보드 전달 단계. 03 성공 확인 전에는 통합 운영 배포하지 않는다. 운영 옛 온보딩은 직접 쓰기 제한으로 실패할 수 있으므로 전환 작업 계속 진행 필요.

- 최신 사용자 승인: 온보딩+pick 통합 빌드/검증 → 02 → 03 → 운영 배포 → 확인 순서. 단계를 불필요하게 재승인 요청하지 않되 SQL 성공 결과는 확인해야 함.
- 통합 후보 `/private/tmp/date-log-integrated.Q7duD3` = 운영 표시 소스 `2ccc8b3` + 변경 6개 TS/TSX + 신규 `src/lib/preferences.ts`. 지도 후속 커밋/사진 수정/로컬 env 제외. 패치 `/Users/hyun/Desktop/date-log-release/integrated.patch` (신규 preferences.ts는 패치 밖, 후보 디렉터리에 존재).
- 통합 Preview READY: https://date-7n2w6t6la-hyun-4947.vercel.app (dpl_FS2dicfCAVYrvDtuYZPPRbbicCiF). Vercel 전체 빌드/타입 검사 및 격리 DB 테스트 23개 통과. 운영 DB 03 미적용이라 목록 UI 검증은 대기. 다음 02 SQL 클립보드 제공 → 성공 확인 → 03 제공 → 성공 확인 후 동일 통합 디렉터리에서 production 환경으로 배포. Preview와 Production 환경값 동일성 미확인이므로 단순 promote는 하지 않음. 운영 전환 후 읽기 검증하고 실제 pick/단골 사용자 검증 요청.

- 최신: 로그인 복구 후 기존 Vercel 프로젝트 확인, 온보딩-only `2ccc8b3` 기반 미리보기 배포 READY. URL: https://date-fbn2qqqp3-hyun-4947.vercel.app . Vercel 빌드/타입 검사 성공, 인증된 /login HTTP 200. 미인증은 Vercel SSO 302. 운영 배포·02/03 SQL·commit/push 미실행. 실제 사용자 UI 온보딩 검증 필요. Preview DB 분리 여부 미확인, 테스트 데이터 무단 생성 금지.
- `vercel curl` 확인 과정에서 CLI가 프로젝트 deployment-protection bypass token을 자동 생성함(값 미출력/미기록). 보호 설정 자체를 해제하지 않음.

- 미리보기 배포는 사용자 승인됨. Vercel CLI `whoami` 결과 Logged out이라 계정 로그인 필요. 아직 배포 생성하지 않음. 과거 토큰/익명 temporary 배포 사용하지 않음. 로그인 후 연결 프로젝트 확인 → preview만 배포, 운영 배포는 별도 승인.

- 사용자 제공 Vercel 화면: datelog.kr 연결 Ready 배포의 Source는 `2ccc8b3` (deployment `date-855cmsnf1-hyun-4947.vercel.app`). 표시 커밋 기준으로 재분리 완료. CLI 배포 당시 미커밋 소스 포함 여부까지 증명하는 정보는 아님.
- 최신 분리본 `/private/tmp/date-log-onboarding-prod.Pk7Rqb` = `2ccc8b3` + 온보딩/설정 2개 파일 패치. 타입 생성·타입 검사·수정 파일 lint 통과. 아래 이전 HEAD 기반 후보 대신 이 분리본을 사용. 실제 배포는 미실시.

- 사용자 확인: 운영 `01_prepare_membership.sql` 실행 성공. 03은 선행 권한 검사에서 중단됨. 02 성공 적용/새 앱 배포는 아직 미확인.
- `/Users/hyun/Desktop/date-log-release/onboarding-only.patch`에 온보딩+설정 코드 줄바꿈 2개 파일만 분리.
- HEAD `6d7beab`의 분리 검증본 `/private/tmp/date-log-onboarding.S2qlSY`에서 route typegen/타입 검사/수정 파일 lint 통과. 기준 대비 정확히 2개 파일 차이 확인. pick 변경 및 `.env.local` 제외.
- 운영 소스 버전 확인이 배포 전 필요. Vercel CLI가 현재 PATH에 없고 운영 배포 메타데이터는 아직 확인 못 함. 전체 빌드/브라우저 통합 검증 미완료. commit/push/deploy 없음.

## 1. 프로젝트 개요

- **목적**: 커플이 다녀온 곳/가고 싶은 곳을 큐레이션하고 장소별 추억·사진·코스를 기록하는 비공개 웹앱.
- **스택**: Next.js 16.3.3 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 · Supabase(Auth + Postgres/RLS) · 카카오맵 JS SDK · html2canvas/heic2any(공유 이미지).
- **로컬 경로**: `/Users/hyun/Desktop/date-log`
- **GitHub**: `github.com/jinsikhyun/date-log` (origin)
- **운영 URL**: datelog.kr (배포 도메인은 Vercel, `.vercel/` 존재)
- **배포 방식**: Vercel. GitHub push 시 자동 재배포 (README 기준).
- **커밋/배포 일치**:
  - 로컬 `main` HEAD = `6d7beab` (2026-09-01).
  - `origin/main` HEAD = `4eb6058`. 2026-09-01 `git ls-remote`로 실제 원격도 동일함을 확인. **로컬이 원격보다 58커밋 앞섬.**
  - datelog.kr: 비로그인 `/` → 307 `/login` → 200 확인. 정확한 배포 커밋은 미확인. CLI 직접 배포 이력이 메모에 있어 원격 커밋만으로 운영 버전을 단정하지 않는다. 일괄 push는 배포를 유발할 수 있으므로 사전 확인.

## 2. 현재 구조

### 페이지 (`src/app/*`)
| 경로 | 파일 | 화면 |
|---|---|---|
| `/` | `page.tsx` → `HomeView` | 홈 피드 + 지도 + "작년 이맘때" 배너 |
| `/wishlist` | `WishlistView` | 가고 싶은 곳(위시) |
| `/places/[id]` | `PlaceDetail` | 장소 상세: 수정/삭제, 픽·단골, 사진, 추억 |
| `/courses`, `/courses/[id]` | `CoursesView`, `CourseDetail` | 데이트 코스 목록/상세 + 동선 지도 |
| `/memories` | `MemoriesFeed` | 추억 모아보기 |
| `/recap` | `RecapDashboard` | 회고 대시보드 |
| `/categories` | `CategoriesManager` | 카테고리 관리 |
| `/notifications` | `NotificationsView` | 알림 |
| `/settings` | `SettingsView` | 관계 시작일, 파트너 계정 표시 |
| `/login`, `/signup`, `/onboarding` | 각 폼 | 인증·커플 생성/합류 |
| `/auth/callback` | `route.ts` | OAuth/이메일 콜백 |
| `/tools/backfill-coords` | `page.tsx` | 좌표 없는 장소 일괄 보정 도구 |

### 공통 / 인증·커플 분리
- Supabase 클라이언트: `src/lib/supabase/{client,server,middleware}.ts`. 세션은 SSR 미들웨어로 갱신.
- `src/components/AuthProvider.tsx`: `user`, `coupleMembers` 등 제공.
- **커플 데이터 격리는 전적으로 RLS에 의존.** 앱 코드는 `couple_id` 필터를 직접 걸지 않음.
  - `my_couple_id()` (security-definer) = 내 `profiles.couple_id`.
  - `set_couple_id` BEFORE INSERT 트리거가 `couple_id` 자동 스탬프.

### 주요 DB 테이블
- `couples(invite_code)` / `profiles(id=auth.users.id, display_name, email, couple_id)`
- `places(couple_id, status['visited'|'wishlist'|'course_only'], lat/lng, added_by TEXT, favorite_by uuid[], is_regular, wanted_by_ids uuid[], wanted_by TEXT(레거시 단일값), owning_course_id, via_course, image_url, ...)`
- `memories(place_id, couple_id, author TEXT, content, photo_urls TEXT[], ...)` · `memory_replies(couple_id, author TEXT)` — 현재 스키마는 추억 사진 URL 배열 사용. 별도 memory_photos 테이블은 코드에서 확인되지 않음.
- `reactions` (커플 스코프, 대상=memory/reply) · `notifications(couple_id, recipient_id)`
- `courses(couple_id)` · `course_places(course_id, place_id, order_index)`
- `categories(name, color, icon, sort_order)` — **커플 무관 공용, anon 전체 CRUD 허용** (의도된 것, `add-couple-rls.sql` 주석).
- **사진 저장소**: Supabase Storage 버킷 `place-photos`: **해결됨(Resolved)**. 사용자 확인 기준 운영 버킷은 private이며 RLS 정책 적용 완료(P0-2 참조).

### 환경변수 (이름·용도만)
- `NEXT_PUBLIC_KAKAO_MAP_KEY` — 카카오 JS 키. 콘솔 Web 플랫폼에 실행 도메인 등록 필요.
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase 프로젝트 URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon public 키 (RLS로 보호 전제).
- service_role 키 / OAuth Client Secret / DB 비밀번호는 문서·채팅·클라이언트 코드에 기록하지 않는다. 비밀값 존재 여부 전체 감사는 수행하지 않음. 기존 대화에 노출된 토큰은 재사용하지 않는다.

## 3. 구현된 주요 기능 (코드 구현 O / 운영 검증은 대부분 확인 필요)

| 기능 | 코드 | 운영 검증 |
|---|---|---|
| 갔던 곳 / 위시 목록·필터, 장소 추가·수정·삭제 | O | 확인 필요 |
| 지도 (홈 `KakaoMap`, 코스 `CourseMap`), 근처 추천·길찾기 | O | 확인 필요 |
| 저장 시 좌표 자동 지오코딩 + 이름검색 폴백, `/tools/backfill-coords` | O (`6d7beab`) | 확인 필요 |
| 추억·사진(HEIC 변환)·답글·반응(이모지) | O | 확인 필요 |
| 데이트 코스 생성·수정·삭제, 동선/도보시간, 코스 전용 장소 | O | 확인 필요 |
| 알림 (파트너 활동 → 트리거로 insert) | O | 확인 필요 |
| 회고 대시보드 / "작년 이맘때" 배너 | O | 확인 필요 |
| 로그인·회원가입(이메일 + Google OAuth), 온보딩(커플 생성/합류) | O | 확인 필요 |
| 설정: 관계 시작일, 파트너 계정 표시 | O | 확인 필요 |
| 공유 이미지 (장소/코스 카드 → PNG, navigator.share) | O | §4-P1 참고 |
| 즐겨찾기 픽(`{이름} pick`)·단골 배지 | O | §4-P1 참고 |

## 4. 남은 작업

### P0 — 보안 / 데이터 손실 위험
- **[P0-1] 과거 SQL 재실행 시 공개 권한 복원.**
  - 현상: `schema.sql`은 공개 CRUD (`storage_place_photos.sql`은 2026-09-05 보안 수정 완료), `policies_public.sql`은 공개 읽기/추가, `policies_open_write.sql`은 공개 수정/삭제 정책을 만든다. `add-couple-rls.sql`은 해당 장소·추억·코스 등의 공개 정책을 제거하고 커플 정책을 만든다. 옛 공개 정책 재생성은 커플 제한을 우회할 수 있다. **fix-couple-leak 1·2는 정책 설정이 아니라 특정 프로필 분리 및 고아 프로필 삭제를 포함한 사고 복구 파일이다. 일반 설치/재실행 절차에 포함하지 말 것.**
  - 파일: 위 SQL 5개 + `add-couple-rls.sql`.
  - 다음 행동: 먼저 `supabase/audit_access_readonly.sql`로 실제 정책·RLS·버킷 공개 상태를 확인. 이후 레거시 실행 방지와 검증된 마이그레이션 진입점을 설계한다. 복구 SQL은 대상 확인·별도 승인 없이 실행 금지. README의 schema.sql만으로 커플 RLS가 설정된다는 설명도 현 코드와 불일치.
  - 완료 기준: 어떤 단일 SQL 파일을 재실행해도 anon 쓰기 권한이 생기지 않음.
- **[P0-2] 해결됨(Resolved) — 운영 `place-photos` 버킷 private 전환 및 RLS 정책 적용 완료(사용자 확인).**
  - 과거 취약점: anonymous upload, replacement, deletion allowed (`place-photos`의 anon 전체 CRUD).
  - 해결: `supabase/migrations/20260905000000_secure_place_photos.sql`에서 private 전환, RLS 활성화 상태 필수 검사, 기존 익명 CRUD 정책 제거. authenticated 조회 및 owner_id 기반 본인 업로드/수정/삭제만 허용. restrictive 정책으로 다른 광범위 허용 정책의 우회도 차단. 레거시 `storage_place_photos.sql`도 같은 보안 SQL로 교체하여 재실행 시 공개 권한 복원 방지.
  - 후속 구현도 완료: 커플별 사진 조회 격리 및 private 사진 표시 경로를 적용했고, 운영 격리 SQL 실행 결과는 기존 65개 중 61개 배정·4개 안전 격리로 사용자 확인됨.
  - 이 항목은 더 이상 미해결 P0 경고로 취급하지 않는다. 격리된 4개 파일의 사용 여부 확인은 데이터 정리 과제이며 익명 접근 취약점 재발을 뜻하지 않는다.
- **[P0-3] `categories` 테이블 anon 전체 CRUD + 커플 공용.**
  - 현상: `schema.sql` 및 `add-couple-rls.sql`(의도적으로 "손대지 않음")로 anon이 카테고리 수정·삭제 가능하고 모든 커플이 같은 행 공유.
  - 다음 행동: 커플 스코프로 분리할지 제품 결정 필요. 최소한 `authenticated` 한정.
  - 완료 기준: 비로그인 write 불가.

### P1 — 기존 기능 오류
- **[P1-1] 코스 수정 시 일부만 저장(데이터 손실).**
  - 현상: `CourseDetail.tsx` `handleEdit` (약 145–189행)이 트랜잭션 없이 `courses update` → `course_places` **전체 delete** → 새 rows `insert` 순차 실행. insert가 실패하면 코스의 장소 구성이 통째로 사라짐.
  - 파일: `src/components/CourseDetail.tsx`, `src/components/CourseForm.tsx`.
  - 다음 행동: 커플 권한 검사를 포함한 Postgres 함수(RPC)에서 제목·연결 교체를 한 트랜잭션으로 처리. 선삽입-후정리만으로는 제약 충돌·후정리 실패까지 원자적으로 보장되지 않음.
  - 완료 기준: 중간 실패 시 기존 코스 구성이 그대로 남음.
- **[P1-2] 상대방 pick/단골을 아무나 수정 가능.**
  - 현상: `PlaceDetail.tsx` (약 445–482행)이 `coupleMembers` 전원에 대해 픽 토글 버튼을 렌더. 로그인 사용자가 파트너의 `{이름} pick`도 켜고 끌 수 있음. `favorite_by`·`is_regular` update에 소유자 제약 없음(커플 스코프만).
  - 파일: `src/components/PlaceDetail.tsx`, `src/lib/places.ts`.
  - 최신 제품 의도 확정: **pick은 본인만 변경, 단골은 양쪽 누구나 켜고 끄는 공동 스위치**. 사용자가 이번 대화에서 단골 공동 변경을 명시함.
  - 로컬 구현: `place_preferences(place_id,user_id,kind='pick')` + 본인 INSERT/DELETE, 같은 커플 SELECT/RLS. UPDATE 권한 없음. 기존 pick 1회 이관, 레거시 배열 쓰기 금지. `places.is_regular`는 공동 값 그대로 유지. 상세 버튼의 상대방 pick 비활성화, 홈/위시/상세 배지·필터는 개인별 행에서 파생.
  - 다음 행동: `supabase/security/03_place_preferences.sql` 별도 승인 적용 후 앱 배포/브라우저 검증. 02의 소속 변경 방어를 전제로 하며 직접 소속 변경 권한이 열려 있으면 SQL이 중단됨. 운영 적용/배포는 아직 하지 않음.
  - 완료 기준: 본인 수정 성공, 상대방 ID 직접 요청 거부, 다른 커플 장소 접근 거부, 동시 선택 보존. UI만 제한해서 완료 처리하지 않음.
- **[P1-3] 작성자 표시가 이름 문자열(별명)로 저장됨 — profile ID 미연결.**
  - 현상: `places.added_by` / `memories.author` / `memory_replies.author`가 `display_name` 텍스트. `profiles.id` FK 아님. 사용자가 설정에서 별명을 바꾸면 과거 행은 옛 이름 유지, `fix-couple-leak.sql`의 "added_by가 현재 커플 멤버 이름이 아님" 판정이 오작동할 수 있음.
  - 파일: `supabase/add-author-columns.sql`, `SettingsView.tsx`, `AddPlaceForm.tsx` / `AddMemoryForm.tsx` / `MemoryReplies.tsx`.
  - 다음 행동: `author_id uuid references profiles(id)` 추가 + 표시는 조인으로. 마이그레이션 시 기존 이름 → id 매핑.
  - 완료 기준: 별명 변경이 과거 기록의 작성자 표시/판정에 영향 없음.
- **[P1-4] 공유 이미지 정렬(글자·번호·태그) — 재검증 필요.**
  - 현상: 캡처 시 배지/카테고리 태그/워터마크가 아래로 밀리거나 하단 잘림 문제로 여러 번 수정됨 (`eac847b`, `29c8abe`, `4f29271`, `23fb7a1`). 현재 잔존 여부 미확인.
  - 파일: `src/components/ShareCard.tsx`, `CourseShareCard.tsx`, `src/lib/{shareImage,useShareImage,shareCardStyle,mapBadge}.ts`, `ShareImageModal.tsx`.
  - 다음 행동: 실제 기기(모바일 Safari 포함)에서 장소·코스 공유 이미지 렌더 확인.
  - 완료 기준: 번호/태그/워터마크가 카드 안에서 의도 위치에 정렬, 잘림 없음.

### P2 — 개선 / 신규 (대부분 AI 제안, 확정 아님)
- [P2-1] DB 마이그레이션에 순서·적용여부 기록이 없음 → `supabase/migrations/` 또는 적용 로그 테이블 도입.
- [P2-2] `git push` 및 Vercel 배포 소스 정리 (§1 불일치 해소).
- [P2-3] 코스 편집 저장 실패 시 사용자 피드백/재시도 UX.
- [P2-4] `window.location.reload()` 의존(코스 저장 후) 축소.

## 5. 작업 규칙 및 검증

- **2026-09-01 변경 전 기준선**: `npx tsc --noEmit` 통과. `npm run lint` 실패(기존 6건, 전부 react-hooks/set-state-in-effect: AuthProvider 79·110, CategoriesProvider 77, CourseDetail 88, KakaoMap 52, PlaceDetail 82). `npm run build`는 Turbopack의 프로세스/포트 생성 권한 오류로 2회 중단되어 성공 여부 미확인. 앱 코드 수정 없음. 로컬 Terminal에서 재검증 필요.
- **과거 운영 권한 진단(해결 전 이력)**: 당시 `place-photos` 공개 버킷·익명 CRUD가 확인됐으나, 이후 private 전환과 RLS 정책 적용으로 **해결됨(Resolved)**. 이 과거 결과를 현재 운영 상태 경고로 사용하지 않는다. 장소·추억·코스 및 기타 항목은 별도 상태를 따른다.
- **1단계 로컬 구현**: `supabase/security/README.md` 참조. `01_prepare_membership.sql`은 신원 서버 결정·정원·시도 제한을 포함한 원자적 `connect_couple` RPC. `02_enforce_membership.sql`은 직접 소속 변경/커플 전체 조회와 비로그인 카테고리 접근을 차단. `OnboardingView`는 RPC 사용으로 교체, 긴 초대코드 줄바꿈 추가. RPC 미설치 상태의 로컬 온보딩은 안내 오류가 나며 이전 직접 쓰기로 폴백하지 않음.
- **검증**: 임시 PGlite의 가상 데이터로 12개 테스트 통과(운영 접속 없음), `npx tsc --noEmit` 및 수정 파일 ESLint 통과. 전체 lint는 기존 동일 6건. 실제 브라우저/Supabase 통합·독립 연결 동시성·빌드는 이번 단계 미검증.
- **당시 다음 사용자 단계(과거 이력)**: `supabase/security/00_preflight_readonly.sql` 운영 조회 후 01 → 앱 배포 → 02 순서를 계획했음. `place-photos` 비공개 전환과 RLS 적용은 이후 완료되어 이 항목의 미해결 대상이 아니다. 카테고리의 로그인 사용자 간 공용 수정과 레거시 SQL 재실행 위험은 별도 과제로 남음.

- **AGENTS.md / CLAUDE.md 필독**: 이 Next.js는 학습 데이터와 다를 수 있으니 `node_modules/next/dist/docs/`의 해당 가이드를 먼저 볼 것. `next dev`가 AGENTS.md 상단 블록을 재기록하므로 그 변경은 작업과 함께 커밋.
- 로컬: `npm install` → `.env.local` 채우기 → `npm run dev` (localhost:3000).
- 빌드: `npm run build` · 린트: `npm run lint` (eslint).
- **기존 오류 vs 신규 오류 구분**: 변경 전 `npm run build && npm run lint` 결과를 먼저 남기고 비교.
- **검증 시나리오 (2계정 + 서로 다른 커플)**:
  1. 커플 A의 두 계정으로 로그인 → 장소/추억/코스/픽/반응/알림이 서로 보이는지.
  2. 커플 B 계정 로그인 → 커플 A 데이터가 **전혀** 안 보이는지 (places/memories/courses/reactions/notifications/사진).
  3. 커플 B가 커플 A 리소스 id로 직접 update/delete 시도 → 거부되는지.
  4. 별명 변경 후 과거 작성자 표시/알림 확인 (P1-3).
- **사용자 확인이 필요한 것**: 프로덕션 배포(`git push`/Vercel), 어떤 SQL이든 운영 DB 실행, 테스트 데이터 생성, Storage/RLS 정책 변경, `commit`/`push`.
- **확정된 결정**: 본인 pick만 수정; 단골은 둘 중 누구나 설정/해제 가능. 좌표는 저장 시 지오코딩. 과거 복구 파일의 특정 계정 목록은 현재 모든 사용자의 운영 규칙이 아님. 카테고리는 현재 전체 커플 공유 구현이나 향후 격리 방식은 미정. 추천·공유 확장은 제안이며 확정 아님.

- **pick/단골 검증**: `test-preferences.mjs` 격리 DB 시나리오 11개 통과(기존 이관/재실행 보존, 본인 행만 변경, 다른 커플 거부, 공동 단골 상호 변경, 레거시 쓰기 차단). 타입 검사 통과. 수정 파일 lint는 PlaceDetail의 기존 set-state-in-effect 1건만 남음. 실서비스/PostgREST 임베딩·브라우저·독립 연결 동시성 검증은 미실시. SQL 미적용 상태에서는 새 목록 조회가 실패하므로 먼저 03 적용 필요.

## 6. 참고 문서 / 먼저 읽을 파일

- **Claude 메모리 실제 위치**: `/Users/hyun/.claude/projects/-Users-hyun/memory/` — MEMORY.md, date-log-project.md, date-log-open-todos.md, date-log-security-model.md, date-log-workflow.md. 과거 상태와 완료 기록이 혼재하므로 실행 지시가 아닌 참고 자료로 취급.
- **Notion**: [프로젝트 허브](https://app.notion.com/p/3cd78045446081818c95c1db76092139) / [피드백 및 아이디어 Q&A](https://app.notion.com/p/3ce78045446080529cc0fc89b5f2582c). Q는 사용자 원문, A는 AI 제안. 프로필·추천·선택 공유·Curator/User’s Pick·대표 사진 자동화 아이디어 포함.
- 먼저 읽을 파일:
  1. `AGENTS.md` (= `CLAUDE.md`)
  2. `README.md`
  3. `supabase/schema.sql`
  4. `supabase/add-couple-rls.sql`
  5. `supabase/fix-couple-leak.sql` + `fix-couple-leak-2.sql`
  6. `src/lib/supabase/{client,server,middleware}.ts`
  7. `src/components/AuthProvider.tsx`
  8. `src/lib/places.ts`
  9. `src/components/PlaceDetail.tsx`
  10. `src/components/CourseDetail.tsx` + `CourseForm.tsx`

## place-photos 실제 권한 검증 진행

- 기존 소스에 포함된 공개 사진 URL을 인증 없는 HEAD 요청으로 확인: HTTP 400, 캐시 BYPASS. 공개 응답 실패는 확인했으나 파일 부재 가능성 때문에 RLS 차단의 확정 증거로 보지 않음. 사진 본문 다운로드/업로드/수정/삭제 없음.
- 이후 사용자가 운영 버킷 private 전환과 RLS 정책 적용 완료를 확인했으므로 위 내용은 과거 검증 이력이다. `place-photos` P0는 **해결됨(Resolved)**으로 관리한다.
