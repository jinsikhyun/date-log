"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDialogA11y } from "@/lib/useDialogA11y";

export type DateSuggestion = {
  id: string;
  eyebrow: string;
  title: string;
  message: string;
  note?: string;
  href: string;
  ctaLabel: string;
};

const SESSION_KEY_PREFIX = "datelog:date-suggestion:";

function DateHintMark() {
  return (
    <svg viewBox="0 0 72 42" aria-hidden="true" className="h-10 w-[68px] text-accent">
      <path
        d="M5 31c10-17 20-22 30-15 8 6 14 5 21-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
      <circle cx="5" cy="31" r="3" fill="var(--background)" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="35" cy="16" r="3" fill="var(--background)" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="56" cy="11" r="3" fill="var(--background)" stroke="currentColor" strokeWidth="1.7" />
      <path d="M61 7l6-4M63 12h7M59 4l2-3" stroke="var(--amber)" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

export function DateSuggestionPopup({
  suggestion,
  forceOpen = false,
  onDismiss,
}: {
  suggestion: DateSuggestion | null;
  forceOpen?: boolean;
  /** 실제 백엔드 힌트 연결용 — 닫힐 때(X, "다음에 볼게요", CTA 클릭, Escape) 호출된다.
   *  예: useTodayHint 의 dismiss() 를 넘겨 그날 재노출을 막는다. */
  onDismiss?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    if (!forceOpen && suggestion) {
      sessionStorage.setItem(`${SESSION_KEY_PREFIX}${suggestion.id}`, "dismissed");
    }
    onDismiss?.();
  }, [forceOpen, suggestion, onDismiss]);

  useDialogA11y(open, close, dialogRef);

  useEffect(() => {
    if (!suggestion) {
      setOpen(false);
      return;
    }
    if (forceOpen) {
      setOpen(true);
      return;
    }
    const dismissed = sessionStorage.getItem(`${SESSION_KEY_PREFIX}${suggestion.id}`);
    if (!dismissed) setOpen(true);
  }, [forceOpen, suggestion]);

  if (!open || !suggestion) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-foreground/20 px-3 pb-3 pt-16 backdrop-blur-[2px] sm:items-center sm:p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="date-suggestion-title"
        aria-describedby="date-suggestion-description"
        className="motion-safe:animate-[fade-in_.28s_ease-out] relative w-full max-w-[430px] overflow-hidden rounded-[28px] border border-border-strong bg-surface shadow-[0_28px_80px_-36px_rgba(48,46,43,.6)]"
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-accent" aria-hidden="true" />
        <button
          type="button"
          onClick={close}
          aria-label="데이트 추천 닫기"
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-xl font-light text-muted-2 transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ×
        </button>

        <div className="px-6 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-8">
          <div className="flex items-start justify-between gap-5 pr-10">
            <div>
              <p className="text-[10px] font-semibold tracking-[.18em] text-accent">
                {suggestion.eyebrow}
              </p>
              <p className="mt-2 text-xs text-muted-3">오늘의 작은 데이트 힌트</p>
            </div>
            <DateHintMark />
          </div>

          <div className="mt-7 border-y border-border py-6">
            <h2
              id="date-suggestion-title"
              className="max-w-[310px] break-keep text-[27px] font-extrabold leading-[1.28] tracking-[-.035em] text-foreground sm:text-[30px]"
            >
              {suggestion.title}
            </h2>
            <p
              id="date-suggestion-description"
              className="mt-4 break-keep text-[15px] leading-7 text-muted-2"
            >
              {suggestion.message}
            </p>
            {suggestion.note && (
              <p className="mt-4 text-xs leading-5 text-muted-3">{suggestion.note}</p>
            )}
          </div>

          <div className="mt-6 grid gap-2.5">
            <Link
              href={suggestion.href}
              onClick={close}
              className="flex min-h-12 items-center justify-center rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {suggestion.ctaLabel}
              <span className="ml-2" aria-hidden="true">→</span>
            </Link>
            <button
              type="button"
              onClick={close}
              className="min-h-11 rounded-full px-5 py-2.5 text-xs font-medium text-muted-2 transition-colors hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              다음에 볼게요
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
