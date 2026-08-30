import { createBrowserClient } from "@supabase/ssr";

// 브라우저(클라이언트 컴포넌트) 전용 Supabase 클라이언트.
// @supabase/ssr 의 createBrowserClient 는 세션을 **쿠키**에 저장한다
// (path=/, SameSite=Lax, Max-Age 400일). 그래서 서버(proxy.ts)에서도 읽을 수 있다.
// 예전 supabase-js createClient 는 localStorage 라 서버에서 세션을 볼 수 없었다.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Supabase 환경변수가 없습니다. .env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY 를 설정하고 dev 서버를 재시작하세요.",
  );
}

/** 새 브라우저 클라이언트를 만든다. (createBrowserClient 는 내부적으로 인스턴스를 재사용) */
export function createClient() {
  return createBrowserClient(url!, anonKey!);
}

// anon 키는 공개 키. 실제 접근 제어는 Supabase RLS(커플 스코프)로 한다.
// 앱 전역에서 재사용하는 싱글턴.
export const supabase = createClient();
