import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// 서버(RSC / route handler / server action) 전용 Supabase 클라이언트.
// next/headers 의 cookies() 로 세션을 읽고 쓴다.
// 매 요청마다 새로 만들어야 한다 (요청별 쿠키 store 에 묶이므로 전역 캐시 금지).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Component 렌더 도중엔 cookieStore.set 이 막힌다.
          // 세션 갱신은 proxy.ts(updateSession)가 담당하므로 여기선 무시해도 된다.
        }
      },
    },
  });
}
