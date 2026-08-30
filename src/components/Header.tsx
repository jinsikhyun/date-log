// 상단 사이트 이름 + 탭 메뉴. 전부 실제 라우트로 연결.
// 카테고리 필터(맛집/카페…)는 홈 화면 안의 탭에서 처리한다.
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { NotificationBell } from "@/components/NotificationBell";
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

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-3 w-3 shrink-0 transition-transform duration-200 ${
        open ? "rotate-180" : ""
      }`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.6 15a1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 3.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.15.36.5.6.9.6H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

/** 우측 상단 계정 배지 + 드롭다운 (설정 / 로그아웃) */
function AccountMenu({
  meLabel,
  partnerName,
  onSignOut,
}: {
  meLabel: string;
  partnerName: string | null;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭(탭·로고 클릭 포함) / Esc 로 닫기. 메뉴 항목은 각자 onClick 에서 닫는다.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const rightLabel = partnerName ?? "파트너 초대";

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 py-1 pl-1 pr-2.5 text-xs font-medium text-accent transition-colors hover:bg-accent/15"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-white">
          <HeartIcon className="h-2.5 w-2.5" />
        </span>
        <span className="max-w-[170px] truncate">
          {meLabel} <span className="text-accent/40">·</span> {rightLabel}
        </span>
        <ChevronDown open={open} />
      </button>

      <div
        role="menu"
        className={`absolute right-0 top-full z-40 mt-1.5 w-40 origin-top-right overflow-hidden rounded-xl border border-border bg-white py-1 shadow-lg transition duration-150 ${
          open
            ? "scale-100 opacity-100"
            : "pointer-events-none scale-95 opacity-0"
        }`}
      >
        <Link
          href="/settings"
          role="menuitem"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2 px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-stone-50 hover:text-accent"
        >
          <GearIcon />
          설정
        </Link>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            onSignOut();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground/80 transition-colors hover:bg-stone-50 hover:text-accent"
        >
          <LogoutIcon />
          로그아웃
        </button>
      </div>
    </div>
  );
}

export function Header() {
  const pathname = usePathname();
  const {
    user: authUser,
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
  const partner = coupleMembers.find((m) => m.id !== authUser?.id) ?? null;
  const partnerName = partner?.display_name?.trim() || null;

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur">
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
            {authReady &&
              (authUser ? (
                <>
                  <NotificationBell />
                  <AccountMenu
                    meLabel={displayName || authUser.email || "나"}
                    partnerName={partnerName}
                    onSignOut={() => void signOut()}
                  />
                </>
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
