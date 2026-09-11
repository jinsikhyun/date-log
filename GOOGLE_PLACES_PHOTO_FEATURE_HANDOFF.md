# Google Places 자동 대표사진 기능 작업 기준 문서

> 이 문서는 Google Places API를 이용한 위시리스트 장소 사진 기능만 다룬다.  
> 기존 AI 추천 고도화 작업 문서나 AI 추천 로직의 기준 문서에 내용을 덧붙이지 않는다.

## 0. 작업 범위

위시리스트 장소에 사용자가 직접 사진을 첨부하지 않은 경우, Google Places의 대표 사진을 자동으로 표시한다. 사용자가 사진을 고르는 별도 단계는 두지 않는다.

기본 흐름은 다음과 같다.

1. 위시리스트 장소 추가 시 기본값은 사진 없음
2. 장소 저장 후 또는 장소 카드·상세를 열 때 필요한 경우에만 Google API 호출
3. Google이 반환한 대표 사진 1개를 자동 표시
4. 사진을 누르면 해당 사진의 Google Maps 원본 페이지로 이동
5. 카드에 `Google Maps 사진` 출처 표시
6. 이후 사용자가 직접 사진을 첨부하면 직접 첨부한 사진을 항상 우선 표시

Google API에는 음식·외관 등 사진 주제 필터가 없으므로, 앱은 사진 유형을 보장하거나 임의로 분류하지 않는다. Google이 제공한 사진을 현재 화면에 표시하고, 사용자가 원본으로 이동할 수 있게 하는 것을 이번 범위로 한다.

이번 작업에서 변경하지 않는 것:

- AI 추천 점수와 가중치
- AI 후보 수집 로직
- 코스 추천 로직
- 기존 Kakao API 검색 로직
- 기존 사용자 사진 업로드 흐름
- 기존 AI 추천 작업 문서의 완료/미완료 상태

## 1. 선행 확인

구현 전에 다음 문서를 읽는다.

1. `AGENTS.md`
2. `HANDOFF.md` 최상단
3. 이 문서

기존 AI 추천 고도화 문서는 이번 작업의 기준 문서가 아니다. 필요한 경우 참고만 하며, AI 추천 작업의 상태나 가격·호출 수를 이 문서에 재사용하지 않는다.

## 2. 현재 구조 확인

구현 전에 다음 파일을 읽고 현재 동작을 요약한다.

- `src/components/AddPlaceForm.tsx`
- `src/components/WishlistView.tsx`
- `src/components/PlaceCard.tsx`
- `src/components/PlaceDetail.tsx`
- `src/components/CourseDetail.tsx`
- `src/components/RecapDashboard.tsx`
- `src/lib/places.ts`
- `src/lib/photos.ts`
- `supabase/schema.sql`

현재 `places.image_url`은 사용자가 직접 업로드한 대표 사진으로 취급한다. Google 사진을 이 컬럼에 넣지 않는다.

## 3. 정책·데이터 원칙

Google Places Photos (New)는 Place Details, Text Search, Nearby Search에서 사진 리소스 이름을 받은 뒤 사진을 조회하는 구조다.

- Google Place ID와 Kakao Place ID는 서로 다른 식별자다.
- Google 사진의 photo resource name은 장기 캐시·저장 대상으로 사용하지 않는다.
- Google 사진 URL, photo resource name, 이미지 바이너리를 `places.image_url`이나 Supabase Storage에 저장하지 않는다.
- Google Place ID처럼 정책상 저장 가능한 값과 사진 자체를 구분한다.
- 사진 표시 시 필요한 Google Maps 및 사진 작성자 attribution을 제공한다.
- 사진 원본을 확인할 수 있는 Google Maps 링크를 제공한다.
- API 키는 서버에서만 사용하고 클라이언트 번들에 노출하지 않는다.

공식 참고 문서:

- [Place Photos (New)](https://developers.google.com/maps/documentation/places/web-service/place-photos)
- [Places API 정책 및 attribution](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Places API 사용량 및 과금](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)

## 4. 사진 데이터 모델 원칙

최소한 다음 의미를 분리한다.

```text
places.image_url       = 사용자가 직접 업로드한 사진
google_place_id        = Google 장소 식별자
google_photo_enabled   = Google 장소 사진을 표시할지 여부(필요한 경우에만)
```

`places.image_url`은 사용자 업로드 전용이다. Google 사진의 선택 순번, photo resource name, photo URL, 이미지 바이너리는 저장하지 않는다. Google Place ID 등 정책상 저장 가능한 최소 식별자와 앱 자체의 `google_photo_enabled` 같은 표시 설정은 공식 정책을 확인한 뒤 사용한다.

구현자가 반드시 먼저 보고할 내용:

1. Google Place ID를 어느 컬럼에 저장할지
2. 저장 후 Google 사진을 다시 조회해 표시하는 방식
3. 사진 리소스 이름과 URL을 저장하지 않고도 자동 대표사진을 제공하는지
4. Google 사진을 조회할 수 없을 때의 대체 UX
5. 마이그레이션이 필요한 경우 파일만 작성하고 실행하지 않는지

정책상 Google 사진의 지속 저장이 불가능하므로 다음 방식으로 처리한다.

- 저장 시 Google Place ID만 저장하고, 이후 화면 진입 때 현재 대표 사진을 다시 조회
- 사진 요청은 서버에서 수행하고 photo resource name과 photo URL은 요청 수명 동안만 사용
- Google 사진이 없거나 조회에 실패하면 중립 placeholder를 표시
- `Google Maps 사진`을 누르면 현재 조회된 사진의 `googleMapsUri`로 이동

임의로 Google 사진을 Supabase Storage에 복사하거나 외부 URL을 `image_url`에 저장하지 않는다.

## 5. 장소 매칭

현재 장소 데이터에 있는 Kakao Place ID를 Google Place ID로 사용하지 않는다.

Google 장소 조회 시 다음 정보를 조합한다.

- 장소명
- 주소
- 위도·경도

매칭 규칙:

- 장소명과 주소가 충분히 일치하는 결과만 사용한다.
- 좌표가 있으면 검색 위치 편향에 사용한다.
- 매칭 점수가 낮거나 후보가 여러 개면 사진을 표시하지 않는다.
- 잘못된 장소의 사진을 추측해서 보여주지 않는다.
- 매칭 성공 시 Google Place ID만 장기 저장 대상으로 검토한다.

## 6. API 호출 구조

Google 사진은 비용과 quota를 고려해 목록에서 무조건 일괄 조회하지 않는다. 장소 목록의 모든 카드가 동시에 Google API를 호출하는 방식은 금지한다.

권장 기본 동작은 장소 상세 진입 또는 사진 영역이 실제로 표시될 때 서버 API를 호출하는 것이다. 저장 직후 자동으로 사진을 미리 가져오는 경우에도 해당 장소 1건만 처리하고, 실패해도 장소 저장은 성공해야 한다.

권장 흐름:

```text
장소 카드·상세의 사진 표시 시도
  → 서버에서 Google 장소 검색/상세 조회
  → photos 중 Google이 반환한 대표 사진 1개 사용
  → 서버가 Place Photos media를 요청
  → 사진과 attribution, photo googleMapsUri 반환
  → 화면에 `Google Maps 사진` 표시
```

구현 조건:

- API 키는 서버 환경변수로만 사용한다.
- Google API 호출은 Next.js 서버 route에서 처리한다.
- 필요한 field mask만 요청한다.
- 사진 후보를 여러 장 보여주는 선택 UI는 구현하지 않는다.
- 한 장소에서 동일 요청을 짧은 시간 안에 중복 실행하지 않는다.
- 자동 백필과 전체 위시리스트 일괄 조회를 구현하지 않는다.
- 사진을 보여줄 때 Google Maps와 사진 작성자 attribution을 함께 보여준다.
- 사진 media 요청을 클라이언트에 API 키가 포함된 URL로 노출하지 않는다.
- 요청 단계별 timeout과 재시도 UI를 제공한다.

서버 로그에는 다음만 남긴다.

- 성공/실패
- 요청 종류
- 후보 개수
- 응답 시간
- 오류 코드

장소명, 주소, 좌표, Google Place ID, 사진 URL 등 식별 가능한 원문은 운영 로그에 남기지 않는다.

## 7. UI 요구사항

위시리스트 추가 폼은 다음처럼 단순하게 유지한다.

```text
대표 이미지 (선택)

○ 사진 없이 저장
○ 내 사진 첨부
```

사진을 첨부하지 않으면 저장 후 Google 대표사진을 자동으로 시도한다. 사용자가 Google 사진을 고르는 별도 버튼이나 후보 선택 단계는 두지 않는다.

Google 사진 표시 UI:

- 로딩 문구: `장소 사진을 불러오는 중…`
- 성공 시 사진 위 또는 아래에 `Google Maps` 출처 표시
- 사진 작성자 attribution을 정책에 맞게 표시
- 사진을 누르면 해당 사진의 `googleMapsUri`로 이동
- Google 사진이 없거나 실패하면 기존 placeholder 표시
- 실패 때문에 위시리스트 저장을 막지 않음
- `다시 시도`는 상세 화면 등 명시적인 사용자 동작으로만 제공

표시 우선순위:

1. 사용자가 직접 첨부한 사진
2. 정책상 허용되고 현재 조회 가능한 Google 장소 사진
3. 기존 카테고리 placeholder

Google 사진은 다음과 같이 명확히 구분한다.

- `우리 사진`
- `Google Maps 사진`

Google 사진을 다음 영역의 사용자 기록으로 취급하지 않는다.

- recap 사진 통계
- 추억 대표 사진
- 커플 공유 이미지
- “우리가 남긴 사진” 문구

## 8. 비용 및 호출 제한

현재 위시리스트가 4곳이어도 목록 진입 시 자동으로 호출하지 않는다.

예상 호출은 실제 사진 표시를 시도한 장소 기준으로 산정한다.

- 장소 매칭/상세 조회: 약 1회
- 대표 사진 media 조회: 약 1회
- 저장 직후 자동 조회를 채택하면 장소 저장 1건당 최대 약 2회
- 카드 목록에서 lazy load를 채택하면 화면에 실제 노출된 장소 수에 비례

구현자는 다음 수치를 보고한다.

- 자동 대표사진 표시 1회당 실제 Google 호출 수
- 자동 대표사진 1개를 표시할 때의 호출 수
- 같은 장소를 다시 열었을 때의 호출 수
- 위시리스트 10곳·100곳일 때 자동 호출이 없는지
- timeout·재시도 시 호출 증가량

운영 보호:

- Google Cloud quota 제한 설정
- 예산 알림 설정
- 서버 route rate limit
- 장소별 중복 요청 방지
- 전체 목록 자동 백필 금지

## 9. 테스트

최소 다음 케이스를 테스트한다.

1. 사진 없이 저장해도 장소 저장이 성공한다.
2. 목록 전체를 불러오는 것만으로 Google API를 무조건 일괄 호출하지 않는다.
3. 사진을 실제 표시할 때 해당 장소에 대해서만 API가 호출된다.
4. Google 사진 1개가 정상 표시된다.
5. 사진 클릭 시 해당 사진의 Google Maps URL로 이동한다.
6. Google 장소 매칭이 불확실하면 사진을 표시하지 않는다.
7. API 실패 후 저장된 장소가 정상적으로 보이고 재시도할 수 있다.
8. 사용자가 직접 사진을 첨부하면 Google 사진보다 우선한다.
9. Google 사진이 recap 사진 수에 포함되지 않는다.
10. Google 사진이 공유 카드에 포함되지 않는다.
11. Google 사진 URL과 photo resource name을 DB나 Storage에 저장하지 않는다.
12. 코스 전용 장소가 위시리스트 사진 로직에 섞이지 않는다.
13. 기존 visited 장소 사진 업로드가 회귀하지 않는다.

테스트 순서:

1. fixture와 mock API 테스트
2. TypeScript 및 lint
3. 실제 API 키를 사용한 장소 1개 검증
4. 실제 브라우저에서 위시 추가 → 자동 사진 표시 → Google Maps 링크 이동 → 직접 사진 우선순위 확인

실제 API 검증은 장소 1개로 제한하고, API 비용과 quota 영향을 보고한다.

## 10. 구현 전 보고 형식

코드 수정 전에 다음을 보고한다.

1. 현재 사진 관련 컴포넌트와 데이터 흐름
2. 데이터 모델 변경안
3. Google 장소 매칭 방식
4. 사진 후보 조회 및 attribution 처리 방식
5. 선택한 사진의 저장/재조회 방식
6. Google 정책상 남는 제약
7. 예상 호출량과 비용 영향
8. 변경 예정 파일 목록
9. 테스트 계획

## 11. 금지 사항

- 기존 AI 고도화 문서에 이 작업 내용을 추가하지 않는다.
- 기존 AI 추천 파일에 사진 기능을 억지로 넣지 않는다.
- Google 사진을 `places.image_url`에 저장하지 않는다.
- Google 사진을 Supabase Storage로 복사하지 않는다.
- API 키를 클라이언트 코드에 넣지 않는다.
- 위시리스트 전체를 자동 조회하지 않는다.
- 장소 매칭이 불확실한데 사진을 보여주지 않는다.
- 운영 SQL 실행, commit, push, 배포는 별도 승인 전까지 하지 않는다.
