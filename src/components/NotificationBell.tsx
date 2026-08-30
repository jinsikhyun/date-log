"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-[18px] w-[18px]"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/** 헤더의 우편함 아이콘 + 안 읽은 개수 뱃지. 로그인 상태에서만 Header 가 렌더한다. */
export function NotificationBell() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  // 마운트 + 라우트 이동마다 안 읽은 개수 재조회 (/notifications 에서 읽고 나오면 갱신됨)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .eq("is_read", false)
      .then(({ count: c }) => {
        if (!cancelled) setCount(c ?? 0);
      });
    return () => {
      cancelled = true;
    };
  }, [user, pathname]);

  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `우편함, 안 읽음 ${count}개` : "우편함"}
      className={`relative flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-stone-100 ${
        pathname === "/notifications"
          ? "text-accent"
          : "text-stone-500 hover:text-accent"
      }`}
    >
      <BellIcon />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
