"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";

const fieldClass =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-accent";
const labelClass = "text-xs font-medium text-muted";

/** 신원·초대코드·정원 검증과 연결을 DB의 단일 트랜잭션에서 처리한다. */
async function connectCouple(displayName: string, inviteCode: string | null) {
  const { data, error } = await supabase.rpc("connect_couple", {
    p_display_name: displayName.trim(),
    p_invite_code: inviteCode,
  });
  if (error) {
    // 예전 직접 upsert 방식으로 폴백하면 보안 제한을 우회하게 되므로 금지.
    throw new Error(
      error.code === "PGRST202"
        ? "커플 연결 기능을 준비 중이에요. 잠시 후 다시 시도해 주세요."
        : error.message,
    );
  }
  if (data?.error) throw new Error(data.error);
  if (typeof data?.couple_id !== "string" || typeof data?.invite_code !== "string") {
    throw new Error("연결 결과를 확인할 수 없어요. 다시 로그인해 주세요.");
  }
  return data as { couple_id: string; invite_code: string };
}

export function OnboardingView() {
  const router = useRouter();
  const { user, profile, ready, refreshProfile } = useAuth();

  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  // 이 라우트만: 로그인 안 했거나 이미 커플이 있으면 비켜준다.
  // 단 방금 커플을 만들어 초대코드 화면을 보여주는 중이면 그대로 둔다.
  useEffect(() => {
    if (!ready || createdCode) return;
    if (!user) router.replace("/login");
    else if (profile?.couple_id) router.replace("/");
  }, [ready, user, profile, router, createdCode]);

  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);

  // 방금 커플을 만들었으면 초대코드 화면 (프로필이 갱신돼도 이 화면 유지)
  if (createdCode) {
    return (
      <div className="rounded-3xl bg-card p-6 text-center ring-1 ring-border/70">
        <h1 className="text-lg font-bold">커플이 만들어졌어요! 🎉</h1>
        <p className="mt-2 text-sm text-foreground/80">
          이 초대코드를 파트너에게 공유하세요:
        </p>
        <p className="my-4 break-all select-all rounded-2xl bg-accent/10 px-4 py-3 text-2xl font-extrabold tracking-widest text-accent">
          {createdCode}
        </p>
        <button
          type="button"
          // 커플 연결 직후엔 전체 새로고침 — proxy 가 새 프로필로 다시 판단
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          onClick={() => window.location.assign("/")}
          className="rounded-full bg-accent px-6 py-2 text-sm font-semibold text-white"
        >
          확인
        </button>
      </div>
    );
  }

  if (!ready || !user || profile?.couple_id) {
    return <p className="text-sm text-muted">불러오는 중…</p>;
  }

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreateErr(null);
    if (!createName.trim()) {
      setCreateErr("이름을 입력해 주세요.");
      return;
    }
    setCreating(true);
    try {
      const couple = await connectCouple(createName, null);
      setCreatedCode(couple.invite_code);
      await refreshProfile();
    } catch (err) {
      setCreateErr(err instanceof Error ? err.message : "커플 생성에 실패했어요.");
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setJoinErr(null);
    if (!joinName.trim() || !joinCode.trim()) {
      setJoinErr("이름과 초대코드를 입력해 주세요.");
      return;
    }
    setJoining(true);
    try {
      await connectCouple(joinName, joinCode.trim().toUpperCase());
      await refreshProfile();
      // 하드 이동: proxy 가 새 프로필(커플 연결됨)로 다시 판단하도록
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } catch (err) {
      setJoinErr(err instanceof Error ? err.message : "합류에 실패했어요.");
      setJoining(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">커플 연결하기</h1>
        <p className="mt-1.5 text-sm text-muted">
          새 커플을 만들거나, 파트너의 초대코드로 합류하세요.
        </p>
      </div>

      {/* 새 커플 만들기 */}
      <form
        onSubmit={handleCreate}
        className="grid gap-3 rounded-3xl bg-card p-5 ring-1 ring-border/70"
      >
        <p className="text-sm font-bold">새 커플 만들기</p>
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="ob-create-name">
            내 이름
          </label>
          <input
            id="ob-create-name"
            maxLength={50}
            required
            className={fieldClass}
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="이름을 입력하세요"
          />
        </div>
        {createErr && (
          <p className="text-sm font-medium text-red-600">{createErr}</p>
        )}
        <button
          type="submit"
          disabled={creating || joining}
          className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
        >
          {creating ? "만드는 중…" : "커플 만들기"}
        </button>
      </form>

      {/* 초대코드로 합류하기 */}
      <form
        onSubmit={handleJoin}
        className="grid gap-3 rounded-3xl bg-card p-5 ring-1 ring-border/70"
      >
        <p className="text-sm font-bold">초대코드로 합류하기</p>
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="ob-join-name">
            내 이름
          </label>
          <input
            id="ob-join-name"
            maxLength={50}
            required
            className={fieldClass}
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            placeholder="이름을 입력하세요"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="ob-join-code">
            초대코드
          </label>
          <input
            id="ob-join-code"
            maxLength={64}
            required
            className={`${fieldClass} uppercase tracking-widest`}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="파트너에게 받은 코드"
            autoCapitalize="characters"
          />
        </div>
        {joinErr && (
          <p className="text-sm font-medium text-red-600">{joinErr}</p>
        )}
        <button
          type="submit"
          disabled={joining || creating}
          className="rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition-opacity disabled:opacity-60"
        >
          {joining ? "합류 중…" : "합류하기"}
        </button>
      </form>
    </div>
  );
}
