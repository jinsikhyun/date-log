import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16: 예전 middleware.ts 가 proxy.ts 로 이름이 바뀜 (동작 동일).
// 매 요청마다 Supabase 세션을 쿠키에서 읽고/갱신하고, 로그인·커플 연결 여부로 라우트를 보호한다.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // 정적 파일/이미지 제외 전부. (인증 리다이렉트가 CSS/JS/이미지를 막지 않도록)
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
