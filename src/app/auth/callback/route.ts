import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// OAuth(구글) / 이메일 확인 링크가 돌아오는 곳.
// code(PKCE) 또는 token_hash(OTP) 로 세션을 교환한 뒤, 커플 연결 여부로 분기한다:
//   - 프로필 없음 / 커플 미연결 → /onboarding
//   - 이미 커플 연결됨          → next(기본 /)
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") || "/";

  const supabase = await createClient();

  let authed = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authed = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    authed = !error;
  }

  if (!authed) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  // 이메일 가입자와 동일한 온보딩 흐름: 커플 연결 안 됐으면 /onboarding 으로.
  let dest = next;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("couple_id")
      .eq("id", user.id)
      .maybeSingle();
    dest = profile?.couple_id ? next : "/onboarding";
  }

  return NextResponse.redirect(`${origin}${dest}`);
}
