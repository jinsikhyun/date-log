"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import {
  type Notification,
  NOTIFICATION_COLUMNS,
  relativeTime,
} from "@/lib/notifications";

export function NotificationsView() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    supabase
      .from("notifications")
      .select(NOTIFICATION_COLUMNS)
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data, error: qErr }) => {
        if (cancelled) return;
        if (qErr) {
          setError(
            `우편함을 불러오지 못했어요: ${qErr.message}` +
              " (supabase/add-notifications.sql 적용 여부를 확인해 주세요.)",
          );
        } else {
          setItems((data ?? []) as Notification[]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ready, user, router]);

  const unreadCount = items?.filter((n) => !n.is_read).length ?? 0;

  const open = async (n: Notification) => {
    if (!n.is_read) {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", n.id);
      setItems((prev) =>
        prev
          ? prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
          : prev,
      );
    }
    if (n.related_link) router.push(n.related_link);
  };

  const markAllRead = async () => {
    if (!user || unreadCount === 0) return;
    setMarkingAll(true);
    const { error: upErr } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("recipient_id", user.id)
      .eq("is_read", false);
    setMarkingAll(false);
    if (upErr) {
      window.alert(`처리하지 못했어요: ${upErr.message}`);
      return;
    }
    setItems((prev) => (prev ? prev.map((x) => ({ ...x, is_read: true })) : prev));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">우편함</h1>
          <p className="mt-1.5 text-sm text-muted">
            {items === null
              ? "불러오는 중…"
              : unreadCount > 0
                ? `안 읽은 알림 ${unreadCount}개`
                : "모두 확인했어요"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              disabled={markingAll}
              className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-200 disabled:opacity-60"
            >
              {markingAll ? "처리 중…" : "모두 읽음"}
            </button>
          )}
          <Link
            href="/"
            className="text-sm text-muted transition-colors hover:text-accent"
          >
            ← 홈으로
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {items === null && !error ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-2xl bg-stone-200/70"
            />
          ))}
        </div>
      ) : items && items.length === 0 ? (
        <p className="rounded-3xl bg-card p-12 text-center text-sm text-muted ring-1 ring-border/70">
          아직 받은 알림이 없어요.
        </p>
      ) : (
        <ul className="space-y-2">
          {(items ?? []).map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => open(n)}
                className={`flex w-full items-start gap-3 rounded-2xl p-4 text-left ring-1 transition-colors ${
                  n.is_read
                    ? "bg-card ring-border/70 hover:bg-stone-50"
                    : "bg-accent/5 ring-accent/25 hover:bg-accent/10"
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    n.is_read ? "bg-transparent" : "bg-accent"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm leading-relaxed ${
                      n.is_read
                        ? "text-foreground/70"
                        : "font-medium text-foreground/90"
                    }`}
                  >
                    {n.message}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {relativeTime(n.created_at)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
