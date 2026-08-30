"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";

export function SettingsView() {
  const router = useRouter();
  const { user, profile, ready } = useAuth();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!profile?.couple_id) {
      router.replace("/onboarding");
      return;
    }
    let cancelled = false;
    supabase
      .from("couples")
      .select("invite_code")
      .eq("id", profile.couple_id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setInviteCode((data?.invite_code as string) ?? null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, user, profile, router]);

  if (!ready || !user || !profile?.couple_id) {
    return <p className="text-sm text-muted">불러오는 중…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">설정</h1>
        <Link
          href="/"
          className="text-sm text-muted transition-colors hover:text-accent"
        >
          ← 홈으로
        </Link>
      </div>

      <div className="rounded-3xl bg-card p-5 ring-1 ring-border/70">
        <p className="text-xs font-medium text-muted">우리 커플 초대코드</p>
        <p className="my-3 select-all rounded-2xl bg-accent/10 px-4 py-3 text-center text-2xl font-extrabold tracking-widest text-accent">
          {loading ? "…" : (inviteCode ?? "(코드 없음)")}
        </p>
        <p className="text-xs text-muted">
          파트너가 아직 합류 안 했다면 이 코드를 공유하세요. “초대코드로
          합류하기”에서 입력하면 같은 커플로 연결돼요.
        </p>
      </div>

      <div className="rounded-3xl bg-card p-5 ring-1 ring-border/70">
        <p className="text-xs font-medium text-muted">내 계정</p>
        <p className="mt-2 text-sm">
          {profile.display_name ?? "(이름 없음)"}
          <span className="ml-2 text-muted">{user.email}</span>
        </p>
      </div>
    </div>
  );
}
