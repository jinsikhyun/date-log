import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const AUTH_PAGES = ["/login", "/signup"];

/**
 * 매 요청마다 실행 (proxy.ts 에서 호출).
 *  1) 쿠키에서 세션을 읽고, 만료됐으면 refresh 한 뒤
 *  2) 갱신된 쿠키를 응답(supabaseResponse)에 다시 실어주고
 *  3) 로그인/커플 연결 여부에 따라 리다이렉트한다.
 *
 * ⚠️ 반드시 supabaseResponse(또는 그 쿠키를 복사한 응답)를 반환해야 한다.
 *    안 그러면 refresh 된 토큰이 브라우저로 안 넘어가 세션이 조기 종료된다.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        // 1) 요청 쿠키 갱신 (이후 이 요청을 처리하는 서버 코드가 새 값을 보도록)
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        // 2) 응답을 새로 만들고 Set-Cookie 를 붙임 (브라우저가 새 토큰을 저장하도록)
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // getSession() 이 아니라 getUser() 로 확인한다.
  // getSession 은 쿠키 값을 그대로 믿어 서버에서 위조 가능 → Supabase 는 getUser() 권장.
  // getUser() 는 토큰을 Auth 서버로 검증하고, 만료 시 여기서 refresh 하며 위 setAll 을 호출한다.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // Photo API returns 401/404 itself; never redirect an image request to HTML.
  if (path === "/api/place-photo") return supabaseResponse;

  // 이메일 확인 콜백은 항상 통과
  if (path.startsWith("/auth/")) return supabaseResponse;

  const isAuthPage = AUTH_PAGES.includes(path);
  const isOnboarding = path === "/onboarding";

  // 1) 미로그인 → /login (로그인/가입 페이지 제외)
  if (!user) {
    if (isAuthPage) return supabaseResponse;
    return redirectTo(request, "/login", supabaseResponse);
  }

  // 2) 로그인했으나 커플 미연결 → /onboarding (온보딩 제외)
  //    쿼리가 실패하면(네트워크/RLS 일시 오류) 통과시킨다 — 여기서 막으면 정상 사용자가
  //    엉뚱하게 온보딩으로 튕긴다. 데이터 자체는 RLS 가 커플 스코프로 보호한다.
  let hasCouple = true;
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("couple_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!error) hasCouple = Boolean(profile?.couple_id);

  if (!hasCouple) {
    if (isOnboarding) return supabaseResponse;
    return redirectTo(request, "/onboarding", supabaseResponse);
  }

  // 3) 로그인 + 커플 연결 완료 → 인증/온보딩 페이지는 홈으로
  if (isAuthPage || isOnboarding) {
    return redirectTo(request, "/", supabaseResponse);
  }

  return supabaseResponse;
}

/** 리다이렉트 응답에 (갱신됐을 수 있는) 세션 쿠키를 그대로 복사해 붙인다 */
function redirectTo(request: NextRequest, pathname: string, base: NextResponse) {
  const nextUrl = request.nextUrl.clone();
  nextUrl.pathname = pathname;
  nextUrl.search = "";
  const res = NextResponse.redirect(nextUrl);
  base.cookies.getAll().forEach((cookie) => res.cookies.set(cookie));
  return res;
}
