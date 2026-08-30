"use client";

import { type ReactNode, type RefObject, useRef } from "react";
import { useShareImage } from "@/lib/useShareImage";

const btnBase =
  "rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60";

/**
 * "이미지로 저장/공유" 공용 UI + 상태 머신.
 * renderCard(ref) 로 화면 밖 캡처 카드를 받는다 — 그 ref 를 카드의 ref 에 연결해야 한다.
 */
export function ShareImagePanel({
  filename,
  shareTitle,
  label = "이미지로 저장/공유",
  renderCard,
}: {
  filename: string;
  shareTitle?: string;
  label?: string;
  renderCard: (ref: RefObject<HTMLDivElement | null>) => ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { phase, previewUrl, error, shareable, capture, download, share, reset } =
    useShareImage(cardRef, filename, shareTitle);

  return (
    <div className="rounded-3xl bg-card p-5 ring-1 ring-border/70">
      {phase === "idle" && (
        <button
          type="button"
          onClick={() => void capture()}
          className={`${btnBase} bg-accent text-white hover:opacity-90`}
        >
          {label}
        </button>
      )}

      {phase === "capturing" && (
        <p className="text-sm text-muted">이미지 만드는 중…</p>
      )}

      {(phase === "ready" || phase === "sharing") && (
        <div className="space-y-3">
          {previewUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={previewUrl}
              alt="공유 이미지 미리보기"
              className="w-40 rounded-2xl ring-1 ring-border"
            />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={download}
              className={`${btnBase} bg-accent text-white hover:opacity-90`}
            >
              다운로드
            </button>
            {shareable && (
              <button
                type="button"
                onClick={() => void share()}
                disabled={phase === "sharing"}
                className={`${btnBase} bg-foreground text-background`}
              >
                {phase === "sharing" ? "공유 중…" : "공유하기"}
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className={`${btnBase} bg-stone-100 text-stone-600 hover:bg-stone-200`}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm font-medium text-red-600">{error}</p>
      )}

      {/* 화면 밖 캡처 전용 카드 (display:none 이면 캡처 안 되므로 왼쪽 밖으로) */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          left: "-10000px",
          top: 0,
          pointerEvents: "none",
        }}
      >
        {renderCard(cardRef)}
      </div>
    </div>
  );
}
