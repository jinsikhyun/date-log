# 남은 위험 4건 처리 (2026-09-12, 운영 정리 마이그레이션 1건 적용 · commit 함 · push 안 함)

앞 절("커플 격리(RLS) 이상 현상 조사")에서 남겨 둔 위험 4건을 닫았다.

## 1. `npm run build` 검증 — 통과(우회 조건 명시)

Mac 에서 설치된 `node_modules` 때문에 Cowork 리눅스 VM 에서는 SWC 바이너리가 안 맞아 빌드가
안 됐다. 사용자 저장소를 건드리지 않기 위해 **VM 스크래치로 소스만 복사(`git ls-files` 기준,
`node_modules`·`.next`·`.git` 제외)해 `npm ci` 후 빌드**했다.

- 결과: **exit 0, 33개 라우트 생성**(`/api/place-google-photo`·`/api/ai-dismiss` 포함).
- 단, `next/font/google`(Geist·Geist Mono)이 `fonts.googleapis.com` 을 빌드 타임에 받아오는데
  **VM·클라우드 양쪽 모두 이 도메인이 egress 에서 막혀 있다**(curl 000). 그래서 스크래치
  사본에서만 폰트 로더를 상수로 치환하고 빌드했다. 나머지(타입·전 라우트 컴파일·프리렌더)는
  전부 실제 코드 그대로 검증됐다.
- 함의: **빌드가 Google Fonts 네트워크에 의존한다.** 오프라인·제한망에서는 빌드가 실패한다.
  `next/font/local` 로 자가호스팅하면 빌드가 hermetic 해진다(폰트 파일 다운로드가 필요해
  이 환경에서는 못 함 — 별도 과제).

## 2. "가드가 파일 일부만 잘라 실행하면 못 막는다" — 위험한 SQL 텍스트 자체를 제거

가드(`connect_couple` 존재 시 raise)는 파일 **전체** 실행만 막는다. 부분 붙여넣기까지 막으려면
되돌릴 SQL 이 파일에 없어야 한다.

| 파일 | 조치 |
| --- | --- |
| `supabase/policies_public.sql` | **폐기 스텁으로 교체** — 내용 전체가 `raise exception`. 예전 내용은 git 이력에만. |
| `supabase/policies_open_write.sql` | 동일 |
| `supabase/schema.sql` | 무조건 통과 정책 **statement 16개 제거**. `drop policy` 문만 남겨 예전 정책 청소 역할만 한다. RLS 는 켜되 정책 0개 = 안전한 기본값. 설치 순서 주석 추가 |
| `supabase/add-couple-rls.sql` | `couples: insert authed`(with check true) 제거, `couples: select authed`(using true) → **`couples: select own using (id = my_couple_id())`** 로 교체. security/02 와 정책 이름·정의가 같아져, 이 파일이 다시 실행돼도 격리가 되돌아가지 않는다. 커플 생성·합류는 `connect_couple()` RPC 가 담당하므로 클라이언트 insert 정책은 불필요 |
| `README.md` | 설치 순서 갱신(schema.sql 은 정책을 만들지 않음, 폐기 파일 명시) |

회귀 테스트 2개 추가(`test-couple-isolation.mjs`, 총 12개):
"무조건 통과(true) 정책이 어느 커플 스코프 테이블에도 없다",
"레거시 SQL 파일에 무조건 통과 정책 텍스트가 남아 있지 않다"(정규식 정적 검사).
기존 "하드닝 전에는 couples 가 전체 공개" 시나리오는 이제 성립하지 않아
"add-couple-rls.sql 만으로도 couples 는 내 커플만 보인다"로 교체했다.

## 3. 구성원 0명 커플의 잔재 — 정리 완료 (운영 적용)

`supabase/migrations/20260912010000_cleanup_memberless_couple_places.sql` 작성 후
**사용자 승인 하에 운영 적용**(Supabase MCP `apply_migration`, 이력 등록됨).

- 대상: 구성원 0명 커플 2개(`06e10e74…`, `9a6f1c5a…`) — 2026-08-30 유출 복구 때 프로필만
  분리되고 데이터가 남은 케이스. 장소 3건(id 61·65·68, 사진·추억·코스 참조 전부 0),
  카테고리 14건(백필 시드), 커플 행 2건.
- 지운 이유: 지금은 아무도 못 읽지만 **커플 행과 invite_code 가 살아 있어** 누군가 그 코드를
  알면 `connect_couple()` 로 합류해 인계받을 수 있었다.
- 안전장치: 지우기 전 전체 행을 `datelog_private` 의 백업 테이블 3개로 복사(RLS on + revoke all).
  롤백 SQL 은 마이그레이션 파일 상단 주석에 있다.
- 적용 후 확인: 구성원 0명 커플 **0개**, couples 10→8, places 81→78, `places.couple_id is null` 0건,
  진식지민 커플(`a6b01b81…`)은 장소 57·카테고리 8로 **변화 없음**.

## 4. `place-photos` 루트 레거시 객체 65개 — 노출 위험은 이미 닫혀 있음(삭제하지 않음)

읽기 전용 감사 결과:

- 버킷 `place-photos` 는 **private**(`public=false`). 정책은 RESTRICTIVE 3개(인증 가드·커플 격리·
  소유자 가드) + PERMISSIVE 읽기/쓰기로, 읽기 조건이 `can_access_place_photo(name)` 이다.
- 그 함수는 (a) 새 경로 `couple/user/uuid.jpg` 이거나 (b) `place_photo_legacy_access` 에
  내 커플로 매핑된 이름일 때만 true. **루트 65개 전부 매핑돼 있다** → 커플 밖으로 새지 않는다.
- 65개 중 **58개는 지금도 실제로 쓰이는 사용자 사진**(장소 대표사진 50 + 추억 사진 8).
  **절대 삭제 대상이 아니다.**
- 나머지 7개는 미참조(2.9MB): 4개는 legacy ACL 의 `couple_id` 가 null 이라 아무도 못 읽고,
  3개는 살아 있는 커플 소유지만 어떤 행도 참조하지 않는다.

**삭제하지 않기로 판단했다.** 되돌릴 수 없는 사용자 사진 파일인데, 노출 위험은 0이고
회수 용량은 2.9MB 뿐이다. 참조 탐지(파일명 부분일치)가 한 건이라도 틀리면 사진이 영구 소실된다.

### 근본 원인 (새로 발견, 별도 과제)

**앱에 Storage 객체 삭제 경로가 아예 없다.** `src/lib/photos.ts` 의 `uploadPhoto()` 만 있고
`.remove()` 호출이 코드 전체에 0건이다. 그래서 사진을 바꾸거나 지워도 `image_url` 만 비워지고
파일(+최대 5장의 썸네일)은 버킷에 영구히 남는다. 2026-09-11 QA 가 남긴 고아 파일도,
위 미참조 7개도 전부 같은 원인이다. 고아 파일이 계속 쌓인다.

## 검증

- 스크래치 빌드 `npm run build` exit 0, 33 라우트(위 1번의 폰트 치환 조건).
- PGlite 격리 DB: `test-couple-isolation.mjs` **12개**, `test-membership.mjs` 12개,
  `test-preferences.mjs` 11개 통과.
- `node --test scripts/*.test.mjs` 62개 통과. `npx tsc --noEmit` 오류 0, `npx eslint` 오류 0.
- 운영: 위 3번 마이그레이션 적용 후 검증 쿼리 통과(구성원 0명 커플 0개).

## 남은 위험 / 다음

1. **사진 삭제 경로 구현** — 사진 교체·삭제 시 원본 + 썸네일까지 Storage 에서 지우는 경로.
   구현 후 미참조 파일 일괄 정리를 한 번 돌린다. (현재 미참조 7개는 그때 함께 처리)
2. `next/font/google` → `next/font/local` 자가호스팅 검토(빌드의 네트워크 의존 제거).
3. 운영 정리 마이그레이션의 백업 테이블 3개는 일정 기간 뒤 정리 대상.
4. push 는 아직 안 함.

---

# 커플 격리(RLS) 이상 현상 조사 — 원인 확정: RLS 정상, 테스트 세션 계정 혼선 (2026-09-12, commit/push 안 함)

관측(아래 Google Places 절에 기록된 건): 한 브라우저 세션에서 `/settings` 가 보여준 로그인 계정의
커플과 **다른 커플의 위시 장소(id=136)** 가 보이고 수정까지 허용됐다. 재현 실패.

## 결론 (운영 읽기 전용 조회로 확정)

**RLS 는 정상이었다. 격리 실패가 아니라 테스트 세션이 다른 계정으로 로그인된 상태였다.**

증거:

| 확인 | 결과 |
| --- | --- |
| public 스키마 전체의 `using(true)`/`with_check(true)` 정책 | **0건** — 정책 드리프트 없음 |
| `places`·`memories`·`memory_replies`·`courses`·`course_places` 정책 | 전부 `couple_id = my_couple_id()`, `to authenticated` 4종만 |
| `couples` 정책 | `select own`/`update own` (= security/02 하드닝이 운영에 살아 있음). 레거시 `couples: select authed` 없음 |
| RLS 활성화 | public 15개 테이블 전부 `true` |
| `places.id=136` 소유 | 커플 `a9fdc457`(구성원 1명, visited 2·wish 1 — 관측 기록과 일치) |
| `jasonhyun03` 프로필 소속 | `a6b01b81` 단 하나. `a9fdc457` 에 속한 적 없음 |
| 업로드된 테스트 사진 객체 | `place-photos/a9fdc457…/46746935…/f7d28518….jpg`, **owner = 46746935**(= `a9fdc457` 의 유일한 구성원), 761B, 2026-09-11 18:52:07Z |
| `jasonhyun03` 마지막 로그인 | 2026-09-11 **18:55:34Z** — 위 업로드 **3분 27초 뒤** |
| `46746935` 마지막 로그인 | 2026-09-09 07:27Z (세션이 리프레시로 09-11 까지 살아 있었음) |

Storage 객체의 `owner` 와 경로 prefix 가 둘 다 `46746935`/`a9fdc457` 이라는 것은, 그 업로드를
**그 계정의 JWT 로** 했다는 뜻이다(경로·owner 는 서버가 세션에서 결정). 즉 브라우저가 09-09 에
로그인해 둔 세션을 그대로 들고 있었고, 그 상태로 QA 가 진행됐다. 3분 뒤 `jasonhyun03` 으로
로그인하면서 `/settings` 만 진짜 계정을 보여준 것이다. `@supabase/ssr` 세션은 `path=/` 쿠키라
브라우저 프로필 하나에 세션도 하나뿐이라, 이 전환은 앱 전체에 동시에 적용된다.

**따라서 (B) 정책 드리프트 가설은 실측으로 배제됐다.** 아래 정적 분석은 왜 (A) 외에는 불가능한지의
근거로 남겨둔다.

## 이 QA 가 남긴 흔적 — 조치 완료

1. **고아 Storage 객체 1개 삭제 완료** — `place-photos/a9fdc457…/46746935…/f7d28518….jpg` (761B).
   `places.image_url` 에서는 지웠지만 파일이 남아 있었고 어떤 place·memory 도 참조하지 않았다.
   2026-09-12 사용자 승인 후 Supabase 대시보드 Storage 에서 삭제(파일 → 빈 폴더까지). 삭제 후
   `storage.objects` 재조회로 `a9fdc457%` 0건 확인. `storage.objects` 직접 DELETE 는
   `storage.protect_delete` 트리거가 막는다(뚫으면 S3 실제 파일이 고아로 남음) — 반드시 Storage
   API 또는 대시보드를 쓸 것.
2. `places.id=136` 의 `google_place_id` 는 그대로 둔다. 기능이 정상 동작할 때 어차피 쓰는 캐시
   값이고 정책상 저장 허용 범위 — 사용자 확인 완료.
3. `a9fdc457` 구성원(`ji***@naver.com`, 2026-09-07 가입)은 **우리 테스트 계정**임을 사용자가 확인.
   제3자 사용자 데이터 사고가 아니며 고지 대상 아님.

## 재발 방지 (제안)

- QA 는 전용 테스트 계정 + 전용 브라우저 프로필에서만. 에이전트와 사람이 같은 브라우저를 공유하지 않는다.
- 쓰기 동작 전에 `/settings` 로 **로그인 계정과 커플을 먼저 확인**하고, 확인한 값을 작업 기록에 남긴다.
- 실브라우저 QA 대상 장소 id 는 미리 "우리 커플 소유"임을 확인한 뒤 고른다.

## 부수적으로 확인된 것 (이번 건과 별개)

- 구성원이 0명인 커플 2개에 장소 3건이 묶여 있다(과거 유출 복구 때 분리된 잔재). 아무도 읽을 수
  없는 행이라 노출 위험은 없지만 정리 대상.
- `place-photos` 버킷 루트에 커플 스코프 이전의 레거시 객체 65개(2026-09-04 까지). 이미 별도
  과제로 추적 중(`place_photo_legacy_access`).

## 정적 분석 결론

저장소의 RLS(`add-couple-rls.sql`)만 놓고 보면 이 증상은 **한 세션 안에서는 성립할 수 없다.**
`/settings` 의 커플 표시와 `places` 정책은 둘 다 같은 출처(`profiles.couple_id where id = auth.uid()`,
`my_couple_id()`)에서 나오므로 같은 순간에 서로 다른 커플을 가리킬 수 없다. 페이지도 전부 클라이언트
컴포넌트라 서버 렌더 캐시가 남의 데이터를 실어 나를 경로가 없다(`app/**/page.tsx` 는 껍데기만,
데이터는 브라우저 Supabase 클라이언트가 현재 쿠키 세션으로 직접 조회). 서버 라우트는 전부
요청별 `createClient()` 이고, 전역 싱글턴 Supabase 클라이언트는 `"use client"` 모듈에서만 쓰인다.

따라서 남는 가능성은 둘뿐이다.

| 가설 | 내용 | 판별 방법 |
| --- | --- | --- |
| (A) 세션/계정 전환 | 관측 사이에 같은 브라우저(쿠키 저장소 공유)의 로그인 계정이 바뀌었다. `@supabase/ssr` 세션은 path=/ 쿠키라 브라우저 프로필 하나에 세션도 하나 — 사람과 에이전트가 같은 브라우저를 동시에 쓰면 정확히 이 증상이 난다. | `places.id=136` 의 `couple_id` 와 그때 그 브라우저 계정의 프로필 소속 확인 |
| (B) 운영 정책 드리프트 | 운영 DB 의 `places` 정책에 이름이 다른 `using(true)` 정책이 살아 있다. PERMISSIVE 정책은 OR 로 합쳐지므로 한 줄만 있어도 격리가 통째로 무효. | `pg_policies` 읽기 전용 조회 |

(B) 는 **가설이 아니라 이미 한 번 실제로 일어난 일**이다 — `categories` 가 정확히 이 구조로
`"categories: authenticated access" for all using(true)` 상태였고 2026-09-09(`048061c`)에 고쳤다.

## 조사 중 확인한 별개의 실제 결함 — 레거시 스크립트 재실행 구멍

`supabase/` 의 레거시 스크립트 4개가 커플 격리를 **되돌리는** 내용을 담고 있는데, 헤더에는
"여러 번 실행해도 안전"이라고 적혀 있었다.

| 파일 | 재실행 시 다시 생기는 것 |
| --- | --- |
| `schema.sql` | `places`/`memories` 에 `to anon, authenticated ... using(true)` SELECT·INSERT·UPDATE·DELETE — **익명까지** 전면 개방 |
| `policies_public.sql` | `places`/`memories` 공개 read·insert |
| `policies_open_write.sql` | `places`/`memories` 공개 update·delete |
| `add-couple-rls.sql` | `couples: select authed using(true)` — 모든 로그인 사용자가 **전체 커플 행 + `invite_code`** 조회. 초대코드를 알면 `connect_couple(이름, 코드)` 로 2명 미만인 남의 커플에 합류 가능 |

마지막 줄이 특히 위험하다. `security/02_enforce_membership.sql` 은 `couples` 정책을 전부 지우고
`couples: select own` 으로 교체하는데, `add-couple-rls.sql` 은 **이름이 다른** `couples: select authed`
를 다시 만들 뿐 `select own` 을 지우지 않는다 → 두 정책이 OR 로 공존 → 다시 전면 공개.
`security/README.md` 가 "레거시 스크립트 실행 방지 장치는 후속 작업이다"라고 남겨둔 항목이 이것이다.

## 변경 (코드만, 운영 미적용)

- `supabase/schema.sql` · `policies_public.sql` · `policies_open_write.sql` · `add-couple-rls.sql`
  네 파일 맨 앞에 가드 블록 추가: `to_regprocedure('public.connect_couple(text,text)')` 가 있으면
  (= security/01·02 로 하드닝된 DB) `raise exception` 으로 실행 중단. 신규 설치 DB 에는 RPC 가
  없으므로 걸리지 않는다(설치 순서 schema → add-couple-rls → … → 01 → 02 는 그대로 동작).
- `supabase/security/test-couple-isolation.mjs` **신규** — PGlite 격리 DB 회귀 테스트 10개.
  실제 `add-couple-rls.sql` 을 그대로 적용해 커플 A/B 격리(places·memories·memory_replies·
  courses·course_places SELECT/UPDATE/DELETE/INSERT, 미연결 계정, 익명)를 검증하고,
  02 하드닝 후 레거시 4개 스크립트가 실제로 차단되는지·차단 후에도 `using(true)` 정책이
  하나도 없는지까지 확인한다.
- `supabase/security/diagnose-couple-isolation-readonly.sql` **신규** — 위 (A)/(B) 판별용 읽기 전용
  진단 SQL. 장소명·주소·좌표·초대코드·이메일·사진 URL 은 조회하지 않는다. **2026-09-12 사용자 승인 후 Supabase MCP 로 실행 완료 — 결과는 위 "결론" 절.**

## 검증

- PGlite 격리 DB(운영 접속 없음): `test-couple-isolation.mjs` 10개 통과,
  기존 `test-membership.mjs` 12개 · `test-preferences.mjs` 11개 통과(가드 추가로 인한 회귀 없음).
- `node --test scripts/*.test.mjs` 62개 통과. `npx tsc --noEmit` 오류 0. `npx eslint` 오류 0.
- `npm run build` 는 **이 환경에서 실행 불가** — node_modules 가 macOS(darwin-arm64)로 설치돼 있어
  Cowork 로컬 Linux VM 에서 SWC 바이너리 로드 실패. 이번 변경은 SQL 파일과 테스트 스크립트뿐이라
  Next 빌드에 영향이 없지만, Mac Terminal 에서 한 번 확인 필요.

## 미검증 / 남은 위험

- ~~운영 DB 의 실제 정책 미확인~~ — 확인 완료(위 "결론"). 정책 드리프트 없음.
- 가드는 SQL Editor 로 파일 **전체**를 붙여넣어 실행하는 경우를 막는다. 파일 일부만 잘라 붙이면
  막지 못한다 — 운영 절차로 보완해야 한다.
- 브라우저 세션 자체의 로그는 없다. 결론은 Storage 객체의 `owner`·경로와 로그인 시각으로
  역추적한 것이며, 그 조합이 다른 설명을 허용하지 않는다고 판단했다.
- 기존 HANDOFF 최상단 두 절의 "commit/push 안 함" 기재는 stale — 실제로는 `4a35fdc`·`7e77774`
  로 커밋·push 완료(`origin/main` = `HEAD` = `7e77774`, 워킹트리 tracked 변경 없음). 문구 정정은 미실시.

## 다음

1. ~~고아 Storage 객체 삭제~~ · ~~테스트 계정 여부 확인~~ · ~~QA 절차 명문화(`AGENTS.md`)~~ — 완료.
2. 구성원 0명 커플 2개에 묶인 장소 3건 정리 여부 결정(읽을 수 있는 사람이 없어 노출 위험은 없음).
3. `place-photos` 루트의 레거시 객체 65개 정리(기존 별도 과제).
4. `places`/`memories` 도 `couples` 처럼 "남은 정책 전부 삭제 후 재생성" 방식으로 잠그는 마이그레이션 검토(예방).

---

# Google Places 자동 대표사진 (2026-09-12, 로컬 구현 완료 · 운영 SQL(컬럼 1개) 적용 · 실브라우저 검증 완료 · commit/push 안 함)

기준 문서: `GOOGLE_PLACES_PHOTO_FEATURE_HANDOFF.md`. AI 추천 고도화와 완전히 별개 기능 — 위 "AI 추천 고도화" 섹션은 이 작업으로 손대지 않았다.

**목표**: 사용자 사진이 없는 장소에 Google Places 사진을 그 자리에서 조회해 자동 표시. 사진 자체·URL·resource name은 절대 저장하지 않고 표시 시점마다 서버가 재조회(`google_place_id`만 캐시 — Google 정책상 캐싱 제한의 명시적 예외).

**2026-09-12 범위 확장(사용자 확정)**: 기준 문서는 위시리스트로 한정했지만, 실사용 중 "장소 추가했을 때 사진 첨부 안 한 경우에도 자동으로 들어가야 한다"는 요청으로 **다녀온 곳(visited)도 동일하게 적용** — `course_only`만 제외. `route.ts`/`PlaceCard.tsx`/`PlaceDetail.tsx`의 상태 조건을 `status === "wishlist"` → `status !== "course_only"`로 변경.

**구현**:
- `supabase/migrations/20260912000000_add_google_place_id.sql` — `places.google_place_id text` 1개. **사용자 승인 후 운영 적용 완료(Supabase MCP, `supabase_migrations` 이력에도 등록됨)**. RLS 변경 없음(기존 places RLS가 그대로 적용).
- `src/lib/places.ts` — `placeInputToRow`가 wishlist의 `image_url`을 무조건 null로 지우던 기존 동작을 발견 → wishlist만 예외로 열었다(course_only는 그대로 null). 이게 없으면 "사용자 사진이 항상 우선"이 애초에 성립 불가능했음.
- `src/lib/googlePlaceMatch.ts` — 순수 매칭 로직(좌표 300m 이내 AND 이름 유사). 좌표 없는 장소는 매칭 시도 자체를 안 함.
- `src/lib/googlePlacePhoto.ts` — 서버 전용. Text Search(Pro tier, photos 필드 요청 안 함) → Place Details(photos+googleMapsUri만, 가장 싼 Photos SKU) → Photo Media(데이터 URL로 반환). "확인했는데 없음(no_match)"과 "확인 자체 실패(error)"를 구분해서 반환 — 로그·재시도 판단에 씀. 같은 placeId 동시 요청은 in-flight Map으로 합침.
- `src/app/api/place-google-photo/route.ts` — POST { placeId }만 받고 서버가 DB에서 직접 name/address/lat/lng 조회(클라이언트가 임의 텍스트로 다른 장소 사진을 긁을 수 없게). 매칭 성공 시 `google_place_id`를 best-effort로 캐싱.
- `src/components/GooglePlacePhoto.tsx` — IntersectionObserver로 실제 노출될 때만 호출, 세션 메모리 캐시(새로고침하면 사라짐 — 영속 저장 아님). `PlaceCard.tsx`/`WishlistView.tsx`/`PlaceDetail.tsx`에 연결(사용자 사진 → Google 사진 → 기존 placeholder 순). `course_only`만 제외, 위시리스트·다녀온 곳 공통.
- `src/components/AddPlaceForm.tsx` — 위시리스트 상태에 최소 UI 추가("사진 없이 저장" / "내 사진 첨부"), 문서 §7 그대로.
- 손 안 댐(의도): `CourseDetail.tsx`(48px 인라인 썸네일이라 attribution 표시 공간이 없어 정책상 부적합), `RecapDashboard.tsx`(애초에 `image_url`을 조회하지 않아 Google 사진이 통계에 섞일 경로가 없음).

**검증**:
- 단위테스트(fixture/mock, 네트워크 없음) `scripts/google-place-match.test.mjs`(7개) + `scripts/google-place-photo.test.mjs`(7개, `global.fetch` mock으로 성공/이름불일치/5xx재시도/캐시스킵/캐시만료재매칭/동시요청합침 케이스) — 전체 62개 통과.
- `npx tsc --noEmit`, 변경 파일 `eslint` 0 에러. `npm run build` 통과(33개 경로, `/api/place-google-photo` 등록 확인).
- 클라이언트 번들에 `GOOGLE_PLACES_API_KEY` 문자열이 없음을 `.next/static` grep으로 확인(서버 청크에만 존재).
- **실제 API 키로 장소 1개(경복궁, 공개 랜드마크) 검증** — 매칭·사진·attribution·photo-level googleMapsUri까지 전부 실측 성공.
- **실브라우저 검증(실제 위시리스트 장소 1곳, id=136)**: 저장된 위시 → Google 사진 자동 표시 → 사진 클릭 시 정확히 그 장소·그 사진의 Google Maps URL로 새 탭 이동 → 테스트 사진 업로드 시 사용자 사진이 즉시 우선 표시(Google attribution 사라짐) → 사진 제거로 원상복구까지 확인. 확인 후 테스트로 올린 사진은 삭제해 실제 데이터는 건드리지 않음(`google_place_id` 캐시 값만 남음, 무해).
- **실브라우저 중 실제 버그 1건 발견·수정**: `GooglePlacePhoto.tsx`의 `useEffect` 의존성 배열에 `state.kind`가 들어있어, `load()`의 `setState({kind:"loading"})`가 그 즉시 effect를 재실행시키고 cleanup이 진행 중인 fetch의 `cancelled`를 true로 만들어 응답이 와도 무시되는 자기 자신을 취소하는 버그였음(API는 200으로 정상 응답하고 DB에 `google_place_id`도 정상 기록되는데 화면은 "불러오는 중…"에 멈춤). `state.kind`를 deps에서 빼고 "마운트 시점 캐시 여부"는 `useRef`로 따로 들고 가도록 수정, 재확인 완료.
- **범위 확장 실브라우저 검증(다녀온 곳, id=100 "서관면옥 교대본점")**: 사진 없는 실제 visited 장소에서도 Google 사진 자동 표시 확인.
- **테스트 중 발견한 무관한 이상 현상(이번 기능과 무관, 별도 기록만)**: 처음 접속한 브라우저 세션이 `/settings`가 보여주는 실제 로그인 계정(jasonhyun03, 커플 `a6b01b81`=JINJIM-0628, 다녀온 곳 46)과 다른 커플(`a9fdc457`, 다녀온 곳 2·위시 1, invite code가 UUID 형태라 다른 경로로 만들어진 듯한 소규모 커플)의 위시리스트 장소(id=136)를 보여주고 수정까지 허용한 순간이 있었음 — RLS(`couple_id = my_couple_id()`)상 정상이라면 안 보여야 함. 재현을 시도했으나 이후 세션은 계속 정상적으로 실제 계정 데이터만 보였고, 같은 브라우저를 사용자가 동시에 쓰고 있었을 가능성이 높아 세션/계정 전환으로 추정 — 이번 세션에서는 원인을 확정하지 못함. 재현되면 RLS 세션 격리 문제일 수 있으니 다음에 관찰되면 바로 보고할 것.

**미검증**:
- 매칭 실패(좌표 멀리 떨어진 동명 장소 등) 케이스의 실브라우저 확인은 안 함 — mock 테스트로만 커버.
- Photo Media(바이트 다운로드) 자체가 "Place Details Photos" SKU 외 별도로 과금되는지는 공식 문서에 명시가 없어 확인 못 함 — GCP 콘솔 실측 필요.
- Vercel 환경변수 `GOOGLE_PLACES_API_KEY`는 **사용자가 직접 추가함**(2026-09-12) — 배포 후 프로덕션에서의 동작은 미확인.

**다음**: commit/push는 사용자 확인 후. 실사용 보고 Text Search 반경(300m)·이름 유사 판정 기준 조정.

---

# AI 추천 고도화 — 6단계: "관심 없어요" (2026-09-11 로컬 구현 → 2026-09-12 운영 SQL 적용 확인 · commit/push 안 함)

`CLAUDE_AI_RECOMMENDATION_UPGRADE_HANDOFF.md` §6단계 이행. 구현 전 사용자와 확정한 정책 4가지:

| 항목 | 확정 |
| --- | --- |
| 개인 귀속 | **누른 사람에게만 숨긴다.** 파트너는 그대로 본다. RLS SELECT 를 `user_id = auth.uid()` 로 잠가 구조적으로 보장(앱 코드가 파트너 행을 "안 쓰는" 게 아니라 "못 읽는다"). |
| 사유 UX | **버튼 클릭 즉시 숨기고, 사유는 선택 사항.** 카드 자리에 "OO을(를) 숨겼어요 · [너무 멀어요][취향이 아니에요][이미 알아요] · 취소" 한 줄이 남는다. 사유 없이도 기록됨. |
| 재노출 기간 | **사유별 차등** — 취향이 아니에요 180일 / 이미 알아요 90일 / 사유 없음 90일 / 너무 멀어요 30일. "너무 멀어요"는 추가로 **거절했을 때의 출발지 1km 안에서 시작한 요청에서만** 숨긴다(영구 불호 아님 — 문서 §6 원칙). 사유를 나중에 고르면 그 사유 기간으로 "지금 기준" 만료를 재계산. |
| 취소 | **카드 자리 즉시 취소만**(1차). 설정 페이지의 "숨긴 추천" 목록은 이번 범위 아님. |

그 외 문서 §6 원칙 반영: 미저장·미클릭은 기록하지 않음(명시적 클릭에서만 POST). "이미 알아요"는 불호가 아님 — 재노출만 줄이고 **AI 프롬프트에는 어떤 거절도 전달하지 않는다**(후보 수집 단계 필터링만). 한 사람의 거절이 상대 선호를 지우지 않음(개인 귀속으로 자동 충족).

## 구현

| 파일 | 변경 |
| --- | --- |
| `supabase/migrations/20260911000000_ai_recommend_dismissals.sql` | **운영 적용 확인(2026-09-12, Supabase MCP로 직접 조회).** `ai_recommend_dismissals(id, couple_id, user_id default auth.uid(), candidate_id, mode, reason nullable check, origin_lat/lng, created_at, expires_at)`. `set_couple_id()` 트리거 재사용. RLS 4개 전부 `user_id = auth.uid()`(insert/update 는 `couple_id = my_couple_id()` 추가). 인덱스 `(user_id, expires_at desc)`. 테이블·인덱스·트리거·RLS 정책 4개 모두 운영에 존재하고 실사용 dismissal 1건(2026-09-11 17:32 UTC)이 이미 쌓여 있음을 확인 — 이전 세션이 "미실행"이라 남긴 기록은 stale. 이 세션에서 같은 SQL을 idempotent 재실행해 `supabase_migrations` 이력에도 등록함(전엔 SQL Editor 수동 실행이라 이력에 없었음). 롤백은 파일 상단 주석. |
| `src/lib/recommendationDismissal.ts` | **신규, 순수 로직.** 사유 상수·라벨, `DISMISS_DURATION_DAYS`, `TOO_FAR_ORIGIN_RADIUS_KM=1`, `dismissalExpiresAt`, `isDismissalActive`(만료 + too_far 출발지 근접 판정, 출발지 기록 없으면 보수적으로 숨기지 않음), `filterDismissed`. `haversineKm`(courses.ts) 재사용. |
| `scripts/recommendation-dismissal.test.mjs` | **신규.** 7개 — 사유별 기간, 사유 검증, 만료 경계, too_far 반경 안/밖(0.89km/1.11km)·다른 출발지(수원), 출발지 없음, 다른 사유는 출발지 무관, filterDismissed 순서 보존·만료 제외. |
| `src/app/api/ai-dismiss/route.ts` | **신규.** POST(기록, expires_at 서버 계산) / PATCH(사유 변경 + 만료 재계산) / DELETE(취소). 로그인 필수, zod 검증, 한국어 에러. 테이블 없음(PGRST205/42P01)은 "저장소가 아직 준비되지 않았어요"로 구분. user_id 검사는 RLS 에 위임. |
| `src/app/api/kakao-candidates/route.ts` | 요청자의 유효 거절(`expires_at > now()`)을 한 번 조회해 카카오 후보(`eligible`, **배분 전**이라 숨긴 자리를 다른 후보가 채움)와 위시 후보(`wish-<id>`) 양쪽에서 `filterDismissed`. 조회 실패는 rate limit 과 같이 막지 않고 통과(가용성 우선, 로그만). 기존 tally 로그에 `dismissed` 건수 추가(식별정보 없음). |
| `src/lib/useAiDismiss.ts` | **신규.** 장소 상세·코스 공용 클라이언트 훅: 낙관적 숨김 → POST, 실패 시 카드 복구. setReason(PATCH)·undo(DELETE)·reset(새 목록 시 로컬만 초기화, 서버 기록 유지). |
| `src/components/AiDismissedNotice.tsx` | **신규.** 카드 자리에 남는 한 줄(사유 칩 3개 + 취소). 서버 id 오기 전엔 버튼 비활성. `compact` 변형은 코스 리스트용. |
| `src/components/AiRecommendationCard.tsx` | `onDismiss` 옵션 prop → "관심 없어요" 버튼(QA 미리보기는 prop 안 넘기므로 영향 없음). 2026-09-12 UI 반복: (1) 사진 없는 카드에서 상단 플레이스홀더와 하단 "사진 ↗"가 같은 네이버 이미지 검색 URL로 중복 연결되던 것 수정 — "사진" 버튼은 `imageUrl`이 실제로 있을 때만 노출. (2) 액션 버튼(사진/위시리스트/정보) `min-w-0` 누락으로 좁은 화면에서 텍스트가 카드 `overflow-hidden`에 잘리던 것 수정 — 각 버튼에 `min-w-0` + `truncate` span 적용. (3) "관심 없어요"를 액션 버튼 줄과 별도로 카드 하단 전체 폭 중앙 정렬 텍스트 버튼으로 배치(기본 상태에서도 보이도록 hover 의존 스타일 제거). |
| `src/components/AiRecommendationSection.tsx` | 숨긴 후보를 그리드에서 빼고(뒤 후보가 앞으로) 아래에 notice 나열. "더보기" 조건을 남은 후보 기준으로. 전부 숨기면 안내 문구. `load()` 가 로컬 숨김 상태 초기화. 기준점 = 그 장소 좌표. |
| `src/components/CourseForm.tsx` | 동일 패턴. "정보 ↗" 옆에 "관심 없어요". 기준점 = 마지막 정거장(`aiOriginCoord` ref, resolveCoord 결과). `aiInputKey` 효과에서도 숨김 상태 초기화. 위시 후보도 숨길 수 있음(위시 자체는 남음). |

## 검증

- **통과(이 세션, Anthropic 클라우드 작업공간의 `origin/main` 동일 복제본)**: 순수 로직 단위테스트 `node --test --import ./scripts/register-ts-extension-hook.mjs scripts/*.test.mjs` → **41개 통과**(기존 34 + 신규 7).
- **통과(Mac 작업 트리, Cowork 로컬 VM에서 실행)**: `npx tsc --noEmit` 오류 0, 변경 파일 8개 `npx eslint` 오류·경고 0, 단위테스트 41개 통과.
- **통과(2026-09-12, Mac Terminal)**: `npm run build` 정상 완료(32개 경로).
- **통과(2026-09-12, Supabase MCP로 운영 DB 직접 조회)**: `ai_recommend_dismissals` 테이블·컬럼·인덱스(`ai_recommend_dismissals_user_expires_idx`)·트리거(`trg_ai_recommend_dismissals_couple_id`)·RLS 정책 4개(select/insert/update/delete, 전부 `user_id = auth.uid()`) 전부 운영에 존재. 실사용 dismissal 1건(2026-09-11 17:32 UTC 생성) 확인 — 누군가 실제로 "관심 없어요"를 눌러 정상 기록됐다는 뜻. `supabase_migrations` 이력에는 없어(SQL Editor 수동 실행 추정) 이 세션에서 동일 SQL을 idempotent 재실행해 이력에 등록.
- **미검증 — 브라우저(이 세션 기준)**: 사유 선택 PATCH · 취소 DELETE · 카드 복귀, 그리고 "다시 추천받기"에서 숨긴 후보가 실제로 재노출되지 않는지(코드·DB 상태로는 정상 작동해야 함, but 직접 클릭 재현은 안 함). 파트너 계정으로 같은 후보가 그대로 보이는지(개인 귀속, RLS 정책상 보장되어야 함).
- **미검증 — RLS 실측**: 파트너 세션에서 남의 행 SELECT 0건 / PATCH·DELETE 0건 매치를 별도 세션으로 재현하지 않음. 격리 DB 테스트(PGlite)는 작성하지 않음.
- 운영 SQL 적용 확인됨(위 참고). **commit/push/배포는 아직 안 함** — 로컬 워킹트리에 다수 미커밋 변경 존재.

## 다음

1. ~~Mac Terminal 에서 `npm run build` 통과 확인~~ — 완료.
2. ~~운영 SQL 적용~~ — 완료(이미 적용되어 있었음, 2026-09-12 idempotent 재실행으로 이력 등록까지 마침).
3. 위 "미검증 — 브라우저" 항목 실측 → commit/push.
4. 표본 없이 정한 값들(기간 4종, 1km 반경)은 실사용 보고 조정. 설정 페이지 "숨긴 추천" 목록은 필요해지면 2차.

---

# categories 커플 스코프 분리 (2026-09-09, 운영 SQL 실행·검증 완료 — commit/push 진행)

**배경**: 커플 10개 중 2팀은 실제 사용자(친구 커플, 가족) — 테스트 계정 전제가 무효화됨. 운영 직접 조회로 `categories` 정책이 `"categories: authenticated access" for all using(true) with check(true)`임을 확인 — 로그인한 누구나 모든 커플의 카테고리를 읽고 수정·삭제 가능했다. `add-couple-rls.sql`/`02_enforce_membership.sql` 둘 다 "카테고리의 커플별 분리는 별도 제품 결정"이라며 의도적으로 미뤄뒀던 부분. 위험은 삭제가 아니라 이름 변경 — 다른 커플이 "맛집"을 바꾸면 내 `places.category`(문자열, FK 없음)는 그대로 남아 필터·AI 추천 검색어가 조용히 어긋난다.

**진단 핵심**: `CategoriesProvider`/`CategoriesManager`의 모든 read/write가 이미 `couple_id` 조건 없이 순수하게 동작해, RLS만 교체하면 **앱 코드 변경 없이** 커플 스코프가 적용됨을 확인. `places` rename-cascade(`places.update({category}).eq("category", cat.name)`)도 `places` 자체의 기존 RLS(`couple_id = my_couple_id()`)가 이미 다른 커플 행을 걸러줘 별도 수정 불필요.

**실행 파일 2개**(둘 다 `supabase/migrations/`, 운영 실행 완료):
1. `20260909000000_categories_couple_scope.sql` — `couple_id` 컬럼 추가 → unique 제약을 `(couple_id, name)`으로 교체 → 시드 7개(쇼핑 제외) 전체 10개 커플에 백필 → "쇼핑"은 진식지민 커플(`a6b01b81-3d74-43ef-92dd-4dbd00ba7123`, 사용자가 조회로 직접 지정)에만 백필 → 원본 공유 8행 삭제 → `couple_id NOT NULL` 잠금 → 인덱스 → `set_couple_id()` 트리거 재사용 → RLS를 `places`와 동일한 4-정책 패턴으로 교체. 롤백용 백업 테이블(`categories_pre_couple_scope_backup`)은 RLS+revoke all로 잠가둠.
   - **1차 실행 실패·수정**: 유일성 제약 교체를 백필보다 뒤에 뒀다가 `duplicate key value violates unique constraint "categories_name_key"`로 트랜잭션 전체 롤백(사용자 실측, 데이터 안전 확인됨). 원인: 전역 `unique(name)`이 살아있는 채로 10개 커플에 같은 이름을 반복 삽입해 두 번째 커플에서 충돌. 수정: 제약 교체를 `couple_id` 컬럼 추가 직후, 백필 이전으로 이동(원본 8행은 전부 `couple_id is null`이라 Postgres UNIQUE의 NULLS DISTINCT 기본 동작으로 서로 충돌하지 않음 — 안전하게 먼저 교체 가능). 재검토한 3가지(cross join 서브쿼리의 자기-삽입 재참조 여부, NOT NULL 잠금 위치, 트리거의 백필 개입 여부) 전부 문제없음 확인 후 재실행 성공.
2. `20260909000100_categories_seed_on_couple_create.sql` — `connect_couple()` RPC의 신규 커플 생성 분기에 시드 7개(쇼핑 제외) insert 추가. 마이그레이션 후 신규 가입 커플이 `categories` 0행 상태에서 `/settings/categories`의 이름변경·삭제·순서변경이 (음수 합성 fallback id로 인해) 에러 없이 조용히 무반응하는 문제를 막기 위함. 같은 트랜잭션에 안 넣은 이유: 온보딩 관심사 vs categories 스키마 관심사 분리(이 프로젝트 기존 파일 구성 관례).

**검증**: 사용자가 SQL Editor에서 직접 실행 후 파일 하단 검증 쿼리(커플별 카테고리 수, places.category와 categories 이름 대응, 원본 공유 행 삭제 여부, 쇼핑 소속)로 확인 완료. 구체적 쿼리 결과값은 이 세션에 기록되지 않음(사용자가 직접 확인).

**미검증**: 신규 커플 가입 플로우(2번 파일)로 실제 새 커플을 만들어 카테고리 7개가 심어지는지는 실제 가입으로 재현하지 않음 — RPC 정의만 교체 확인. 마이그레이션 커밋 순간 `/categories` 편집 폼을 열어둔 사용자가 있었는지는 알 수 없음(가능성은 극히 낮다고 판단했던 부분, 재확인 안 함).

**앱 배포**: 불필요(위 진단 참고, 코드 변경 자체가 없음) — 이번 작업은 SQL만으로 완결.

---

# AI 추천 고도화 — 5단계: 우리 위시 활용 (2026-09-09 완료 — commit `3c34e22`, 현재 `origin/main` 포함)

`CLAUDE_AI_RECOMMENDATION_UPGRADE_HANDOFF.md` §5 "코스 구성에는 우리 위시리스트를 별도 후보로 포함한다. 현재 전체 저장 장소 제외 로직을 목적별로 조정한다"·"새로운 발견과 재방문 추천은 구분하고, 이미 아는 장소를 새로 발견한 것처럼 표시하지 않는다" 이행. §3단계(배분 정책)는 이 작업으로 완전히 닫혔다(아래 3단계 후속 절 참고).

**트레이드오프(명확히 남김): 위시 슬롯은 공짜가 아니다.** kakaoLimit을 20→18로 줄이면 하이디라오 케이스에서 용가회전훠궈가 실제로 밀려나는 것을 snapshot 재생으로 확인했다(아래 "사용자 확인 3건 실측" 3번). 위시가 없으면 비용은 0(동적 크기 조정 — kakaoLimit이 그대로 20 유지). `WISH_MAX_SLOTS` 조정 시 이 트레이드오프를 반드시 함께 고려할 것.

## 설계

- 기존 "전체 저장 장소 카카오 후보 제외" 로직(`kakao-candidates/route.ts`)은 그대로 둔다 — 위시도 카카오 검색에서 "새 발견"인 척 다시 뜨면 안 되므로. 대신 위시는 우리 DB(`places`, `status='wishlist'`)에서 **직접** 읽어 별도 후보로 주입한다.
- 위시는 `allocateBySourceKind`(specific/base) 경쟁에 절대 안 섞는다 — 카카오 검색 결과가 아니라 제3의 출처이고, "이미 가고 싶다고 표시한 곳"이라 카카오 후보와 관련도를 겨룰 이유가 없다는 사용자 판단(확정). 전체 한도(20)에서 `WISH_MAX_SLOTS`만큼 먼저 예약해 떼어주고, 나머지만 기존 로직에 그대로 넘긴다. 위시가 없으면(0개) 카카오 쪽 한도가 그대로 20 유지된다 — 억지로 채우지 않음(§3단계 원칙 재사용).
- `alreadyOnWishlist`/`wishPlaceId` 필드를 카카오-후보 응답 → AI 프롬프트 → 최종 추천 응답까지 그대로 통과시킨다. 검색어 출처 메타(specific/base, 사용자에게 숨겨야 함)와 달리 이건 **사용자에게 그대로 보여줘야** "이미 아는 장소를 새로 발견한 것처럼" 오표시하지 않는다 — 의도적으로 다르게 처리.
- 코스에 "+ 추가" 시 위시 후보는 기존 수동 추가 버튼(`pickButton`)과 같은 경로(`addToCourse(기존 id)`)로 바로 담는다 — 새 `places` row를 insert하지 않는다(중복 방지).
- place_detail 모드(장소 상세 페이지 AI 섹션)는 범위 밖 — 문서 §5 문구가 "코스 구성"으로 명시돼 있어 스코프를 넓히지 않았다.

## 구현

| 파일 | 변경 |
| --- | --- |
| `kakao-candidates/route.ts` | `WISH_MAX_SLOTS=2`(상수, 표본 없이 정한 초기값 — 주석 명시) 신설. `excludePlaceIds` 스키마 추가(현재 코스에 이미 담긴 장소 id). `ownPlaces` 조회에 `id/name/category/address/lat/lng` 추가(기존엔 `kakao_map_link`만). `mode==="course"`일 때 `status='wishlist'`+좌표 있음+`excludePlaceIds` 제외 행을 KakaoCandidate 모양(`id:"wish-"+행id`)으로 매핑해 거리·근접 필터(기존 `withDistance`/`excludeNearSelf` 재사용) 적용, 가까운 순 최대 2개 선정. `kakaoLimit = 전체한도 - wishPicked.length`로 줄여 `allocateBySourceKind` 호출. 최종 `candidates`에 `alreadyOnWishlist`/`wishPlaceId` 부착. |
| `ai-recommend/route.ts` | `CandidateInputSchema`에 `alreadyOnWishlist`(bool, default false)·`wishPlaceId`(옵션) 추가, 프롬프트 payload·최종 `recommendations`에 그대로 통과. |
| `recommendationPrompt.ts` | `SHARED_RULES`에 규칙 추가: "alreadyOnWishlist=true 후보는 '새로 발견'이 아니라 '위시를 이번에 코스에 넣기'로 표현, 안 맞으면 억지로 고르지 않는다." |
| `CourseForm.tsx` | `excludePlaceIds: placeIds`를 카카오 후보 요청에 포함(useCallback deps에 `placeIds` 추가). `addAiCandidate`에서 `alreadyOnWishlist`면 insert 없이 `addToCourse(wishPlaceId)`만 호출 후 목록에서 제거. 카드에 `statusBadgeClass("wishlist")`/`statusLabel("wishlist")` 배지 추가. |

## 사용자 확인 3건 실측

1. **WISH_MAX_SLOTS=2, 표본 없음**: 코드 주석에 "표본 없이 정한 초기값, 실사용 보고 조정"으로 명시.
2. **excludePlaceIds 실동작**: 실제 브라우저(진식 계정)로 코스를 만들어 확인 — 쿄오모라멘→위시 "미래빌딩"(전시, 288m) 추가 후 재추천 시 미래빌딩이 다시 뜨지 않음을 확인(아래 검증 절 참고).
3. **위시 슬롯 예약이 기존 정답지에 주는 비용 — snapshot 재생(추가 API 호출 없음, 기존 collectCandidates 1회 재사용)**: kakaoLimit을 20→18로 줄여 재생한 결과, 쿄오모라멘의 129라멘하우스는 생존했지만 **하이디라오 케이스에서 용가회전훠궈("맛집" 9위)가 실제로 밀려남**(일석삼조는 생존). 즉 위시 슬롯 확보는 공짜가 아니다 — 실제로 위시 후보가 있을 때만 카카오 쪽 한도가 줄고, 그 대가로 기존 답 하나를 잃을 수 있음을 확인했다. 그럼에도 진행한 이유: 위시가 없으면 비용이 0(동적 크기 조정), 그리고 위시 활용 자체가 §5단계의 명시적 목표라 이 정도 트레이드오프는 감수하기로 함(사용자 승인). `WISH_MAX_SLOTS` 조정 시 이 비용도 함께 재확인할 것.

## 실제 브라우저 검증(진식/지민 실계정)

"위시 테스트 코스"(저장 안 함, 취소로 폐기)로 확인:

- 쿄오모라멘을 1번 장소로 담고 "우리 취향으로 추천" 실행 → 후보 카드에 **"전시 · ✦AI · 위시리스트" 배지 + "미래빌딩"(288m)**이 실제로 뜸. reason: "...위시에 담아둔 전시 카테고리의 미래빌딩이 쿄오모라멘에서 288m 거리에 있어 코스에 넣기 좋습니다" — "새로 발견"이 아니라 "위시에 담아둔"으로 정확히 표현됨(프롬프트 규칙 적용 확인).
- "+ 코스에 추가" 클릭 → 로딩 스피너 없이 즉시 코스 2번에 "전시 · 위시리스트" 배지로 추가됨(insert 경로를 안 타는 동기 처리와 일치) — insert 여부는 코드 리뷰로도 확인(early return, supabase.insert 호출 없음).
- 이어서 다시 "우리 취향으로 추천" 실행(origin이 미래빌딩으로 바뀜) → 미래빌딩이 재등장하지 않음(excludePlaceIds 정상 동작), 새 카카오 후보(리프커피/인생사진무인카페인형뽑기)만 표시됨.
- 브라우저 콘솔 에러 없음(추적 시작 이후).
- 테스트로 만든 코스는 "취소"로 폐기 — 코스 6개·위시 4개 그대로 복원 확인(DB 잔여 데이터 없음).

## 검증

`npx tsc --noEmit`/ESLint(0 error, 기존 무관 경고 3건만) 통과. 기존 단위테스트 34개 전부 통과. `npm run build`(31개 라우트) 통과. place_detail 모드(`AiRecommendationSection.tsx`)는 변경 없음 — 회귀 없음(코드상 위시 관련 필드 자체를 안 건드림).

**미검증**: 위시가 실제로 AI 추천 출력(count 개수 안)에 매번 포함되는지는 보장하지 않는다 — AI가 조건에 안 맞으면 고르지 않을 수 있음(의도된 동작, 프롬프트에 "억지로 고르지 마세요" 명시). WISH_MAX_SLOTS=2가 실사용에 적절한지는 더 지켜봐야 한다.

---

# AI 추천 고도화 — 3단계 후속: 출처 보존 + 배분 정책 (2026-09-08, 로컬 완료 — commit/push 안 함)

문서 3단계 미이행 경고("검색어·정렬·원래 순위 등 후보 출처를 보존한다. 여러 API 목록을 합친 순서를 전체 정확도순이라고 간주하지 않는다") 이행. 아래 "3단계(후보 수집 개선)" 절의 32건/12건 트렁케이션이 "먼저 붙은 검색어가 자리를 다 먹는" 구조인지 진단 요청에서 시작했다.

## 진단: 실제로는 "검색어 선점"이 아니라 "카테고리 그룹핑"이 원인

`collectCandidates`의 라운드로빈 병합 자체는 순위 단계별로 공평하다. 문제는 그다음 `diverseCandidates`가 **카테고리**로 그룹을 묶어 자른다는 점 — 구체 검색어(예: "일본식라면")가 한 카테고리(일식)로 쏠리면, 그 카테고리의 후순위 항목만 계속 잘린다. 쿄오모라멘 실측(n=3, 안정): specific("일본식라면") 생존율 50%, base("맛집") 생존율 90.9% — 문서 3단계가 원래 살리려던 "먼 곳도 후보에" 취지와 반대로, 새로 추가한 구체 검색어 쪽이 더 많이 잘렸다.

## 구현: 출처 메타 + 배분 정책

- `src/lib/kakaoLocal.ts`의 `collectCandidates`가 이제 `{ candidates, sources }`를 반환한다. `sources: Map<id, {query, kind, sort, rank}>` — **후보 객체 필드가 아니라 별도 Map**으로만 관리해 응답 바디·AI 프롬프트로 흘러들 구조적 경로 자체를 없앴다(내부 라벨 유출 사고 재발 방지, §0단계 원칙과 동일 취지). `kind`는 `"specific"(deriveSpecificSearchTerm 결과) | "base"(그 외 전부)` 둘뿐 — 정렬(accuracy/distance)은 가중치 차원에 넣지 않았다(지역마다 distance 기여도가 0~4건으로 들쭉날쭉해 차원을 늘리면 실험 공간만 커짐, 사용자 지시).
- `src/lib/recommendationPolicy.ts`에 `MIN_SPECIFIC_SLOTS = 10`(상수 분리) + `allocateBySourceKind()` 신규. 배분: `specific 몫 = max(MIN_SPECIFIC_SLOTS, limit의 절반)`, 나머지는 base가 채우고, base 풀이 모자라면 남는 슬롯만 specific 잔여 후보로 채운다. 각 kind **내부**에서는 기존 `diverseCandidates`(카테고리 다양화)를 그대로 재사용 — 이미 확보된 후보의 재배분일 뿐 새 후보를 만들지 않는다(§3단계 지시 준수).
  - **시행착오**: 처음엔 "specific 최소분만 먼저 떼고, 남은 specific+base를 합쳐서 다시 카테고리로 나눈다"로 짰다가 실측에서 과교정을 발견했다 — 합친 나머지 라운드가 다시 카테고리 다양성으로 돌면서, specific의 카테고리 폭(일식/아시아음식/술집/중식)이 base의 폭(한식 편중)보다 넓다는 이유로 나머지까지 더 가져가 specific 65% vs base 63.6%로 역전됐다(가까운 base 후보 3건이 대신 잘림). kind 간 배분은 kind 단계에서 한 번만 정하고 category 다양화는 각 kind 내부로 한정하는 현재 구조로 수정해 해결.
- `src/app/api/kakao-candidates/route.ts`: `collectCandidates` 새 반환 형태에 맞춰 갱신, 트렁케이션을 `diverseCandidates` → `allocateBySourceKind`로 교체. 응답 바디(`{ candidates }`)는 이전과 필드 동일 — `sources`는 검색어 종류별 후보/생존 건수만 `console.log`로 남기고(장소명·좌표·couple_id 없음) 응답에는 포함하지 않는다.
- 기존 `scripts/eval/diagnose-candidates.mjs`도 새 시그니처에 맞춰 호출부만 수정(로직 변경 없음).

## 실측 검증 (쿄오모라멘, n=3 — 카카오 인덱스 변동 고려해 3회 반복, 값 완전히 안정)

| | 풀 | BEFORE(카테고리만) | AFTER(최소슬롯+나머지균등) |
| --- | --- | --- | --- |
| specific("일본식라면") | 20 | 10건(50%) | 10건(50%) |
| base("맛집") | 11 | 10건(90.9%) | 10건(90.9%) |

합계는 우연히 같지만(10/10) **개별 후보가 바뀌었다** — BEFORE는 "조선라멘"(630m)을 살렸고 AFTER는 "미카 옥수점"(1082m, 술집)을 살린다. 정답지 "129라멘하우스"(302m)는 BEFORE/AFTER 모두 생존. 이 새 배분이 우연한 무변화가 아니라 실제로 하한을 강제하는지는 황재벌 풀로 기계적으로만 재확인(정답지 검증 목적 아님 — 아래 참고): 황재벌은 BEFORE `specific=9/base=11`로 이미 최소선 아래였고, AFTER는 정확히 `specific=10/base=10`으로 교정됨을 확인했다.

**⚠️ 조건부 관계 — 이 배분 정책은 specific 검색어가 실제로 유용할 때만 이롭다.** 황재벌의 BEFORE 9→AFTER 10 교정은 `allocateBySourceKind`가 의도대로 작동한 증거이지만, 그 specific 검색어가 하필 "장어"(아래 절 참고, 잘못 도출된 값)였다. 즉 이 사례에서 배분 정책은 **"틀린 검색어(장어)의 후보를 한 자리 더 밀어준 것"**과 같다 — 배분 로직 자체는 옳게 작동했지만, 입력(specificTerm)이 나쁘면 결과도 나쁘다. `allocateBySourceKind`는 "specific 출처가 base보다 부당하게 적게 살아남지 않게" 보장할 뿐, "specific 검색어가 실제로 좋은 후보를 데려오는지"는 전혀 보장하지 않는다 — 이건 `deriveSpecificSearchTerm`(검색어 생성 단계)의 책임이며, 배분 정책보다 상류에 있다. 따라서 배분 정책의 실효는 검색어 생성 품질에 의존한다(아래 "deriveSpecificSearchTerm 최심 리프 문제" 절 참고, 이 문제를 5단계보다 먼저 처리하기로 함).

`npx tsc --noEmit`/ESLint(0 error) 통과, 기존 단위테스트 34개(kakao-local 8 + recommendation-policy 7 + recommendation-feedback 3 + recommendation-prompt 2 + taste-profile 14) 전부 통과, `npm run build`(31개 라우트) 통과.

## 황재벌 사례 — 정정: 기준 장소 자체가 틀렸음 (아래 "정정" 절 참고)

**이 절 전체가 잘못된 전제 위에 있었다.** 처음엔 사용자가 준 강남 실제 단골 장소(황재벌, 서울 서초구 남부순환로347길 42-4=양재역 인근, kakao id 15862367)를 기준으로, 정답 후보 3곳(용가회전훠궈/일석삼조버섯매운탕/칠프로칠백식당)이 131~396m 거리에 있다고 가정하고 진단했다. self-lookup은 실제로 성공했고 `category_name = "음식점 > 한식 > 해물,생선 > 장어"`에서 `deriveSpecificSearchTerm`이 최심 리프 규칙으로 **"장어"**를 뽑은 것도 사실이다 — 하지만 이후 "칠프로칠백식당이 장어 대신 육류,고기였으면 잡혔을 것"이라는 추론은 **성립하지 않는다.** 좌표로 직접 재계산한 결과 이 3곳은 황재벌(양재)에서 실제로 1.8~2.3km 떨어져 있었다(사용자가 기억한 131/396/257m가 아니었다) — 애초에 황재벌 근처가 아니었다. 아래 "정정: 하이디라오 서초점" 절이 올바른 재검증이다. 다만 self-lookup이 "장어"를 뽑은 것 자체와 그것이 좁은 틈새 업종이라는 관찰은 사실로 남지만(별도 문제로만), **"이것 때문에 3곳을 놓쳤다"는 인과관계는 틀렸다** — 애초에 놓칠 수 없는 거리였다.

## 정정: 하이디라오 서초점이 진짜 기준 장소 (사용자 확인 + 좌표로 검증)

사용자가 "하이디라오 서초점이 유력해보이네"라고 제안, 실제 좌표(37.502564150766105, 127.02480140187946)로 3곳과의 거리를 계산하니 **131m/396m/257m로 정확히 일치**했다(사용자가 애초에 기억한 숫자 그대로). 이 좌표로 실제 파이프라인을 재현했다(n=3, 안정):

- self-lookup 성공: `category_name = "음식점 > 샤브샤브"` → 파생 검색어 = **"샤브샤브"**. 이번엔 정답 후보 중 하나(일석삼조버섯매운탕, 샤브샤브)와 카테고리가 실제로 일치한다 — `deriveSpecificSearchTerm`이 **정확하게 작동**한 사례.
- 풀 33건(specific 19/base 14). 3곳 중 2곳 생존, **BEFORE(기존 diverseCandidates)와 AFTER(allocateBySourceKind) 결과 완전히 동일** — 이 사례에서 배분 정책 변경으로 인한 회귀는 없다:
  - 용가회전훠궈(중식, 131m): 쿼리="맛집"(base) accuracy 9위 → BEFORE/AFTER 둘 다 생존.
  - 일석삼조버섯매운탕(샤브샤브, 396m): 쿼리="샤브샤브"(specific) accuracy 4위 → BEFORE/AFTER 둘 다 생존.
  - 칠프로칠백식당(한식, 257m): **이번 풀에 없음** — 원인 추적: "맛집" accuracy 45건까지 넓혀 보니 정확히 **16위**(현재 `limitPerCall=15`/`maxPages:1`이라 한 칸 차이로 컷). 참고로 "한식"(13위)·"육류,고기"(7위)·"고기"(4위)라면 쉽게 잡혔겠지만, 하이디라오는 샤브샤브 전문점이라 self-lookup 기반 파생으로는 "고기"/"한식"이 나올 수 없다 — **이건 리프 선택 문제가 아니라 base 쿼리의 15위 컷오프(page 1건) 문제**, 카테고리 다른 별개 원인이다.

## 결론 — deriveSpecificSearchTerm을 5단계보다 먼저 고쳐야 한다는 근거가 무너짐

사용자가 우선순위를 재조정한 3가지 이유 중:
1. "배분이 검색어 품질에 의존한다" — 원칙적으로는 여전히 참(설계상 `allocateBySourceKind`는 specific 검색어의 품질을 보장하지 않는다), 하지만 지금까지 실측한 2건(쿄오모라멘·하이디라오) **모두** specific 검색어가 실제로 유용했던 성공 사례였다 — 나쁜 검색어가 실제 피해를 낸 확인된 사례가 아직 없다.
2. "표본 2건 중 1건(황재벌)에서 어제보다 후퇴" — **틀린 기준 장소로 인한 오판이었음이 확인됨.** 올바른 장소(하이디라오)로는 회귀가 없다(BEFORE=AFTER).
3. "검색어는 없던 후보를 만드는 유일한 레버" — 원칙은 맞지만, 이번에 실제로 놓친 유일한 후보(칠프로칠백식당)는 검색어 문제가 아니라 base 쿼리 페이지 컷오프(15위 vs 16위) 문제였다.

즉 `deriveSpecificSearchTerm` 최심 리프 문제를 5단계보다 먼저 처리해야 한다는 근거는 실측으로 뒷받침되지 않는다 — 오히려 지금까지 확인된 유일한 근접 누락은 별개의, 더 작은 문제(base 쿼리 15건 제한)다. 어떻게 진행할지는 사용자 판단에 맡긴다(다음 메시지에서 확인).

## base 쿼리 2페이지(30건) 확장 — 진단 결과 기각(구현 안 함)

칠프로칠백식당이 "맛집" accuracy 16위(현재 15건 컷오프 바로 밖)였다는 관찰에 따라, base 쿼리만 `maxPages:2`(30건)로 넓히면 잡힐지 실측했다(코드 수정 없이 `searchKakaoPlaces`/`diverseCandidates`/`allocateBySourceKind`를 그대로 불러오는 진단 스크립트로만 시뮬레이션, n=1 취약성을 의식해 하이디라오+쿄오모라멘 두 origin 모두 확인).

- **API**: `maxPages`는 기존에도 지원되던 파라미터(카카오 페이지당 15건, `pageable_count` 상한 45 = 최대 3페이지). base만 2페이지로 늘리면 origin당 호출이 4회→6회(specific 2 + base 4) — 쿼터(100,000건/일) 대비 무시할 수준.
- **하이디라오 재검증**: base 풀이 14건→41건으로 늘고, 칠프로칠백식당(한식, accuracy 16위)이 실제로 풀에 들어왔다. **그런데도 BEFORE·AFTER 둘 다 최종 20건에서 잘렸다.** 원인: `allocateBySourceKind`가 base 몫을 `limit/2=10`으로 고정하는데, base 풀이 41건(카테고리 10종 이상)으로 늘면서 "한식" 카테고리 내부 경쟁만 심해졌을 뿐 — 칠프로칠백식당은 한식 그룹 안에서 여전히 뒤쪽 순번이라 10개 몫에 못 들었다. **즉 15위 컷오프는 원인이 아니었다 — 진짜 병목은 base 몫 10건 고정이다.** 페이지를 더 넓혀도(30위, 45위…) 이 특정 후보가 자기 카테고리 그룹 안에서 앞쪽으로 올라오지 않는 한 구조적으로 안 잡힌다.
- **노이즈**: 새로 들어온 16~30위 base 후보 27건 중 다수가 스타벅스 3개 지점·투썸플레이스·메가MGC커피처럼 "맛집"이라기보다 어디에나 있는 프랜차이즈 카페였다 — 딱히 유용하지 않은 후보가 늘었을 뿐 정답 회수에는 기여하지 못함.
- **쿄오모라멘 회귀 확인**: 129라멘하우스는 specific("일본식라면") 출처라 base 쿼리 깊이와 무관 — depth=2에서도 정상 생존, 회귀 없음. 다만 base 풀도 11건→34건으로 늘면서 AFTER가 뽑는 base 10건의 구성 자체는 바뀌었을 것(개별 후보까지는 비교 안 함, 회귀 확인 목적은 달성).
- **n=1 판단**: 이번 한 번의 근접 누락(16위)이 우연인지 구조적인지 판별할 근거를 이 실측으로 얻었다 — 페이지를 넓혀도 문제가 재현되는 것을 보면(같은 후보가 여전히 잘림) "경계선 우연"이 아니라 **"base 쿼리는 애초에 몇 개를 가져오든 10개 몫을 넘지 못하면 소용없다"**는 구조적 결론이다. 즉 depth 확장은 이 문제의 해법이 아니다 — 기각.

**결론: base 쿼리 페이지 확장 미구현.** 노이즈만 늘고 API 호출만 늘 뿐, 실제로 놓친 후보를 구조적으로 못 구한다.

## MIN_SPECIFIC_SLOTS 하향 조정 — snapshot 재생으로 진단, 기각(구현 안 함)

"base가 정답을 더 많이 데려왔는데(하이디라오 2/3) 몫은 specific과 똑같이 10"이라는 관찰에 따라, MIN_SPECIFIC_SLOTS를 10/8/6으로 낮췄을 때 효과를 확인했다. **추가 API 호출 없이** — origin당 이미 있던 `collectCandidates` 결과 1회(snapshot)를 그대로 재사용하고 `allocateBySourceKind`만 파라미터를 바꿔 재생했다.

- **먼저 코드 버그성 함정 발견**: 현재 공식은 `specificTarget = max(minSpecificSlots, evenShare)`이고 `evenShare = limit/2 = 10`(2버킷 고정 구조 특성상)이라, **10 이하의 MIN 값은 현재 공식에서 전부 무효과**다(10/8/6 결과가 완전히 동일하게 나와서 발견함). "MIN을 낮추면 실제로 base가 더 받는" 가상 변형(evenShare clamp 없이 순수 `min(minSpecificSlots, pool)`만 쓰는 버전)을 같은 스냅샷 위에서 추가로 돌려 진짜 효과를 봤다.
- **순수 floor 변형 결과**:
  - MIN=10: 기존과 동일(specific 10, base 10) — 두 origin 다 기존 정답(129라멘하우스/용가회전훠궈/일석삼조) 유지, 칠프로칠백식당은 여전히 없음.
  - MIN=8: 쿄오모라멘 specific 9/base 11(100%), 하이디라오 specific 8/base 12(85.7%) — **기존 정답 3개 전부 유지**, 칠프로칠백식당은 여전히 없음. base가 자기 풀을 더 많이 흡수하지만(쿄오모라멘 base 100%) 그 대가로 잃는 것도 없음 — 순효과 없음.
  - MIN=6: 쿄오모라멘은 129라멘하우스 유지되지만, **하이디라오에서 일석삼조버섯매운탕(specific, accuracy 4위)이 컷됨** — specific 몫이 6으로 줄면서 자기 카테고리 내부 경쟁에서 밀려남. 정답 하나를 잃었는데 그 대가로 칠프로칠백식당을 얻지도 못했다(여전히 풀에 없음 — depth=1 production 설정에서는 애초에 후보 자체가 없어서, MIN을 아무리 낮춰도 회수 불가능).
- **핵심 확인**: 칠프로칠백식당은 세 값 어디서도 등장하지 않는다 — "맛집" accuracy 16위라 현재 production 설정(depth=1, 이전 절에서 기각된 depth=2 확장 없이)의 raw pool 자체에 없기 때문이다. 즉 **base 몫이 병목이라는 관찰은 정확했지만, 그 병목을 풀어도(순수 floor로 base가 최대 100%까지 받아도) 이 특정 후보는 회수되지 않는다** — 병목이 두 개(base 몫 제한 + base 쿼리 depth 제한)였고 이번엔 두 번째 병목이 진짜 벽이었다.
- **결론**: MIN=8은 무해하지만 무익하고(정답 유지, 회수 없음), MIN=6은 유해하다(일석삼조를 잃음). 사용자가 사전에 정한 기각 조건("세 값 모두 정답지가 동일하면 기각")이 문자 그대로는 아니지만(MIN=6에서 달라짐), 그 취지는 성립한다 — 어떤 값도 원래 목표(칠프로칠백식당 회수)를 달성하지 못하고, 낮출수록 이득 없이 위험만 커진다. **MIN_SPECIFIC_SLOTS=10 유지, 구현 안 함.**

## 다음 남은 일

1. `deriveSpecificSearchTerm`의 "최심 리프" 문제 — **백로그로 보류**(사용자 결정). 실제 피해 사례가 나오면 그때 본다. breadcrumb 깊이 분포 조사도 지금은 안 함.
2. base 쿼리 15위 컷오프(depth 확장) — **기각**.
3. MIN_SPECIFIC_SLOTS 하향 조정 — **기각**(위 절 참고). 값은 10 유지.
4. §3단계 배분 정책(`allocateBySourceKind`, `MIN_SPECIFIC_SLOTS=10`) 자체는 실측 2건(쿄오모라멘·하이디라오) 모두에서 회귀 없이 검증 완료 — 이 부분은 그대로 유효하고 확정.
5. **참고(향후 발견 시)**: `allocateBySourceKind`의 `max(minSpecificSlots, evenShare)` 공식은 2버킷·limit=20 구조에서 MIN 값이 10 이하면 항상 무효과다. 나중에 버킷 수가 늘거나 limit이 바뀌면 이 clamp의 의미도 달라지니 재검토 필요.
6. 오늘 세션에서 n=1 착시를 네 번 겪었다: ① 케이스3 과교정, ② 황재벌 기준 장소 오판, ③ base depth 확장 기각, ④ MIN 하향도 순수 floor로 재검증하지 않았으면 "무효과"를 "효과 없음이 증명됨"으로 착각할 뻔함(실제로는 공식의 clamp 때문이었음). 이 계열 작업은 항상 "왜 결과가 이렇게 나왔는지" 기전을 확인하고 결론 낸다.
7. 다음은 5단계(위시 활용)로 진행.
8. 운영 SQL·commit·push·배포 없음 — 전부 로컬.

---

# AI 추천 고도화 — 3단계(후보 수집 개선) 완료·commit (2026-09-08, push 안 함)

`fix: AI 추천 후보가 대분류 검색어("맛집")에 묶여...` 커밋 완료. 상세 진단·구현 내용은 아래 "3단계(후보 수집 개선)" 절 참고. 핵심 수치만 요약:

| 지표 | 이전 | 이후 |
| --- | --- | --- |
| 후보 풀(20개 상한 적용 전) | 13건 | 32건 |
| 후보 최대 거리 | 390m | 1,508m |
| 후보 카테고리 종류 | 1~2종(식사류) | 7종 |
| place_detail 1회당 Kakao API 호출 | 2회 | 3~5회 |

Kakao 키워드 검색 쿼터는 100,000건/일(앱 단위, 이 앱의 다른 카카오 검색 기능과 공유). 위 3~5회 기준으로도 하루 20,000 사이클 여유 — 지금 1커플 규모에서는 무시할 수준.

**0~3단계를 통틀어 배운 것**: 프로필 구조화(4단계, `buildTasteProfile`)는 A/B에서 차이가 거의 없었고, 실제 병목은 검색어(3단계)였다. 후보 쪽 정보가 얇은 것이 근본 제약이라는 문서 §5의 지적이 실측으로 확인됨.

---

# AI 추천 고도화 — 0단계 + 4단계 단독 측정 (2026-09-08, 로컬만 — 배포/커밋 없음)

기준 문서: `CLAUDE_AI_RECOMMENDATION_UPGRADE_HANDOFF.md`. 아래는 그 문서의 "Claude Code 첫 작업" 지시(0단계 대조 → 4단계만 적용해 측정 → 이후 단계 재설계)의 결과다. 운영 SQL·커밋·푸시·배포는 하지 않았다.

- **0단계 대조**: 문서 §2 표를 `src/app/api/ai-recommend/route.ts`, `src/app/api/kakao-candidates/route.ts`, `src/lib/recommendationPolicy.ts`, `src/lib/recommendationFeedback.ts` 실제 코드와 대조했다. 표의 13개 항목 모두 코드와 일치했다(불일치 없음) — 문서가 작성 당일 코드 확인 후 쓰였기 때문으로 보인다.
- **fixture/평가**: `scripts/eval/fixtures.ts`에 문서 §0이 요구한 8개 케이스(기록 없음/한쪽만 기록/취향 충돌/별점-감정 충돌/오래된 단골/업종 반복/적합한 먼 후보/부적합한 가까운 후보)를 가상 데이터로 만들었다. 실존 상호명은 쓰지 않았다.
- **4단계 `buildTasteProfile`**: `src/lib/tasteProfile.ts`에 순수 함수로 구현(현재 `route.ts`에는 연결 안 함 — 측정 전용). 단위 테스트 `scripts/taste-profile.test.mjs` 11개, 기존 테스트 포함 총 21개 통과. `npx tsc --noEmit`/`eslint` 통과.
- **측정 방법**: `scripts/eval/run-taste-profile-eval.mjs`가 같은 8개 fixture로 (a) 현재 `route.ts` 로직을 그대로 재구성한 baseline과 (b) `confirmedPlaceTraits`/`memberPreferences`/`visitFeedback` 자리에 `buildTasteProfile` 출력만 넣은 experiment를 각각 실제 OpenAI 호출로 비교했다(모델은 route.ts와 동일한 `gpt-5.6-luna`, 8×2=16회 유료 호출, 결과는 `scripts/eval/results.json`— gitignore 처리함).
- **케이스별 결과 요약** (n=1/케이스라 방향성 참고용이며 통계적 결론 아님):
  - 기록 없음/오래된 단골/적합한 먼 후보/부적합한 가까운 후보: 두 방식 모두 이미 기대대로 동작(허구 취향 없음, 먼 적합 후보 채택, 가까운 부적합 후보 배제). experiment 쪽이 추억 원문을 reason에 더 자연스럽게 인용하는 차이 정도.
  - **취향 충돌(한쪽은 조용함, 한쪽은 활기참)**: baseline은 한쪽(활기찬 술집) 근거만 반영하고 조용한 쪽 근거를 추천에서 완전히 누락했다. experiment는 두 근거를 모두 반영해 각 member 취향에 맞는 후보를 하나씩 반환했다 — 문서 §4/§5가 요구한 "커플 균형"에서 가장 뚜렷한 개선.
  - **별점 4.8·감정 충돌**: baseline reason은 "한 분은 긍정, 한 분은 부정으로 엇갈렸다"고 명시적으로 언급했는데, experiment는 같은 사실(negativeEvidence에 존재)을 갖고도 reason에서 언급하지 않았다 — buildTasteProfile 구조가 상충을 자동으로 더 잘 드러내 준다고 볼 수 없다는 반례. 5단계에서 프롬프트가 이 구조를 어떻게 요약하게 할지 별도 검증 필요.
  - **업종(카페) 반복**: baseline은 카페 2개+전시 1개로 다양화했는데 experiment는 카페 2개만 반환해 다양화가 오히려 덜했다(재현 1회, 노이즈일 가능성 있음).
  - 토큰: experiment가 프로필 JSON이 더 길어 input 토큰이 케이스당 대략 300~600 더 든다. 절대량은 작아 비용 영향은 미미.
- **결론(잠정)**: `buildTasteProfile`은 "근거 없는 취향 생성 방지"나 "적합한 먼 후보/부적합한 가까운 후보 판단"에서는 baseline과 동급이고, "취향 충돌 시 양쪽 반영"에서는 명확히 낫다. 반면 "상충 사실을 reason에서 숨기지 않기"는 오히려 baseline이 나은 사례가 1건 있었다 — 데이터 구조 개선(4단계)만으로는 해결 안 되고 5단계 프롬프트 설계에서 별도로 다뤄야 할 문제로 보인다. n=1 재현이므로 각 케이스 반복 실행 후 재확인이 필요하다.
- **현재 route.ts와의 실제 필드 격차**: `buildTasteProfile`을 실제로 연결하려면 `route.ts`의 `places` SELECT에 `is_regular`, `first_visit_date`, `created_at`을 추가하고 `memories` SELECT에 `content`, `date`를 추가해야 한다(현재는 감정 태그만 조회 — 문서 §2 표와 일치하는 현재 상태). 이 확장 자체는 아직 하지 않았다.
- **미검증**: 실제 커플의 진짜 기록 볼륨(수백 건 이상)에서의 동작, 코스(course) 모드에서의 동일 비교, 5단계(근거-후보 연결) 프롬프트와 결합했을 때의 결과, 각 케이스 반복 샘플링을 통한 재현성.
- **다음 단계 제안**: 사용자 승인 필요 — (1) 별점-감정 충돌 사례를 5단계 프롬프트 설계에서 어떻게 다룰지 먼저 정할지, (2) `buildTasteProfile`을 `route.ts`에 실제로 연결(위 필드 확장 포함)하며 1단계(solo 시작)로 넘어갈지, 아니면 (3) 케이스 3(취향 충돌) 개선 효과를 더 많은 반복으로 먼저 검증할지.

## 재현성 검증 사이클 (같은 날 후속, 사용자 지시로 진행)

사용자가 위 n=1 결과를 보고 "재현성 확인 → 원인 파악(데이터 vs 프롬프트) → 원인에 맞는 수정 → 재측정" 한 사이클을 요구해 케이스 3/4/6을 각 변형(baseline/experiment)당 4회씩(`EVAL_REPS=4`) 재실행했다. 결과: `scripts/eval/results-reps.json`(gitignore 처리).

- **원인 진단(별점·감정 충돌)**: `results.json`의 실제 페이로드를 직접 확인한 결과, experiment의 `tasteProfile.representativePlaces[0].facts`에 `"member_1 방문 후 긍정 반응"`과 `"member_2 방문 후 아쉬운 반응"`이 나란히 들어 있었고 `negativeEvidence`에도 별도로 잡혀 있었다 — **데이터는 상충을 이미 정확히 노출하고 있었다.** 즉 원인은 데이터 구조가 아니라 프롬프트: facts가 한 배열에 미리 합쳐져 있으니 모델이 요약하면서 상충을 굳이 문장으로 안 짚어도 되는 것으로 보인다.
- **수정**: `scripts/eval/run-taste-profile-eval.mjs`의 experiment 쪽 규칙에 한 줄 추가 — "그 장소의 facts나 negativeEvidence에 상충하는 반응이 있으면 reason에서 반드시 함께 언급하라". route.ts는 아직 안 건드림(이 스크립트가 독립 실행용이라).
- **재측정 — 케이스 4(별점·감정 충돌)**: 수정 후 4회 중 4회 모두 상충을 reason에 명시(같은 배치의 baseline은 4회 중 3회). 프롬프트 한 줄로 격차가 해소됐다 — 원인 진단이 맞았다는 뜻.
- **재측정 — 케이스 3(취향 충돌, 애초 "가장 뚜렷한 개선"이라 보고했던 것)**: **철회한다.** 4회 재실행한 baseline이 4회 모두 두 카테고리(술집·포차 + 술집·바)를 반영해 두 사람 취향을 다 살렸다 — 애초 1회 실행에서 baseline이 한쪽만 반영했던 건 재현되지 않는 일회성 변동으로 보인다. experiment도 비슷한 비율(4회 중 3회 2카테고리, 1회 3카테고리)이라 이 케이스에서 experiment가 baseline보다 체계적으로 낫다는 근거는 없다. **"커플 균형 개선"이라는 최초 결론은 n=1의 착시였다** — 정정해서 기록한다.
- **재측정 — 케이스 6(업종 반복)**: baseline 평균 pick 2.5개(전시 다양화 2/4회), experiment 평균 2.0개(전시 다양화 2/4회) — 다양화 비율 자체는 동일(2/4)했고 pick 개수만 소폭 적었다. 애초 1회 실행에서 본 "experiment가 다양화를 덜 한다"는 것도 뚜렷한 회귀라기보다는 정상 변동 범위에 가깝다. pick 개수가 약간 적은 경향은 남아 있어 완전히 무시하진 않되, 결정적 신호로 보지 않는다.
- **정정된 결론**: 이번 A/B(같은 사실을 다른 구조로 포장했을 때 최종 추천이 달라지는지)에서 재현 가능한 차이는 사실상 케이스 4 하나였고, 그것도 원인이 데이터가 아니라 프롬프트 문장 한 줄이라 밝혀져 고쳤다. **"구조만 바꿔도 추천이 좋아진다"는 가설은 이번 8케이스 기준으로는 강하게 지지되지 않는다.** 반면 `buildTasteProfile`의 더 확실한 가치는 A/B 승패가 아니라 **현재 route.ts가 아예 조회하지 않는 데이터**(단골 지정 여부, 방문일 기반 최근성, 추억 원문 인용)를 쓸 수 있게 해준다는 것과, 코드 차원의 구조적 보장(같은 장소 중복 가산 방지, "단골=방문횟수 아님" 등, `scripts/taste-profile.test.mjs` 11개로 테스트됨)이다 — 이건 출력 diff로는 안 보이고 데이터 접근성/불변식 문제라 별도로 가치가 있다.
- **아직 하지 않음**: `route.ts` 연결. 사용자가 "연결은 이 사이클이 끝난 뒤 계획부터 보고"라고 명시해, 계획만 아래에 제시하고 실행은 승인 대기 중이다.

## route.ts 연결 완료 (같은 날 후속, 사용자 승인 후 진행 — commit/push는 별도 논의)

사용자가 계획을 승인하면서 조건 두 가지를 걸었다: (1) 추억 원문(memories.content) 노출 기준을 코드에 명시하고 보고, (2) SELECT 확장의 조회 부담을 추정해 보고. 점수 가중치·후보 로직은 변경하지 않았다(사용자 명시 제약).

- **(1) 추억 원문 노출 기준**: `src/lib/tasteProfile.ts` 상단에 명시. ① 장소당 최대 1개 원문(가장 최근 것)만 쓴다. ② 이미 대표/관련/개인/공통 근거로 선별된 장소에만 원문이 붙을 수 있다(전체 추억을 훑지 않음). ③ 그중에서도 요청 전체를 통틀어 강도 점수 상위 `QUOTE_BUDGET_TOTAL=10`곳까지만 원문을 붙이고 나머지는 facts(사실)는 남기되 원문만 뺀다 — 같은 장소는 어느 섹션에 나오든 원문 노출 여부가 일관되게 적용된다(장소 단위로 한 번만 결정). ④ 각 원문은 `QUOTE_MAX_CHARS=80`자로 자르되 문장 경계(마침표류/"요")를 우선해 부정어가 잘려 의미가 뒤집히는 걸 피한다. 단위테스트로 개수 상한을 검증(`scripts/taste-profile.test.mjs`, 12개 통과).
- **(2) 조회 부담 추정**: `places`/`memories` 테이블 정의(`supabase/schema.sql`)와 기존 migrations 전체를 확인한 결과 **`couple_id`에 인덱스가 아예 없다**(이 작업 이전부터 그랬음, 내가 만든 문제는 아니다). 인덱스가 없으면 couple_id 필터 쿼리는 "그 커플의 행 수"가 아니라 "테이블 전체 행 수"에 비례해 느려진다(순차 스캔) — 커플·장소가 늘수록 모든 사용자의 조회가 함께 느려지는 구조다. 지금 데이터량에서는 체감 차이가 없을 정도로 작다(이 세션에서 실제 운영 DB에 EXPLAIN ANALYZE를 돌리진 않았다 — 그건 운영 조회라 별도 승인 없이 하지 않았고, 이번 결론은 스키마 구조 기반 추정이다). 내가 넓힌 컬럼(is_regular/first_visit_date/created_at/content/date) 자체의 추가 비용은 작다(행당 수백 바이트, 요청당 수십 KB 수준 — 스캔 비용을 바꾸지 않고 전송량만 약간 늘림). 두 가지로 대응했다: ① `places` 쿼리에 기존에 없던 `LIMIT 300`을 추가(코드 변경, 즉시 적용됨 — memories는 이미 `limit(200)`이 있었음). ② `couple_id` 복합 인덱스 2개를 `supabase/migrations/20260908000000_add_couple_id_indexes.sql`로 작성만 해 두었다(**실행 안 함** — 사용자 승인 후 별도 적용).
- **route.ts 변경**: `places` SELECT에 `is_regular, first_visit_date, created_at` 추가, `memories` SELECT에 `content, date` 추가. `confirmedPlaceTraits`/`memberPreferences`/`visitFeedback`/(비활성 상태였던) `favoriteTags` 조립 블록 전체를 `buildTasteProfile()` 호출로 교체했다. 시스템 프롬프트도 그 데이터 설명 규칙을 `src/lib/recommendationPrompt.ts`(신규, `buildCommonRules`/`buildPlaceDetailScoringRules`/`buildCourseScoringRules`)로 옮기면서 재현성 검증에서 확정한 "상충 시 reason에 반드시 언급" 규칙을 포함시켰다. `recommendationFeedback.ts`는 이제 route.ts에서 쓰지 않지만 파일·테스트는 남겨뒀다(삭제는 별도 승인 필요, 이번 범위 아님).
- **회귀 확인 방식**: 이전 A/B 스크립트는 시스템 프롬프트 규칙을 손으로 다시 옮겨 적어 실제 코드와 갈라질 위험이 있었다. 그래서 `scripts/eval/run-route-regression.mjs`는 `recommendationPrompt.ts`의 `buildCommonRules`/`buildPlaceDetailScoringRules`와 `tasteProfile.ts`의 `buildTasteProfile`을 **route.ts와 동일하게 직접 가져와** 호출한다 — 즉 이 스크립트가 실제로 부르는 건 production 코드 그 자체다(순수 Node에서 확장자 없는 `@/lib` 내부 import를 풀기 위한 로더 훅 `scripts/ts-extension-hook.mjs`를 추가했다 — production 코드는 안 건드림).
- **회귀 확인 중 실제 버그 발견·수정**: 8-fixture 회귀 1회차에서 `preference_conflict` 케이스가 reason에 `"member_2 pick"`을 그대로 노출했다 — `RECOMMENDATION_VOICE_RULES`에 "내부 필드명을 출력하지 마라"는 규칙이 이미 있었는데도 발생했다. 과거 baseline(5회 실행, `results.json`+`results-reps.json`)에서는 이 유출이 한 번도 없었던 반면 tasteProfile 쪽(5회 중 3회)에서만 발생한 것을 직접 대조해, `facts.push(\`${label} pick\`)`처럼 라벨과 단어를 한 문자열로 붙인 게 원인임을 특정했다. 프롬프트만으로 완전히 막힌다는 보장이 없어 `stripInternalMemberLabels()`(신규, `recommendationPrompt.ts`)로 후처리 방어망을 추가했다 — 기존에 있던 "마지막 정거장"→"마지막 장소" 치환과 같은 패턴. 단위테스트(`scripts/recommendation-prompt.test.mjs`, 실제 유출 문장으로 검증) 통과. 수정 후 `preference_conflict`를 5회 반복 재실행해 원본에서 1회 더 유출이 있었지만 최종 사용자 노출 텍스트에서는 5/5 모두 깨끗하게 정리됨을 확인했다.
- **최종 8-fixture 회귀(수정 반영 후, 1회씩)**: 전부 통과 — 기록 없음/한쪽만 기록 케이스에서 허구 취향 없음, 취향 충돌 케이스에서 두 사람 근거 모두 반영(정확한 균형 여부는 이전 절 참고 — 실행마다 다를 수 있음), 별점·감정 충돌 케이스에서 상충을 자연스러운 문장으로 명시(“다만 한 분은 방문 후 아쉬운 반응을 남겼고”), 오래된 단골이 근거로 계속 쓰임(다만 “단골”이라는 단어 자체가 reason에 항상 등장하진 않음 — 근거 배제와는 별개), 먼 적합 후보(11.2km)가 거리 이유로 탈락하지 않고 선택됨, 가까운 부적합 후보가 선택되지 않음. 내부 라벨 유출 0건. `npx tsc --noEmit`/`eslint` 통과, 관련 테스트 24개 통과(`node --test --import ./scripts/register-ts-extension-hook.mjs scripts/*.test.mjs`).
- **미검증**: 실제 로그인 세션으로 브라우저에서 `/api/ai-recommend`를 직접 호출한 적은 없다(이번 검증은 fixture 기반 독립 호출). course 모드(코스 추천)는 `buildCourseScoringRules` 추출만 했고 course fixture로 별도 회귀하지 않았다. `PLACE_TASTE_ROWS_LIMIT=300`이 실제 수백 개 장소를 가진 커플에게 적절한지는 실측하지 못했다. `couple_id` 인덱스는 작성만 하고 실행하지 않았다.
- **커밋 전 확인할 변경 파일**: `src/app/api/ai-recommend/route.ts`(수정), `src/lib/tasteProfile.ts`(신규), `src/lib/recommendationPrompt.ts`(신규), `scripts/eval/*`(신규, 비교/회귀 스크립트 — 결과 JSON은 gitignore 처리), `scripts/taste-profile.test.mjs`·`scripts/recommendation-prompt.test.mjs`(신규), `scripts/ts-extension-hook.mjs`·`scripts/register-ts-extension-hook.mjs`(신규, 평가 스크립트 전용 로더), `supabase/migrations/20260908000000_add_couple_id_indexes.sql`(신규, 미실행), `.gitignore`(평가 결과 JSON 3종 추가).

## 커밋 전 확인 사항 2건 완료 (같은 날 후속)

### (1) 내부 라벨 유출 — 후처리가 아니라 입력 쪽에서 원천 차단

사용자 지적: 정규식 후처리는 유지하되, `facts`에 `"member_2 pick"`류 내부 라벨을 애초에 만들지 말라 — 실제 표시 이름 또는 라벨 없는 문장으로.

- **선택**: 라벨 없는 문장 쪽을 택했다(실제 표시 이름은 안 씀). 이유: `memberPreferences`(구 baseline)도 원래 실명을 OpenAI에 보내지 않고 `member_1`/`member_2`로 익명화했었다 — 이건 기존에 있던 프라이버시 설계였다. 실명을 쓰면 라벨 유출은 막아도 대신 실제 이름이 매 요청마다 OpenAI로 나가는 새로운 트레이드오프가 생긴다. `RECOMMENDATION_VOICE_RULES`의 기존 규칙("본인과 파트너 중 누구인지 추정하지 마세요")도 애초에 개인 식별을 안 하는 쪽을 의도한 것으로 보여, 그 설계 의도를 유지했다.
- **구현** (`src/lib/tasteProfile.ts`): 장소 하나에 신호를 남긴 사람이 한 명뿐이면 주어 자체를 생략한다("pick함", "방문 후 아쉬운 반응을 남김" — 실제로 이렇게 써도 자연스러운 한국어다). 두 사람이 서로 다르게 반응했을 때만 그 장소 안에서 등장 순서대로 "한 사람"/"다른 사람"이라는 완전한 자연어 대명사로 구분한다(`pronounMap`/`personPhrase`). `member_1`/`member_2` 문자열은 facts·quote 어디에도 나타나지 않는다. `negativeEvidence`도 같은 방식으로 고쳤다(거기도 라벨을 그대로 쓰고 있었다).
- **구조적 필드는 그대로 둠**: `personalPreferences[].member`("member_1")와 `wishlistOrientation[].wantedBy`는 프로즈에 섞여 있지 않은 JSON 필드라 안전하다고 판단해 유지했다 — 실제로 baseline 5회 실행에서 이 구조(별도 `member` 키)는 한 번도 유출된 적이 없었다(대조 근거는 이전 절 참고).
- **부수적으로 발견해 고친 버그**: `personalPreferences`의 원문(quote)이 실제로는 "그 member 본인 것"인지 확인하지 않고 그 장소의 대표 원문을 그대로 붙이고 있었다 — 상대방 원문이 "내 취향" 목록에 섞여 나올 수 있는 버그였다. `agg.bestQuote?.member === label`로 본인 것일 때만 붙이도록 고쳤다. 이 지점을 바로 다시 쓰는 김에 함께 고쳤고, 단위테스트로 검증했다(`scripts/taste-profile.test.mjs`, 이제 26개 통과).
- **재검증 기준 = "원본 유출 0회"**: `scripts/eval/run-route-regression.mjs`로 `preference_conflict`(원래 유출이 나왔던 케이스)를 5회 재실행 — **정리 전 원본 기준으로 5/5 모두 유출 없음**(이전엔 정리 전 기준 실패율이 높았다). 별도 단위테스트로 실제 관측했던 유출 문장 4개를 그대로 재현·검증(`scripts/recommendation-prompt.test.mjs`).

### (2) 실제 로그인 브라우저 종단 검증

fixture가 아니라 진식/지민 실계정의 실제 데이터(장소 46개, 위시 4개, 추억 13개)로 확인했다.

- **장소 상세 AI 추천**(place_detail): "코오모라멘"(단골 표시 있음, 픽 있음, 별점 4.5, 실제 추억 1건 포함) 페이지에서 2회 새로 생성 — 매번 `POST /api/ai-recommend` 200, 콘솔 에러 없음. reason에 "두 분이 pick했고", "단골로 지정했으며" 등 실제 데이터가 라벨 없이 자연스럽게 반영됨. `member_1`/`member_2` 유출 없음.
- **데이트 코스 AI 추천**(course): "코오모라멘"을 1번 장소로 코스를 새로 만들고 "우리 취향으로 추천" 실행 — `POST /api/ai-recommend` 200. "마지막 장소"(정거장 아님) 표현 정상, 위시 항목("바 능소화")은 "위시에 담은 기록"으로 방문 만족과 구분해서 표현됨. 라벨 유출 없음.
- 두 경우 모두 `is_regular`/`first_visit_date`/`memories.date` 등 null이거나 형식이 섞여 있을 실제 데이터를 실제로 통과시켰지만 500·크래시·콘솔 에러 없었다 — 별도의 null 가드 코드를 추가하지 않아도 기존 옵셔널 체이닝(`??`, `?.`)으로 충분했다.
- **미검증으로 남는 것**: 서버 프로세스(dev server) 자체의 stdout 로그는 별도로 tail하지 않았다(이 세션에서 새로 띄운 게 아니라 이미 떠 있던 dev server를 재사용함) — 200 응답과 콘솔 무오류로 간접 확인했을 뿐 서버 로그 직접 확인은 아니다. 여러 장소·여러 번 반복해 null 조합을 폭넓게 훑지는 않았다(대표 사례 1곳만 확인).

### couple_id 인덱스는 범위 밖 확인

마이그레이션 파일(`supabase/migrations/20260908000000_add_couple_id_indexes.sql`)은 작성된 상태 그대로 두고 실행하지 않았다. 별도로 처리한다는 사용자 방침에 따름.

## 3단계(후보 수집 개선) — 진단 + 구현 (같은 날 후속, commit/push 안 함)

### 진단(실사용 문제 재현)

실제 저장된 장소(쿄오모라멘, `place.category="맛집"`)로 실측. `scripts/eval/diagnose-candidates.mjs` 신규 — `src/lib/kakaoLocal.ts`/`recommendationPolicy.ts`를 그대로 불러와 실제 Kakao API로 검증한다(로직 재구현 아님).

- **원인은 검색어 생성 단계, truncation이 아니다.** `searchQueries("place_detail", category, [], [])`는 `tags`가 하드코딩된 `[]`라 항상 검색어 1개(`[category]`)만 만든다. 이 장소의 `category`는 "일식"이 아니라 앱 자체 대분류인 **"맛집"**이었다(`categories.ts`, 최상위 대분류만 저장 — 세부 업종 DB 컬럼 자체가 없음).
- Kakao에 "맛집"(accuracy 정렬)만 검색하니 상위 15건이 전부 **390m 이내**였다 — merge/truncation 이전, Kakao 자체 랭킹 결과. distance 정렬 15건은 전부 40m 이내라 `excludeNearSelf`의 50m 규칙에 전부 걸려 **생존 0건**이었다.
- 병합 후 13건, 최대 390m — **20개 상한이 실제로 자른 건 0건**이었다. "거리 분산 없음"은 트렁케이션 문제가 아니라 100% 상류(검색어) 문제로 확인.
- probe: 같은 지점에서 "라멘"으로 검색하니 0~3,478m까지 나왔다 — 멀지만 관련 있는 후보가 실제로 존재함을 실측 확인.
- 재확인(한적 지역, 일월의제면소=고려대 골목): distance 정렬이 이번엔 4/15건 생존 — "밀집 지역에서만 낭비"이지 보편적 낭비가 아님을 확인, 재배치(대체) 대신 **추가**하는 쪽으로 방향 수정.

### (a) 확인: Kakao ID로 직접 조회는 불가능, 이름+좌표 편향 검색은 가능(스키마 변경 없음)

- 공식 문서 확인(`developers.kakao.com/docs/ko/local/dev-guide`, `.../getting-started/quota`): place id로 직접 조회하는 엔드포인트 없음. 키워드 검색만 있음.
- 우회: 장소 자신의 `name`(이미 있음) + `lat/lng`(이미 있음)로 키워드 검색하되 좌표 편향(x,y,radius) 필수, `kakao_map_link`에서 뽑은 id와 대조. 실측 4곳 중 좌표 편향 없이는 1곳("약수터" — 흔한 이름이라 전국 자연 약수터만 나오고 매칭 실패) 실패, 좌표 편향(radius 500m) 추가하니 4/4 성공.
- **DB 스키마 변경 없음.** `/api/kakao-candidates` 요청 계약에 `name`, `kakaoMapLink` 필드만 추가(옵셔널, 클라이언트가 이미 가진 `place.name`/`place.kakao_map_link`를 보내기만 함).

### 구현

- `src/lib/kakaoLocal.ts`: `deriveSpecificSearchTerm(categoryName)` 신규 — category_name breadcrumb에서 검색어로 쓸 가장 구체적인 항목을 고른다. 실측 깊이가 2~3단으로 섞여 있어("음식점 > 일식 > 일본식라면" vs "음식점 > 일식") 항상 말단/항상 2번째로 고정하지 않고, "프랜차이즈"/"브랜드" 세그먼트를 만나면 그다음(브랜드명, 예: "공차")은 버리고 그 앞 단계를 쓴다("§11 6번" shortCategory와 같은 문제 재사용). 말단이 "기타"류면 앞 단계로 물러난다. 단위테스트 8개(`scripts/kakao-local.test.mjs`) — 3단/2단/브랜드/기타/공백 케이스 전부.
- `findReferenceCategoryName()` 신규 — 이름+좌표 편향 검색 후 id 대조, 실패 시 `null`(추측 안 함).
- `src/app/api/kakao-candidates/route.ts`: `place_detail`(course 아님)에서만 self-lookup 실행, 성공 시 `deriveSpecificSearchTerm` 결과를 기존 대분류 검색어에 **추가**(대체 아님 — distance 정렬 재배치는 위 재확인 결과로 보류). 매칭 성공/실패와 실제 쓰인 검색어를 로그에 남기되 장소명·좌표는 남기지 않는다(§0단계 원칙).
- 클라이언트: `AiRecommendationSection.tsx`가 `name`/`kakaoMapLink`를 요청에 추가. `CourseForm.tsx`는 변경 없음(course 모드는 서버에서 무시).

### API 호출량(카카오 쿼터)

- 공식 확인: 키워드 검색 무료 쿼터 **100,000건/일**(앱 단위, 여러 기능이 공유), 초과 시 0.5원/건.
- place_detail 후보 조회 1회당: 기존 **2회**(대분류×2정렬) → 변경 후 **3~5회**(self-lookup 1 + 대분류×2정렬 2 + [매칭 성공 시] 세부업종×2정렬 2). 실측(쿄오모라멘): 매칭 성공, 5회.
- "더보기"는 추가 호출 0회(클라이언트 표시만, 기존 동작). "다시 추천받기"는 전체 재조회(최대 5회) + OpenAI 1회.
- 세션 예: 펼치기 1회 + 다시 추천받기 2회 = Kakao 호출 최대 15회. 쿼터 100,000건 대비 지금 1커플 규모에서는 무시할 수준 — 최악 케이스(5회/사이클) 기준 하루 20,000회 사이클까지 여유. 다만 이 쿼터는 이 앱의 다른 카카오 검색 기능과 공유되므로, 사용자·기능이 늘면 합산 기준으로 재확인 필요.
- course 모드는 기존 그대로(최대 8쿼리×2정렬=16회, 이번 변경과 무관) — 위 표에 참고로만 남긴다.

### 관측 가능성

`console.log("[kakao-candidates] 세부업종 검색어: ...")` — 성공 시 실제 쓰인 검색어, 실패 시 원인(매칭 실패/kakaoMapLink 없음)만 남기고 장소명·좌표·couple_id는 남기지 않는다.

### 검증

- 실제 로그인 브라우저(진식/지민 계정)로 쿄오모라멘 재검증: 서버 로그에 `"일본식라면" 사용` 확인(2회 반복 모두 동일). AI 추천 카드에 129라멘하우스(302m, 일식), 타마(368m, 술집) 등 이전에 전혀 안 나오던 카테고리·거리대 등장. matchedTags도 "든든한 식사"/"술"/"일상 데이트"로 다양해짐.
- 실제 후보 풀(20개 상한 적용 전) 직접 측정: 기존 13건/최대 390m → **32건/최대 1,508m**, 카테고리 7종(한식/일식/샤브샤브/아시아음식/술집/카페/중식)으로 확대. 20개 상한이 이번엔 실제로 12건을 잘라냈다(정상 동작 — 상한 자체는 안 건드림). probe의 3,478m에는 못 미치지만(단일 "라멘" 쿼리만 썼던 probe와 달리 "일본식라면"+"맛집" 병합이라 PAGE_SIZE 상한의 영향) 390m→1,508m로 크게 개선.
- 코스 모드 회귀: 같은 세션에서 코스 AI 추천 실행 — 서버 로그에 "세부업종 검색어" 줄 자체가 없음(정상, `mode!=="course"` 게이팅 확인). 카드 내용도 이전과 동일한 패턴.
- 8-fixture 회귀(`run-route-regression.mjs`): 8개 전부 통과, 내부 라벨 유출 0건 — 이번 변경은 `ai-recommend`/`tasteProfile` 코드를 건드리지 않아 예상대로 영향 없음.
- `npx tsc --noEmit`/`eslint` 통과. 단위테스트 34개(`kakao-local.test.mjs` 8개 신규 포함) 통과.
- 이 세션에서 로컬 dev server를 재시작해 로그를 파일로 남겨 확인했다(운영 서버 아님, 로컬 재시작만).
- **미검증**: 약수터처럼 흔한 이름이 아닌 다른 실패 유형(예: 최근 폐업해 Kakao에서 완전히 삭제된 장소, 이름이 크게 바뀐 장소)은 실제로 겪어보지 못했다 — 코드상 `findReferenceCategoryName`이 매칭 실패 시 `null`을 반환해 안전하게 폴백하는 것은 로직상 확인했지만 그런 실제 사례로 재현하지는 않았다. self-lookup 호출이 추가한 지연시간(수백ms)을 실측하지 않았다(체감상 유의미하지 않았음).
- 운영 SQL·commit·push·배포 없음.

---

# 현재 사진 저장소 상태 — 2026-09-08 갱신

**place-photos의 과거 공개·익명 CRUD 문제는 해결됨 — 사용자 제공 운영 조회 결과의 설정·정책·함수 정의 검토 완료.**

- 근거: 사용자가 제공한 `security_audit` JSON 원문을 검토했다. 조회 시각은 `2026-09-07T15:22:35.595376+00:00` (한국시간 2026-09-08 00:22:35). 에이전트의 운영 DB 직접 접속이 아닌 사용자 제공 SQL 조회 결과 검토다.
- 이번 로컬 코드 대조: `src/app/api/place-photo/route.ts`의 사용자 인증 → `can_access_place_photo` 권한 검사 → 사용자 세션의 Storage 다운로드 흐름과 보안 마이그레이션의 private 설정을 확인했다. 이는 현재 운영 DB 설정의 독립 검증을 대신하지 않는다.

### 제공된 운영 조회 결과에서 확인한 설정

- `storage.buckets.public = false` (비공개 버킷), `storage.objects` RLS 활성
- 익명(anon) 접근 전면 차단 — `authentication guard` + `couple isolation`
- 커플 격리 `can_access_place_photo(name)`, 소유권 `owner_id = auth.uid()`
- 업로드 경로 정규식 `^{uuid}/{uuid}/{uuid}(-(?:160|320|640|960|1280))?\.jpg$` 강제
- 전체 Storage 정책 중 place-photos 관련 정책 9개 확인. 인증·커플 격리 가드는 RESTRICTIVE이며 `public` 역할 표기는 모든 역할에 제한을 적용한다는 의미다. 공개 접근 허용을 뜻하지 않는다. 나머지 정책은 profile-avatars 버킷으로 한정되어 있다.
- `can_access_place_photo` 함수 정의 확인: 현재 사용자의 커플이 있는 경우에만 해당 커플 경로 또는 해당 커플의 레거시 접근 매핑을 허용한다. `SECURITY DEFINER`, 빈 `search_path`, 명시적 스키마 참조를 확인했다.
- 수정·삭제는 기존 객체의 소유자만 허용하며 수정 후 소유권도 검사한다. 신규 업로드는 본인 owner_id와 경로의 사용자 ID를 검사한다.
- 앱은 `/api/place-photo` 로 인증 → 권한검사 → 다운로드하며 서비스 키를 쓰지 않음

아래 사진 보안 작업 이력의 미적용·미검증·후속 작업 문구는 각 기록 작성 당시의 상태다. 현재 상태는 이 절과 이후의 날짜·근거가 명시된 검증 결과로 판단한다. 새로운 상충 증거가 나오면 해당 증거를 확인하고 상태를 갱신한다.

### 이번 문서 정리의 검증 범위

- 완료: 사용자 제공 운영 조회 원문에서 private 설정, RLS 활성, 익명 접근 제한, 소유권 및 커플 격리 정책·함수 정의를 검토했다. 과거 경고의 공개 버킷·익명 CRUD 허용 설명은 이 조회 시점의 설정과 일치하지 않는다. 문서 변경 공백 검사 통과.
- 미검증: 이번 검토에서는 실제 Storage API 요청으로 읽기·쓰기 차단을 재현하거나 레거시 매핑 데이터 및 과거 접근 로그를 감사하지 않았다. 과거 침해 유무와 앱 전체 보안에 대한 결론은 포함하지 않는다.
- 한계: 앱 안전 경고의 내부 판정 및 재발 여부는 검증하지 못했다. 이 문서 갱신은 안전 검토를 해제하거나 경고를 무시하도록 승인하는 조치가 아니다.
- 운영 SQL·실제 데이터·commit/push/배포 변경 없음.

---

# date.log — 인수인계 (Codex 이전용)

## 현재 기준 상태 — Claude Code는 이 항목부터 확인 (2026-09-06)

- **사용자 제보 버그 수정: "데이트 힌트 받기" 토글 ON 상태에서 흰색 thumb가 트랙 밖으로 삐져나옴 (로컬 완료, commit 완료 — push 전)**. `SettingsView.tsx`의 thumb `<span>`에 `left`가 명시돼 있지 않아, 부모 `<button>`의 기본 UA 스타일(`text-align:center`)의 영향으로 기준 위치가 어긋났고 `translate-x-6`(24px)이 그 위에 더해지며 트랙(48px) 밖으로 나갔다(실측: `getBoundingClientRect`로 thumb 오른쪽이 트랙보다 20px 더 나감을 확인). `left-1`(4px)을 명시해 기준 위치를 고정하고 ON 이동거리를 `translate-x-6`→`translate-x-5`(20px)로 조정. OFF(여백 4px/24px)·ON(24px/4px) 양쪽 다 트랙 안에 정확히 들어오는 것을 실측 확인. 이 프로젝트에 track+thumb 형태 스위치가 이것뿐이라(다른 토글은 전부 `aria-pressed` 필박스 버튼) 재사용 없이 이 컴포넌트만 직접 수정. `npx tsc --noEmit`/ESLint 통과.

- **사용자 제보 버그 수정: 공유 카드 지역명이 "서울 중구"→"서울 중"으로 잘림 (로컬 완료, commit/push 완료 — 배포 확인 전)**. `PlaceShareCard.tsx`의 시/군/구 접미사 제거 로직(`region.district.replace(/[시군구]$/, "")`)이 "용산구"→"용산"처럼 2글자 이상 남는 경우만 고려하고, "중구"/"동구"/"서구"/"남구"/"북구"처럼 접미사를 떼면 1글자만 남는 지역명은 의미가 사라지는 걸 놓쳤다. 접미사 제거 후 2글자 미만이면 원래 이름을 그대로 쓰도록 수정. 실제로 "서울 중구" 주소의 장소로 공유 카드를 캡처해 상단에 "서울 중구 · FRAME 046"이 정확히 표시되는 것 확인. `npx tsc --noEmit`/ESLint 통과.

- **총검토(오늘 커밋 6개) 중 실제 버그 1건 발견·수정(로컬 완료, commit/push 완료 — 배포 확인 전)**: "데이트 힌트 받기" 설정 저장이 항상 실패하는 버그. 원인: `useDateHintSetting.ts`가 `profiles.date_hint_enabled`를 직접 `.update()`(REST PATCH)로 쓰려 했는데, `profiles` 테이블은 애초에 PostgREST 직접 UPDATE가 막혀 있어(실측: PATCH 403, 같은 컬럼 `select`는 200 — SQL 자체는 적용돼 있었음) `display_name`/`birth_date`/`avatar_path` 전부 `update_my_*` SECURITY DEFINER RPC로만 쓰는 기존 패턴을 어졌다. `supabase/add-date-hint-setting.sql`에 `update_my_date_hint_enabled(p_enabled boolean)` RPC를 같은 패턴으로 추가하고, `useDateHintSetting.ts`가 `.rpc()`를 쓰도록 수정. 사용자가 갱신된 SQL(RPC 함수 추가분)을 재실행했고, 토글 클릭 → `POST .../rpc/update_my_date_hint_enabled` → 204 성공 → 다른 페이지 이동 후 재방문해도 값 유지되는 것까지 실측 확인 완료. 그 외 `/memories`, `/recap`(OnThisMonthBanner), 홈 날씨 위젯 팝오버, 프로덕션 빌드(`npm run build`, 31개 라우트)는 재확인해 이상 없음.

- **신규: 날씨 API 라우트 + 상태 판정 로직 (로컬 완료, commit/push 완료 — 배포 확인 전)**. `src/lib/weather.ts`(순수 판정 로직, `classifyWeather`: first_snow > dust > heat/cold > snow/rain > cloudy/clear 우선순위) + `src/app/api/weather/route.ts`(OpenWeather 현재 날씨·대기질 조회, `kakao-candidates` 라우트와 동일한 auth.getUser 인증/zod 검증/서버 전용 키/한국어 에러 메시지 패턴, 좌표 2자리 반올림 기준 10분 인메모리 캐시) 신규 추가. `OPENWEATHER_API_KEY`는 `.env.local`에 서버 전용으로 추가됨(커밋 대상 아님, git-ignore 확인 완료). `npx tsc --noEmit`/ESLint 통과, 로그인 상태에서 `/api/weather` 빈 body POST 실측 검증 완료 — 200과 `{ state, tempC, feelsLikeC, conditionId, aqi }` 정상 반환(실측: 맑음+AQI 3 조합에서 `dust` 우선순위 판정도 확인). 아직 어떤 UI에서도 이 라우트를 호출하지 않음 — 프론트엔드 연동은 범위 밖으로 남겨둠.
- **신규: 천문연 특일 API 라우트 + 절기/공휴일 판정 로직 (로컬 완료, commit/push 완료 — 배포 확인 전)**. `src/lib/specialDays.ts`(순수 판정 로직: `solarTermToday`가 24절기 중 date.log 확정 9개(입춘·춘분·청명·하지·대서·처서·입동·대설·동지)만 필터, `holidayVerdict`+`countStreak`가 공휴일 연속 일수로 `long_weekend`/`single_holiday`/`last_day_of_break`/`major_festival_day`(설날·추석 당일) 패턴 판정) + `src/app/api/special-days/route.ts`(한국천문연구원 특일 정보 API를 `weather`/`kakao-candidates` 라우트와 동일한 auth.getUser 인증/서버 전용 키/한국어 에러 메시지 패턴으로 조회, XML 응답은 의존성 없이 정규식으로 파싱, 오늘 기준 하루 24h 캐싱) 신규 추가. `KASI_SERVICE_KEY`는 `.env.local`에 서버 전용으로 추가됨(커밋 대상 아님). 사용자 제공 원본 코드에서 실제 버그 2건을 발견해 수정: ① `BASE`가 `http://`였는데 이 환경에서 커넥션이 열리지 않아 `https://`로 변경(운영에서도 막힐 위험이 있던 부분), ② KST "오늘" 계산이 `toLocdate(nowKst)`로 로컬 타임존 getter를 써서 서버 로컬 TZ가 이미 KST면(예: 이 macOS) +9h를 중복 적용해 날짜가 하루 밀리는 버그(실측으로 발견) — `getUTCFullYear/getUTCMonth/getUTCDate`로만 계산하도록 수정해 서버 TZ와 무관하게 항상 정확하게 했다. KASI API가 이 네트워크 환경에서 간헐적으로(체감 20~40%) 커넥션 타임아웃을 일으키는 것도 확인해 `fetchSpecial`에 짧은 재시도(2회) 추가. **검증**: `today`를 라우트 안에서 임시로 `20261222`(동지)·`20261225`(성탄절)로 하드코딩해 각각 실제 호출 → `solarTerm:"동지"`/`holiday:null`, `solarTerm:null`/`holiday:{pattern:"single_holiday",streak:1,name:"기독탄신일"}` 정확히 판정되는 것을 확인한 뒤 원래 코드로 원복(진짜 오늘 날짜 계산 + 병렬 호출 + 재시도 2회). 평상시(오늘, 평일) 호출도 200과 `{date,solarTerm:null,holiday:null}` 확인. `npx tsc --noEmit`/ESLint 통과(미사용 `req`/`before` 경고 2건만, 로직 무관). 아직 어떤 UI에서도 이 라우트를 호출하지 않음 — 프론트엔드 연동(팝업 트리거 통합)은 범위 밖으로 남겨둠. **미검증**: 이 네트워크 환경 자체의 KASI 커넥션 불안정성 때문에 운영 배포 후에도 이 라우트가 이따금 502를 낼 가능성이 있음 — 배포 후 실제 안정성을 지켜볼 것.
- **신규: 추억 날씨 각인 백엔드 연결 (로컬 완료, commit/push 완료 — 배포 확인 전)**. `CLAUDE_DATE_HINT_WEATHER_IMPLEMENTATION.md` §6~8과 `date.log_백엔드연결_계약서.md` §3을 대조해 구현. **DB**: `memories.weather_state`(text)/`weather_temp`(integer)는 이미 운영에 적용된 상태(사용자 확인)라 저장소엔 없던 걸 히스토리용 문서화 migration `supabase/migrations/20260906000000_add_memory_weather_columns.sql`(`ADD COLUMN IF NOT EXISTS`, 실행은 안 함)로만 추가. `src/lib/memories.ts`의 `Memory`/`MEMORY_COLUMNS`/`MEMORY_WITH_PLACE_COLUMNS`에 두 필드 반영. **작업 A(`AddMemoryForm.tsx`)**: "그날의 날씨" 섹션 신규 — 오늘 날짜는 마운트/날짜-전환 시 `/api/weather` 호출해 자동 제안(핀 `{아이콘} {라벨} · {기온}°` + "서울 · 자동 확인") + `pastWeatherChoices()` 4개(맑음/흐림/비/눈) 버튼으로 override, 과거 날짜는 자동조회 없이 4개 수동 선택만(기온 항상 null). 저장 시 `todayWeatherFields`/`pastWeatherFields`(둘 다 `weatherDisplay.ts` 기존 헬퍼, 신규 작성 없음)로 필드 계산. **수정 화면 보존 규칙**: 편집 중 날짜를 안 바꾸고 날씨 버튼도 안 누르면 `initial.weather_state/temp`를 그대로 통과시켜 조용히 덮어쓰지 않음(날짜를 바꾸거나 버튼을 누른 경우에만 재계산 — `dateChangedFromSaved`/`weatherTouched` 플래그로 게이팅). 날짜가 오늘→과거로 바뀌면 자동값 제거+선택 초기화, 과거→오늘로 바뀌면 재조회, 편집 중 날짜만 바뀐 경우엔 "날짜를 바꾸면 날씨가 다를 수 있어요" 알림만 띄우고 강제로 지우지 않음. 오늘인데 자동조회 실패 시엔 사용자가 고른 상태만(기온 null로) 저장하는 fallback을 추가해, 실패 상황에서 클릭한 값이 통째로 유실되는 걸 방지(헬퍼 자체는 그대로 재사용, 이 fallback만 인라인으로 추가). **작업 B(`MemoriesFeed.tsx`)**: 날짜 옆에 `weatherBadge()` 배지 추가(null이면 미표시). **작업 C(`OnThisMonthBanner.tsx`)**: "작년 이맘때" 회고 배너에 `weatherRecallPhrase()` 문구 추가(memories 쿼리에 `weather_state` 추가, places 단독 방문엔 날씨 없음이 정상이라 그 경우 null 유지). **추가 요청(같은 턴)**: `WishlistView.tsx`의 "다녀왔어요"→무드 선택(`saveMood`) 경로에도 자동 각인 추가 — 오늘 방문 처리이므로 확인 없이 `/api/weather` + `todayWeatherFields(weather, true)`로 조용히 붙이고, 조회 실패 시 null/null로 두되 방문 처리(memories insert) 자체는 항상 진행. **검증**: `npx tsc --noEmit`/ESLint(수정 6개 파일 전부) 통과. 실제 브라우저 왕복 검증: ① 오늘 신규 작성 → 자동 제안(😷 미세먼지 27°) 그대로 저장 → `/memories`에 배지로 정확히 표시 확인. ② 같은 기록을 편집해 과거 날짜로 변경 → 자동값 제거·알림·수동선택 UI 전환을 화면에서 확인 → "흐림" 선택 후 저장 → 배지가 기온 없이 "☁️ 흐림"으로 정확히 저장됨(과거는 기온 null 규칙 확인). ③ 위시리스트 "다녀왔어요"→"좋았어요" 클릭 → 확인 절차 없이 추억이 자동 생성되며 당일 날씨(😷 미세먼지 27°)가 그대로 각인됨을 `/memories`에서 확인. 테스트에 사용한 장소 상태(모코시야: 방문→위시리스트 원복, wanted_by 원상복구)와 생성한 테스트 추억 2건은 모두 삭제해 원래 데이터로 복원 완료. **미검증**: 날씨 API 실패 시 "다녀왔어요"가 성공하는지는 실제 장애 주입 없이 코드 리뷰(try/catch로 감싸 항상 null/null 폴백 후 insert 계속 진행)로만 확인. 수정 화면에서 "편집 열 때 날짜·버튼 둘 다 안 건드리고 저장 → 원본 완전 보존"의 실제 저장 왕복은 코드 리뷰로만 확인(로직상 안전 — cancel 시 원본 그대로 재노출되는 것은 실측 확인함). 모바일 레이아웃은 별도 확인 안 함.
- **신규: 홈 날씨 위젯 백엔드 연결 (로컬 완료, commit/push 완료 — 배포 확인 전)**. `HomeView.tsx` 제목 오른쪽에 `useHomeWeather.ts`(마운트 1회 `/api/weather` 호출)로 받은 실시간 날씨를 `HomeWeatherWidget`에 연결(아이콘+기온 접힘, 클릭 시 팝오버로 지역·상태·체감·관측시각 표시). 실제 브라우저에서 날씨 아이콘+기온 표시와 팝오버 상세 확인 완료.
- **신규: 데이트 힌트 팝업 백엔드 연결 + 설정 ON/OFF (로컬 완료, commit/push 완료 — 배포 확인 전)**. 기존 `DateSuggestionPopup.tsx`(다른 세션 제작)를 `useTodayHint`에 연결(`onDismiss` prop 추가해 실제 dismiss가 훅에 반영되도록 확장, 미리보기 `?datePopup=` 쿼리 경로는 그대로 분리 유지). 개인 ON/OFF는 `profiles.date_hint_enabled` 신규 컬럼(`supabase/add-date-hint-setting.sql`) + `useDateHintSetting.ts`(컬럼 없어도 기본 true로 안전 폴백)로 `SettingsView.tsx`에 "데이트 힌트" 섹션 추가. `useTodayHint(today)`를 `2026-12-25`로 임시 하드코딩해 팝업 노출→dismiss→새로고침 후 미재노출→설정 OFF 시 미노출→미리보기 쿼리 독립 동작까지 실측 확인 후 원복. 작성 시점엔 SQL 미적용이라 설정 저장 실패 시 에러+롤백까지만 실측했고, 이후 **사용자가 `add-date-hint-setting.sql`을 운영에 적용하고 설정 ON/OFF가 실제로 저장되는 것까지 확인함**. `npx tsc --noEmit`/ESLint 통과.
- **신규: 홈 날씨 위젯 팝오버에 최고/최저 기온·강수확률 추가 (로컬 완료, commit/push 전)**. `weather.ts`에 순수 함수 `extractTodayForecast`(+ `OpenWeatherForecast`/`TodayForecast` 타입) 추가 — 5일 예보(3시간 슬롯) 응답에서 오늘(KST) 남은 슬롯들의 최고/최저/최대강수확률만 뽑는다. `/api/weather` 라우트가 기존 현재날씨·대기질 병렬 호출에 `/forecast` 호출을 추가해 `highC`/`lowC`/`precipChance`를 응답에 포함(예보 실패는 대기질처럼 비치명적 — 셋 다 null로 폴백, 같은 10분 캐시에 자연히 포함). `useHomeWeather.ts`/`HomeView.tsx`가 이 세 필드를 `HomeWeatherWidget`(원래부터 null-스킵 지원하던 prop)에 그대로 전달. 실제 `/api/weather` 응답에 `highC:25, lowC:18, precipChance:0` 등 실측값 포함과 팝오버에 "최고 25° · 최저 18° · 강수 0%" 표시까지 확인. `npx tsc --noEmit`/ESLint 통과.
- **신규: 홈 날씨 위젯 접힌 버튼에 맥락 문구 추가 + 폭염 아이콘 변경 (로컬 완료, commit/push 전)**. `CLAUDE_DATE_HINT_WEATHER_IMPLEMENTATION.md` §5의 "접힌 상태엔 아이콘+기온만" 원칙을 **의도적으로 완화** — 사용자가 실제 화면을 보고 "숫자만 있으면 뜬금없다"고 판단해 결정. `weatherDisplay.ts`에 `WEATHER_SHORT_NOTE`(접힌 버튼 전용 짧은 문구, 팝오버 긴 문구와 별개) 추가, 폭염 아이콘을 🔥→🥵로 변경(이 상수를 쓰는 모든 곳에 일관 적용). 위젯 접힌 버튼이 "아이콘 기온° · 문구" 형태로 표시되며, `sm:` 미만 폭에서는 문구만 숨기고 아이콘+기온은 항상 유지(`hidden sm:inline`), accessible label은 문구 포함 완전한 문장으로 유지. 팝오버(펼친 상태)는 변경 없음. 실제 브라우저에서 "😷 26° · 실내가 좋은 날" 표시, `aria-label` 완전 문장, 팝오버 무변경 확인. `npx tsc --noEmit`/ESLint 통과.
- **신규: 로그인 직후 감성 데이트 추천 팝업 UI 1차 구현(로컬 완료, commit/push/배포 전)**. 사용자 제공 `date.log_팝업알림UI_인수인계서_ChatGPT.md`를 참고하되 API·트리거 판정·서버 dismiss 저장은 범위 밖으로 두고 표시 전용 UI 레이어만 구현했다. `src/components/DateSuggestionPopup.tsx` 신규: Archive Teal 상단선, Ivory surface, 절제된 경로 모티프, 감성 문장 중심 위계, 단일 primary CTA와 부담 없는 `다음에 볼게요`, X 닫기, dialog semantics/focus trap/Escape/body scroll lock 적용. 현재 자동 노출은 연결하지 않았고 `HomeView.tsx`의 쿼리별 샘플 데이터로만 강제 표시한다: `/?datePopup=preview`는 맑음 버전, `/?datePopup=season`은 입춘 절기 버전, `/?datePopup=christmas`는 과거 같은 기념일에 다녀온 장소로 연결하는 크리스마스 버전. 크리스마스 샘플의 장소 수와 CTA 목적지는 UI 검토용 mock이며 실제 기념일 태그 필터 연결은 아직 하지 않았다. 날씨·절기·문화기념일 API 연동, 트리거 우선순위, 사용자별 생일 수신 대상 판정, 일 단위 서버 dismiss는 Claude 구현 범위로 남겨두었다. 자동화 브라우저에 인증 세션이 없어 홈 위 실제 시각 검증은 미완료(로그인된 로컬 브라우저에서 preview query 확인 필요). `tsc --noEmit`, 변경 파일 ESLint, diff check, Webpack production build(28개 경로) 통과.
- **신규: 날씨 기록·홈 위젯 UI 시안(로컬 미리보기, 실제 기능 미연결)**. `/auth/weather-archive-qa`에 ① 홈의 한 줄 날씨 위젯 ② 추억 저장 시 자동 확인 날씨와 수동 수정 선택지 ③ 날씨 필터·날씨 메타가 포함된 추억 카드와 "그날도 비가 왔었어요" 회고 문구를 한 화면으로 구성했다. 오늘 날짜에는 현재 날씨를 제안하고, 과거 날짜에는 확인되지 않은 과거 날씨/기온을 추정하지 않고 수동 날씨 선택만 제공한다는 UI 원칙을 명시했다. 날씨 API, 위치 판정, DB 필드/마이그레이션, 실제 저장·필터는 미구현이며 Claude 구현 범위다.
- **확정 변경: 날씨별 추억 필터는 제외**. 사용자는 홈의 조용한 날씨 위젯, 추억 저장 시 날씨 자동 제안/수동 수정, 추억 카드의 작은 날씨 메타, 회고의 사실 기반 날씨 문구를 확정했다. `/auth/weather-archive-qa`의 03 영역에 남아 있는 필터 칩은 이전 비교 시안이며 실제 구현 대상이 아니다. Claude Code 전달용 종합 구현 지시서는 `CLAUDE_DATE_HINT_WEATHER_IMPLEMENTATION.md`에 작성했다.
- **홈 날씨 위젯 A안 배치 미리보기(기능 미연결)**. 공용 표시 컴포넌트 `HomeWeatherWidget.tsx`를 독립 카드가 아닌 제목 영역의 작은 메타 한 줄로 수정했다. 홈의 장소·추억 통계 바로 아래에 `☀ 서울 22° · 천천히 걷기 좋은 날`로 표시하며 `/?weatherWidget=preview`에서만 샘플 렌더한다. `/auth/weather-archive-qa`도 동일 컴포넌트를 사용한다. API·위치·캐시 연결 전 UI 검토용이며 기본 홈에는 노출되지 않는다.
- **홈 날씨 A안 가독성/상세 상호작용 보완(기능 미연결)**. 제목 아래 메타를 은은한 Archive Teal pill로 한 단계 강조하고 `☀ 맑음 22° · 서울 · 천천히 걷기 좋은 날` 순서로 재배치했다. 클릭하면 레이아웃 이동 없는 작은 팝오버에 체감·강수·최고/최저·관측 기준 시각을 표시하며, 바깥 클릭과 Escape로 닫힌다. `/?weatherWidget=preview`의 값은 고정 sample이고 API 연결 전이다.
- **홈 날씨 축약안(기능 미연결)**. 사용자 피드백에 따라 긴 teal pill이 아래 조작부들과 경쟁하는 문제를 줄였다. 접힌 상태는 홈 제목 오른쪽의 배경·테두리 없는 `☀ 22°` 버튼만 표시하고, 맑음·서울·문구·체감·강수·최고/최저·관측 시각은 클릭 팝오버 안에서만 보여준다. `/?weatherWidget=preview`는 고정 sample이다.
- **Claude 전달 문서 최신화**. `CLAUDE_DATE_HINT_WEATHER_IMPLEMENTATION.md`의 기존 홈 한 줄 카드 지시를 폐기하고 최종 축약안(`제목 오른쪽 ☀ 22°`, 클릭 상세 팝오버)으로 교체했다. Claude는 현재 working tree에 이미 추가됐을 수 있는 weather/special-days 구현을 먼저 확인하고, 사용자 변경을 덮어쓰지 않은 채 확정 UI에 연결해야 한다.
- **신규: iOS 공유 이미지 글자 밀림 수정(로컬 완료, commit/push/배포 전)**. iOS Safari가 화면 밖 1080px 캡처 DOM의 텍스트를 모바일 viewport 기준으로 자동 확대해 날짜·평점·OUR PICK/SAVED IN이 글자 단위로 줄바꿈되는 문제를 수정했다. `shareCapture`의 임시 host/clone과 장소·코스 공유 카드 루트에 `text-size-adjust:none`을 적용하고, 장소 카드 메타/날짜/평점/footer에 `white-space:nowrap`과 안전한 flex 축소 규칙을 추가했다. 미리보기 하단 3개 버튼은 모바일에서 3열 grid·작은 글자·nowrap으로 정렬했다. TypeScript, 변경 파일 ESLint, diff check, Webpack production build(28개 경로) 통과. 실제 iOS Safari 재검증은 아직 필요하다.
- **후속: 공유 카드 상단 메타 3요소 분리(로컬 완료, commit/push/배포 전)**. `지역명 · FRAME 000 / 날짜`를 하나의 문자열로 처리해 지역명과 함께 FRAME이 `FRAME 0…`으로 잘리던 구조를 지역명·FRAME·날짜로 분리했다. 공간이 부족할 때는 지역명만 말줄임되며 FRAME과 날짜는 고정 표시된다.
- **후속: 공유 카드 지역명 축약 방식 변경(로컬 완료, commit/push/배포 전)**. `서울 용산…` 같은 말줄임 대신 공유 카드에서만 시·군·구 접미사를 제거해 `서울 용산`, `경기 수원`, `부산 해운대`처럼 표시한다. 지역명 영역의 말줄임표도 제거했으며 FRAME과 날짜는 그대로 유지한다.
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
- **후속 수정 — iOS Safari 캡처 폭 축소 버그(완료, 사용자가 원인·수정 방향 제공)**: iOS Safari는 뷰포트 밖 멀리(`left:-10000px`) 위치한 요소의 렌더 폭을 뷰포트 폭에 맞춰 줄여버리는 특성이 있어, `src/lib/shareCapture.ts`가 `clone.getBoundingClientRect()`로 폭/높이를 "측정"하던 기존 방식은 iOS Safari에서 실제 카드 폭(1080px 등)이 아니라 기기 뷰포트 폭을 캡처 크기로 잘못 쓸 위험이 있었다 — 아직 실기기 미검증 상태였던 항목이 실제로 걸릴 뻔한 버그.
  - **수정**: `captureCard(source, engine, opts)`에 `opts.width`/`opts.height`를 추가해, 호출자가 출력 크기를 이미 알고 있으면(장소·코스 공유 카드는 항상 `SHARE_OUTPUTS[ratio]`로 안다) 측정 대신 그 값을 그대로 쓰고, host/clone 모두에 `width`(`minWidth`, `maxWidth:none`, `boxSizing:border-box`)를 강제로 인라인 스타일 지정해 iOS Safari의 축소를 원천 차단한다. `shareImage.ts`/`useShareImage.ts`로 옵션을 그대로 통과시키고, `SharePreviewModal.tsx`(장소·코스 공유가 공유하는 컴포넌트)가 `SHARE_OUTPUTS[ratio]`의 width/height를 직접 넘기도록 배선. 사용자가 준 스니펫은 구형 카드 전용 상수 `CARD_W`(400)를 캡처 함수에 직접 하드코딩하는 방식이었는데, 그렇게 하면 신형 카드(1080px 폭)가 전부 400px로 캡처되는 회귀가 나서 — 호출자가 폭/높이를 넘기는 범용 옵션으로 일반화했다. dev 전용 `ShareCaptureQA.tsx`(구형 `CARD_W` 카드 비교용)에도 `{width: CARD_W}`를 전달해 동일하게 적용.
  - 검증: 데스크톱 Chrome에서 장소·코스 카드 모두 재캡처해 `sips`로 1080×1350 픽셀 정확히 일치 확인, 렌더 결과 육안 확인(회귀 없음). iOS Safari 실기기에서의 실제 개선 효과 자체는 이 세션에서 실기기가 없어 미검증 — 다음에 실기기로 한 번 확인 권장. `tsc`/`eslint`/`build` 통과.

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

## 과거 이력 — 비공개 사진 표시 및 커플 조회 격리 (당시 운영 반영 대기, 현재 상태는 문서 첫 절 참조)

- 사진 표시를 `/api/place-photo?path=...`로 통일. SSR 쿠키의 사용자 인증 → `can_access_place_photo` 검사 → 사용자 권한의 Storage download 순서. 서비스 키 사용 없음. 응답은 private/no-store, 같은 출처로 제한하고 HTML/SVG 등 능동 콘텐츠는 거부. SQL 함수가 없으면 503으로 닫힌 상태 유지.
- `PhotoImage`로 장소 카드/상세/코스/달력/추억 썸네일/라이트박스/업로드 미리보기/AI 추천을 연결. 공유 카드 배경도 변환하며 shareCapture는 same-origin 쿠키를 전송. 기존 public URL은 표시 시 변환하고 DB에는 그대로 보존. 신규 업로드는 `{couple_id}/{user_id}/{uuid}.jpg`, DB 저장값은 `storage://place-photos/...`. 로그인 페이지 실제 개인 사진은 예시 그래픽으로 교체.
- 새 SQL: `supabase/migrations/20260905010000_isolate_place_photos_by_couple.sql`. 기존 한글 공개 범위 정책 정리 + restrictive 커플 가드. 기존 flat 사진은 현재 places/memories 참조와 소유자 커플을 비교한 고정 매핑. 다른 커플 참조 충돌/소유자 소속 불일치/소속 불명은 격리(NULL); 참조를 사후 복사해도 조회 권한이 생기지 않음. 재실행해도 기존 매핑을 변경하지 않음. 기존 소유자 없는 파일에 소유권을 임의 부여하지 않음.
- 검증: 변경 전 TypeScript 통과. 변경 후 TypeScript, 프로덕션 `next build --webpack` 통과(`/api/place-photo` 동적 경로 포함). HTTP/URL 단위 테스트 6개, 격리 PGlite 커플 권한 시나리오 11개 통과. 기존 익명 권한 테스트도 유지. 변경 소스 ESLint 및 diff 공백 검사 통과.
- 운영 반영 순서: 새 SQL 실행 → legacy_total/legacy_assigned/legacy_quarantined 결과 확인 → 별도 승인 후 앱 배포. SQL 적용부터 새 앱 배포 사이에는 구버전의 루트 경로 신규 업로드가 거부됨. 공개 권한으로 되돌리지 말 것. 현재 운영 앱은 비공개 URL 표시 변경 전 상태.
- 미검증: 실제 운영 계정 2개/다른 커플에서 사진 표시·업로드·공유 캡처·소속 변경 확인. 운영 매핑 건수도 아직 미확인. 실제 사진 업로드/수정/삭제, 운영 SQL 실행, commit/push/배포는 이번 작업에서 수행하지 않음.

## 과거 이력 — place-photos 익명 접근 차단 검증 (커플 격리 적용 전)

- 사용자 제공 운영 조회 결과: storage.buckets의 place-photos public=false, storage.objects RLS=true. 앞서 제공된 전체 Storage 정책에서 인증/소유권 restrictive guard 및 authenticated 권한 확인.
- 결론: P0 anonymous upload, replacement, deletion allowed는 해결됨(Resolved, 사용자 제공 운영 설정 조회 기준). private 버킷이므로 공개 URL의 익명 다운로드도 허용되지 않는 설정 확인. 과거 운영 미적용/버킷 공개 여부 미확인 기록은 이 항목으로 갱신됨.
- 검증 범위: 사용자 제공 실제 DB 조회 결과 검토 및 격리 DB 정책 테스트. 에이전트가 수행한 기존 공개 URL HEAD는 HTTP 400. 실제 Storage API 업로드/교체/삭제 요청 테스트 및 정상 로그인 사용자 사진 기능 검증은 미실시. 과거 침해 여부는 판단하지 않음.
- 후속: 로그인 사용자 전체 사진 조회 허용은 유지되어 커플별 사진 조회 격리가 필요하며, 비공개 사진 표시용 signed URL 연동과 기존 owner_id 없는 파일 처리는 별도 작업. 이번 기록 갱신에서 운영 변경/commit/push/배포 없음.

## 과거 이력 — 운영 정책 조회 검토 (후속 검증 전의 사용자 제공 결과)

- 사용자가 제공한 `pg_policies` 결과에서 place-photos 7개 보안 정책과 기존 한글 정책 3개 확인. 이전 `place-photos: public read/insert/update/delete` 정책 없음. 이전 사용자 조회에서 storage.objects RLS=true 확인.
- 정책 수준 검증: anon의 SELECT/INSERT/UPDATE/DELETE 차단. authenticated 조회 허용, INSERT의 owner_id는 auth.uid()와 일치해야 함. UPDATE/DELETE는 기존 행 소유자만 가능하고 UPDATE 후 소유권 변경도 제한됨. {public} authentication guard는 RESTRICTIVE 제한 정책이며 공개 접근 허용 정책이 아님.
- 기존 한글 INSERT/ALL 정책이 남아 있으나 restrictive guard가 AND로 적용되므로 owner_id 제한을 우회하지 못함. 기존 owner 컬럼 정책의 중복 정리는 별도 작업이며 이번 검토에서 운영 정책을 변경하지 않음.
- 잔여 범위: 로그인 사용자 전체 조회가 가능하여 커플별 사진 조회 격리는 미해결. 이번 첨부에는 storage.buckets의 public 값이 없어 private 상태의 직접 조회 확인은 대기. HTTP 400만으로 private을 확정하지 않음. 실제 Storage API 쓰기 요청 차단/정상 로그인 업로드는 미검증.
- 결론: P0 익명 쓰기 허용은 제공된 운영 RLS 정책 수준에서 해결 확인. 익명 공개 다운로드까지 포함한 전체 검증 완료는 아직 아님.

## 과거 이력 — place-photos 운영 SQL 실행 성공 (후속 검증 전)

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

## 과거 이력 — place-photos 실제 권한 검증 (이후 사용자 완료 확인)

- 기존 소스에 포함된 공개 사진 URL을 인증 없는 HEAD 요청으로 확인: HTTP 400, 캐시 BYPASS. 공개 응답 실패는 확인했으나 파일 부재 가능성 때문에 RLS 차단의 확정 증거로 보지 않음. 사진 본문 다운로드/업로드/수정/삭제 없음.
- 이후 사용자가 운영 버킷 private 전환과 RLS 정책 적용 완료를 확인했으므로 위 내용은 과거 검증 이력이다. `place-photos` P0는 **해결됨(Resolved)**으로 관리한다.
