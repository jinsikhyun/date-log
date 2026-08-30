// 상단 사이트 이름 + 탭 메뉴. 전부 실제 라우트로 연결.
// 카테고리 필터(맛집/카페…)는 홈 화면 안의 탭에서 처리한다.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

const tabClass = (active: boolean) =>
  `shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
    active
      ? "bg-accent text-white shadow-sm"
      : "bg-card text-muted ring-1 ring-border hover:text-accent hover:ring-accent/40"
  }`;

export function Header() {
  const pathname = usePathname();
  const {
    user: authUser,
    profile,
    displayName,
    ready: authReady,
    signOut,
  } = useAuth();

  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-5 sm:px-8">
        <div className="flex items-baseline gap-3">
          <Link
            href="/"
            className="text-2xl font-extrabold tracking-tight transition-colors hover:text-accent"
          >
            date.log
          </Link>
          <span className="text-sm text-muted">우리가 함께 걸은 곳</span>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* 로그인 상태 */}
            {authReady &&
              (authUser ? (
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  {profile?.couple_id ? (
                    <Link
                      href="/settings"
                      className="rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-600 transition-colors hover:bg-stone-200"
                    >
                      설정
                    </Link>
                  ) : (
                    <Link
                      href="/onboarding"
                      className="rounded-full bg-accent/10 px-2.5 py-1 font-semibold text-accent transition-colors hover:bg-accent/20"
                    >
                      커플 연결
                    </Link>
                  )}
                  <span className="max-w-[120px] truncate font-semibold text-foreground/80">
                    {displayName || authUser.email}
                  </span>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-600 transition-colors hover:bg-stone-200"
                  >
                    로그아웃
                  </button>
                </span>
              ) : (
                <Link
                  href="/login"
                  className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-200"
                >
                  로그인
                </Link>
              ))}
          </div>
        </div>

        <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <Link href="/" className={tabClass(pathname === "/")}>
            전체
          </Link>
          <Link
            href="/wishlist"
            className={tabClass(pathname === "/wishlist")}
          >
            가고싶은 곳
          </Link>
          <Link
            href="/courses"
            className={tabClass(pathname.startsWith("/courses"))}
          >
            데이트코스
          </Link>
          <Link
            href="/memories"
            className={tabClass(pathname === "/memories")}
          >
            추억
          </Link>
          <Link href="/recap" className={tabClass(pathname === "/recap")}>
            우리의 기록
          </Link>
        </nav>
      </div>
    </header>
  );
}
