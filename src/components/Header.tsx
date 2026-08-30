// 상단 사이트 이름 + 탭 메뉴. 전부 실제 라우트로 연결.
// 카테고리 필터(맛집/카페…)는 홈 화면 안의 탭에서 처리한다.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { withConjunctionParticle, withSubjectParticle } from "@/lib/korean";

const tabClass = (active: boolean) =>
  `shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
    active
      ? "bg-accent text-white shadow-sm"
      : "bg-card text-muted ring-1 ring-border hover:text-accent hover:ring-accent/40"
  }`;

function HeartIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={`h-3 w-3 ${className}`}
    >
      <path d="M12 21s-6.716-4.297-9.428-7.01C.86 12.278.86 9.34 2.572 7.63a4.83 4.83 0 0 1 6.828 0L12 10.229l2.6-2.6a4.83 4.83 0 0 1 6.828 6.83C18.716 16.702 12 21 12 21z" />
    </svg>
  );
}

export function Header() {
  const pathname = usePathname();
  const {
    user: authUser,
    profile,
    displayName,
    coupleMembers,
    ready: authReady,
    signOut,
  } = useAuth();

  // 커플 구성원 두 명(created_at 오름차순) → A, B. 이름으로 부제목을 만든다.
  const names = coupleMembers
    .map((m) => m.display_name)
    .filter((n): n is string => !!n && n.trim().length > 0);
  const subtitle =
    names.length >= 2
      ? `${withConjunctionParticle(names[0])} ${withSubjectParticle(names[1])} 함께 걸은 곳`
      : "우리가 함께 걸은 곳";

  // 파트너 = 같은 커플에서 나 자신이 아닌 프로필
  const partner =
    coupleMembers.find((m) => m.id !== authUser?.id) ?? null;
  const partnerName = partner?.display_name?.trim() || null;

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
          <span className="text-sm text-muted">{subtitle}</span>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* 로그인 상태 */}
            {authReady &&
              (authUser ? (
                <div className="flex items-center gap-2 text-xs text-muted">
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

                  {/* 내 이름 + 그 아래 파트너 배지 */}
                  <div className="flex flex-col items-end leading-tight">
                    <span className="max-w-[140px] truncate font-semibold text-foreground/80">
                      {displayName || authUser.email}
                    </span>
                    {profile?.couple_id &&
                      (partnerName ? (
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-accent">
                          <HeartIcon />
                          <span className="max-w-[120px] truncate">
                            {partnerName}
                          </span>
                        </span>
                      ) : (
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                          <HeartIcon className="opacity-40" />
                          <span>파트너를 초대해보세요</span>
                        </span>
                      ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-600 transition-colors hover:bg-stone-200"
                  >
                    로그아웃
                  </button>
                </div>
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
          <Link href="/wishlist" className={tabClass(pathname === "/wishlist")}>
            가고싶은 곳
          </Link>
          <Link
            href="/courses"
            className={tabClass(pathname.startsWith("/courses"))}
          >
            데이트코스
          </Link>
          <Link href="/memories" className={tabClass(pathname === "/memories")}>
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
