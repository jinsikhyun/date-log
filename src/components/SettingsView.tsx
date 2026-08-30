"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";

export function SettingsView() {
  const router = useRouter();
  const { user, profile, ready } = useAuth();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 관계 시작일
  const [startDate, setStartDate] = useState(""); // <input type="date"> 값 ("" = 미설정)
  const [savedStartDate, setSavedStartDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

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
      .select("invite_code, start_date")
      .eq("id", profile.couple_id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setInviteCode((data?.invite_code as string) ?? null);
        const sd = (data?.start_date as string | null) ?? null;
        setSavedStartDate(sd);
        setStartDate(sd ?? "");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, user, profile, router]);

  if (!ready || !user || !profile?.couple_id) {
    return <p className="text-sm text-muted">불러오는 중…</p>;
  }

  const handleSaveStartDate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaveErr(null);
    setSaveMsg(null);
    setSaving(true);
    const value = startDate || null; // 비우면 미설정으로
    const { error } = await supabase
      .from("couples")
      .update({ start_date: value })
      .eq("id", profile.couple_id);
    setSaving(false);
    if (error) {
      setSaveErr(`저장 실패: ${error.message}`);
      return;
    }
    setSavedStartDate(value);
    setSaveMsg("저장했어요.");
  };

  const dirty = (startDate || null) !== (savedStartDate ?? null);

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

      {/* 관계 시작일 */}
      <form
        onSubmit={handleSaveStartDate}
        className="rounded-3xl bg-card p-5 ring-1 ring-border/70"
      >
        <p className="text-xs font-medium text-muted">관계 시작일</p>
        <p className="mt-1 text-xs text-muted">
          “함께한 지 N일째” 계산의 기준이 돼요. 둘 중 누구든 수정할 수 있어요.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={startDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => {
              setStartDate(e.target.value);
              setSaveMsg(null);
              setSaveErr(null);
            }}
            disabled={loading || saving}
            className="rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-accent"
          />
          <button
            type="submit"
            disabled={loading || saving || !dirty}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
          {startDate && (
            <button
              type="button"
              onClick={() => {
                setStartDate("");
                setSaveMsg(null);
                setSaveErr(null);
              }}
              disabled={loading || saving}
              className="text-xs text-muted transition-colors hover:text-accent"
            >
              비우기
            </button>
          )}
        </div>
        {saveMsg && (
          <p className="mt-2 text-xs font-medium text-accent">{saveMsg}</p>
        )}
        {saveErr && (
          <p className="mt-2 text-xs font-medium text-red-600">{saveErr}</p>
        )}
      </form>

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
