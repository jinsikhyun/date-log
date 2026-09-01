"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";

const fieldClass =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-accent";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr(null);
    if (!email.trim() || !pw) {
      setErr("이메일과 비밀번호를 입력해 주세요.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pw,
    });

    if (error) {
      setBusy(false);
      if (/not confirmed/i.test(error.message)) {
        setErr(
          "이메일 인증이 아직 안 됐어요. 받은 메일의 확인 링크를 눌러 주세요.",
        );
      } else if (/invalid login credentials/i.test(error.message)) {
        setErr("이메일 또는 비밀번호가 올바르지 않아요.");
      } else {
        setErr(error.message);
      }
      return;
    }

    // 커플에 연결된 프로필이 없으면 온보딩으로
    const { data: prof } = await supabase
      .from("profiles")
      .select("couple_id")
      .eq("id", data.user.id)
      .maybeSingle();

    // router.push 대신 전체 이동: proxy(미들웨어)가 새 세션 쿠키로 다시 돌고,
    // 로그아웃 상태로 캐시됐을 수 있는 RSC 페이로드도 새로 받는다.
    window.location.assign(prof?.couple_id ? "/" : "/onboarding");
  };

  return (
    <form
      onSubmit={submit}
      className="grid gap-4 rounded-3xl bg-card p-6 ring-1 ring-border/70"
    >
      <div>
        <h1 className="text-lg font-bold">로그인</h1>
        <p className="mt-1 text-sm text-muted">date.log 에 오신 걸 환영해요.</p>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted" htmlFor="li-email">
          이메일
        </label>
        <input
          id="li-email"
          type="email"
          autoComplete="email"
          className={fieldClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted" htmlFor="li-pw">
          비밀번호
        </label>
        <input
          id="li-pw"
          type="password"
          autoComplete="current-password"
          className={fieldClass}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="••••••"
        />
      </div>

      {err && <p className="text-sm font-medium text-red-600">{err}</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
      >
        {busy ? "로그인 중…" : "로그인"}
      </button>

      <GoogleAuthButton />

      <p className="text-center text-xs text-muted">
        계정이 없나요?{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          회원가입
        </Link>
      </p>
    </form>
  );
}
