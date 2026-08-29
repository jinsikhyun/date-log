# date.log

나와 그녀가 다녀온 맛집·카페·장소를 큐레이션하고, 각 장소의 추억을 기록하는 개인 웹사이트.

- **스택**: Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase · 카카오맵 JS SDK
- 홈: 장소 카드 피드 + 지도 뷰(주소를 카카오 지오코더로 변환해 마커 표시) + 장소 추가 폼

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # 값 채우기
npm run dev                  # http://localhost:3000
```

`.env.local` 에 필요한 값(자세한 설명은 `.env.example`):

| 변수 | 설명 |
|---|---|
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | 카카오 JavaScript 키 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL (경로 없이) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon public 키 |

## 데이터베이스 (Supabase)

`supabase/schema.sql` 을 Supabase 대시보드 > SQL Editor 에서 실행 (테이블 + 정책 + 시드 11개, 멱등).

정책: 방문자(anon)에게 읽기·추가·수정·삭제를 모두 허용 (둘이서만 쓰는 프로토타입, 실수 방지는 앱 확인창).
이미 예전 정책이 걸린 DB라면 추가 실행:
- `supabase/policies_public.sql` — 읽기 + 추가
- `supabase/policies_open_write.sql` — 수정 + 삭제까지 개방

## 배포 (Vercel)

1. 이 저장소를 GitHub 에 push
2. [vercel.com](https://vercel.com) → New Project → 저장소 import
3. **Environment Variables** 에 위 3개 등록 (Production + Preview) — `NEXT_PUBLIC_*` 는 빌드 시점에 필요하므로 배포 전에 반드시 설정
4. Deploy → 발급된 도메인(예: `https<span></span>://date-log.vercel.app`) 확인
5. **카카오 개발자 콘솔 > 앱 설정 > 플랫폼 > Web** 사이트 도메인에 그 도메인을 추가 (안 하면 지도가 `domain mismatched` 로 안 뜸)

이후 GitHub 에 push 하면 자동 재배포.
