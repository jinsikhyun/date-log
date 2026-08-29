import { createClient } from "@supabase/supabase-js";

// createClient 에는 "경로 없는" 프로젝트 베이스 URL 을 준다.
// SDK 가 /rest/v1, /auth/v1, /storage/v1 를 알아서 붙인다.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase 환경변수가 없습니다. .env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY 를 설정하고 dev 서버를 재시작하세요.",
  );
}

// anon 키는 브라우저에 노출돼도 되는 공개 키다. 실제 접근 제어는 Supabase 의 RLS 정책으로 한다.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
