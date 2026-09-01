"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";

const fieldClass =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-accent";

export function SignupForm() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ needsConfirm: boolean } | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr(null);
    if (!email.trim() || pw.length < 6) {
      setErr("이메일과 6자 이상 비밀번호를 입력해 주세요.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pw,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    // 이메일 확인이 켜져 있으면 session 이 없음
    setDone({ needsConfirm: !data.session });
  };

  if (done) {
    return (
      <div className="rounded-3xl bg-card p-6 ring-1 ring-border/70">
        <h1 className="text-lg font-bold">가입 완료 🎉</h1>
        {done.needsConfirm ? (
          <p className="mt-2 text-sm leading-relaxed text-foreground/80">
            <b>{email}</b> 로 확인 메일을 보냈어요. 메일함에서 확인 링크를 누른
            뒤에 로그인할 수 있어요. (스팸함도 확인해 보세요)
          </p>
        ) : (
          <p className="mt-2 text-sm text-foreground/80">
            바로 로그인할 수 있어요.
          </p>
        )}
        <Link
          href="/login"
          className="mt-4 inline-block rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white"
        >
          로그인 하러 가기 →
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-4 rounded-3xl bg-card p-6 ring-1 ring-border/70"
    >
      <div>
        <h1 className="text-lg font-bold">회원가입</h1>
        <p className="mt-1 text-sm text-muted">이메일과 비밀번호로 가입해요.</p>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted" htmlFor="su-email">
          이메일
        </label>
        <input
          id="su-email"
          type="email"
          autoComplete="email"
          className={fieldClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted" htmlFor="su-pw">
          비밀번호 (6자 이상)
        </label>
        <input
          id="su-pw"
          type="password"
          autoComplete="new-password"
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
        {busy ? "가입 중…" : "가입하기"}
      </button>

      <GoogleAuthButton />

      <p className="text-center text-xs text-muted">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          로그인
        </Link>
      </p>
    </form>
  );
}
