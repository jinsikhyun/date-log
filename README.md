# date.log

커플이 함께 다녀온 맛집·카페·장소를 큐레이션하고, 각 장소의 추억을 기록하는 비공개 웹사이트.

- **스택**: Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 · Supabase (Auth + Postgres/RLS) · 카카오맵 JS SDK
- 로그인 후 커플 단위로 데이터가 격리됨 (RLS). 회원가입 → 온보딩(커플 생성/합류) → 홈.

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # 값 채우기
npm run dev                  # http://localhost:3000
```

`.env.local` 에 필요한 값 (설명은 `.env.example`):

| 변수 | 설명 | 노출 |
|---|---|---|
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | 카카오 JavaScript 키. 콘솔 > 플랫폼 > Web 에 실행 도메인 등록 필요 | 브라우저 (도메인 제한으로 보호) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL (`https://<ref>.supabase.co`, 경로 없이) | 브라우저 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon public 키 (RLS 로 보호되므로 공개돼도 됨) | 브라우저 |

> `NEXT_PUBLIC_` 접두사가 붙은 값만 브라우저 번들에 인라인된다. service_role 키·OAuth Client Secret 등 서버 비밀값은 **이 저장소·환경변수 어디에도 두지 않는다** — 전부 Supabase 대시보드에서만 설정.

## 데이터베이스 / 인증 (Supabase)

1. `supabase/schema.sql` 을 대시보드 > SQL Editor 에서 실행 (테이블 + 커플 스코프 RLS + 시드, 멱등).
2. 그 뒤 추가된 마이그레이션도 순서대로 실행 (`supabase/` 폴더의 개별 `.sql` — 각 파일 상단 주석 참고). 주요:
   `add-couples-model.sql` → `add-couple-rls.sql` → `add-couple-start-date.sql` →
   `add-categories-table.sql` · `courses.sql` · `add-wishlist-columns.sql` ·
   `add-reactions.sql` · `add-notifications.sql` · `add-favorite-tags.sql` ·
   `migrate-wanted-by-to-ids.sql` 등.
3. **Authentication → Providers**: Email 활성화 (Confirm email 켬). Google 을 쓰려면 Google provider 활성화 + Google Cloud OAuth 클라이언트 연결.
4. **Authentication → URL Configuration → Redirect URLs** 에 콜백 경로 등록:
   ```
   http://localhost:3000/auth/callback
   https://<배포도메인>/auth/callback
   ```

데이터는 로그인한 사용자의 `couple_id` 스코프로 RLS 가 자동 필터한다 (앱 코드에서 커플 필터를 직접 걸지 않음).

## 배포 (Vercel)

1. 이 저장소를 GitHub 에 push → Vercel New Project 로 import
2. **Environment Variables** 에 위 3개 등록 (Production + Preview). `NEXT_PUBLIC_*` 는 빌드 시점에 필요하므로 배포 전에 설정
3. Deploy → 발급 도메인 확인
4. **카카오 콘솔 > 플랫폼 > Web** 에 그 도메인 추가 (안 하면 지도가 `domain mismatched`)
5. **Supabase Redirect URLs** 에 `https://<도메인>/auth/callback` 추가

이후 GitHub push 시 자동 재배포.
