// 공통 셸: 데스크탑 좌측 사이드바 + 모바일 상단바/하단 탭바.
// (레이아웃에서 <div className="lg:pl-[248px]"> 안, {children} 앞에 렌더)
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { NotificationBell } from "@/components/NotificationBell";
import { daysTogether } from "@/lib/recap";
import {
  hasBatchim,
  withConjunctionParticle,
  withSubjectParticle,
} from "@/lib/korean";

type NavKey = "home" | "wishlist" | "courses" | "memories" | "recap";

const NAV: {
  href: string;
  label: string;
  short: string;
  key: NavKey;
}[] = [
  { href: "/", label: "다녀온 곳", short: "다녀온", key: "home" },
  { href: "/wishlist", label: "가고 싶은 곳", short: "위시", key: "wishlist" },
  { href: "/courses", label: "데이트 코스", short: "코스", key: "courses" },
  { href: "/memories", label: "추억", short: "추억", key: "memories" },
  { href: "/recap", label: "우리의 기록", short: "기록", key: "recap" },
];

function navActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/places");
  if (href === "/courses") return pathname.startsWith("/courses");
  return pathname === href;
}

function NavIcon({ name, className = "" }: { name: NavKey; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
        </svg>
      );
    case "wishlist":
      return (
        <svg {...common}>
          <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "courses":
      return (
        <svg {...common}>
          <circle cx="6" cy="19" r="2" />
          <circle cx="18" cy="5" r="2" />
          <path d="M8 19h6a4 4 0 0 0 0-8H10a4 4 0 0 1 0-8h6" />
        </svg>
      );
    case "memories":
      return (
        <svg {...common}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "recap":
      return (
        <svg {...common}>
          <path d="M3 3v18h18" />
          <rect x="7" y="11" width="3" height="6" />
          <rect x="13" y="7" width="3" height="10" />
        </svg>
      );
  }
}

function SettingsIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.6 15a1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 3.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.15.36.5.6.9.6H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function LogoutIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

const wordmarkStyle = (top: number): React.CSSProperties => ({
  mixBlendMode: "multiply",
  position: "relative",
  top,
});

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

  const names = coupleMembers
    .map((m) => m.display_name)
    .filter((n): n is string => !!n && n.trim().length > 0);
  const subtitle =
    names.length >= 2
      ? `${withConjunctionParticle(names[0])} ${withSubjectParticle(names[1])} 함께 걸은 곳`
      : "우리가 함께 걸은 곳";

  const meLabel = displayName || authUser?.email || "나";
  const meInitial = meLabel.trim().charAt(0).toUpperCase() || "·";

  // 관계 시작일 → D+
  const [startDate, setStartDate] = useState<string | null>(null);
  useEffect(() => {
    if (!authReady || !profile?.couple_id) return;
    let cancelled = false;
    supabase
      .from("couples")
      .select("start_date")
      .eq("id", profile.couple_id)
      .single()
      .then(({ data }) => {
        if (!cancelled) setStartDate((data?.start_date as string | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, profile?.couple_id]);
  const days = startDate ? daysTogether(startDate) : null;

  // 내비 카운트 (라우트 이동마다 갱신)
  const [counts, setCounts] = useState<Partial<Record<NavKey, number>>>({});
  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    (async () => {
      const [home, wishlist, courses, memories] = await Promise.all([
        supabase
          .from("places")
          .select("id", { count: "exact", head: true })
          .eq("status", "visited"),
        supabase
          .from("places")
          .select("id", { count: "exact", head: true })
          .eq("status", "wishlist")
          .eq("via_course", false),
        supabase.from("courses").select("id", { count: "exact", head: true }),
        supabase.from("memories").select("id", { count: "exact", head: true }),
      ]);
      if (cancelled) return;
      setCounts({
        home: home.count ?? 0,
        wishlist: wishlist.count ?? 0,
        courses: courses.count ?? 0,
        memories: memories.count ?? 0,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser, pathname]);

  const loggedIn = authReady && !!authUser;

  return (
    <>
      {/* ── 데스크탑 사이드바 ─────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col gap-7 border-r border-border bg-sidebar px-5 py-7 lg:flex">
        <div className="w-[168px]">
          <Link href="/" aria-label="date.log 홈" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand-wordmark.png"
              alt="date.log — our private archive"
              width={168}
              className="w-[168px] max-w-none"
              style={wordmarkStyle(-4)}
            />
          </Link>
          <p className="mt-1 text-center text-xs leading-snug text-muted-2">
            {subtitle}
          </p>
        </div>

        {loggedIn ? (
          <>
            <nav className="flex flex-col gap-1">
              {NAV.map((item) => {
                const active = navActive(pathname, item.href);
                const c = counts[item.key];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm transition-colors ${
                      active
                        ? "bg-accent-soft font-bold text-accent"
                        : "font-medium text-muted hover:bg-black/[0.03]"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        active ? "bg-accent" : "bg-[#c8bfae]"
                      }`}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {c != null && (
                      <span className="text-[11px] font-medium text-muted-3">
                        {c}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto flex flex-col gap-3">
              <Link
                href="/recap"
                aria-label="우리의 기록 보기"
                className="block rounded-2xl bg-card p-4 ring-1 ring-border transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-accent/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <p className="text-[11px] font-medium text-muted-2">
                  함께 걸은 지
                </p>
                <p className="text-3xl font-extrabold tracking-[-0.03em] text-foreground">
                  {days != null ? `${days}일` : "—"}
                </p>
                {startDate && (
                  <p className="text-[11px] text-muted-3">
                    {startDate.replace(/-/g, ".")}부터
                  </p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-foreground/70">
                    {meInitial}
                  </span>
                  <span className="truncate text-[11px] text-muted-2">
                    {meLabel}
                    {hasBatchim(meLabel) ? "으로" : "로"} 보는 중
                  </span>
                </div>
              </Link>

              <div className="flex items-center gap-1 text-muted">
                <NotificationBell />
                <Link
                  href="/settings"
                  aria-label="계정 관리"
                  className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/[0.04] hover:text-accent"
                >
                  <SettingsIcon className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  aria-label="로그아웃"
                  className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/[0.04] hover:text-accent"
                >
                  <LogoutIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        ) : null}
      </aside>

      {/* ── 모바일 상단바 ─────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
        <Link
          href="/"
          aria-label="date.log 홈"
          className="flex flex-col items-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand-wordmark.png"
            alt="date.log"
            width={104}
            className="w-[104px] max-w-none"
            style={wordmarkStyle(-3)}
          />
          <span className="mt-0.5 text-[10px] leading-tight text-muted-2">
            {subtitle}
          </span>
        </Link>
        {loggedIn && (
          <div className="flex items-center gap-1 text-muted">
            <NotificationBell />
            <Link
              href="/settings"
              aria-label="계정 관리"
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/[0.04] hover:text-accent"
            >
              <SettingsIcon className="h-[18px] w-[18px]" />
            </Link>
          </div>
        )}
      </header>

      {/* ── 모바일 하단 탭바 ─────────────────────────────── */}
      {loggedIn && (
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-sidebar lg:hidden">
          {NAV.map((item) => {
            const active = navActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors ${
                  active ? "text-accent" : "text-[#948c80]"
                }`}
              >
                <NavIcon name={item.key} className="h-[17px] w-[17px]" />
                {item.short}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
