"use client";

import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useShareImage } from "@/lib/useShareImage";
import { useDialogA11y } from "@/lib/useDialogA11y";
import type { ShareRatio } from "@/lib/shareOutputs";

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function SharePreviewModal({
  ratio,
  filename,
  onChangeRatio,
  onClose,
  renderCard,
}: {
  ratio: ShareRatio;
  filename: string;
  onChangeRatio: () => void;
  onClose: () => void;
  renderCard: (ref: RefObject<HTMLDivElement | null>, ratio: ShareRatio) => ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { phase, previewUrl, error, shareable, capture, download, share, reset } = useShareImage(
    cardRef,
    filename,
    { pixelRatio: 1 },
  );
  useDialogA11y(true, onClose, containerRef);

  useEffect(() => {
    reset();
    void capture();
    // ratio 가 바뀔 때마다 새 크기로 재캡처. capture/reset 은 매 렌더 재생성되는 함수라 deps 에서 뺀다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratio]);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/90 p-4">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="공유 이미지 미리보기"
        className="flex h-full flex-col"
      >
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <XIcon />
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-hidden py-4">
          {phase === "capturing" || phase === "idle" ? (
            <p className="text-sm text-white/80">이미지 만드는 중…</p>
          ) : previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="공유 이미지 미리보기"
              className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            />
          ) : (
            <p className="max-w-xs text-center text-sm font-medium text-red-300">
              {error ?? "이미지를 만들지 못했어요."}
            </p>
          )}
        </div>

        <div className="mx-auto w-full max-w-sm shrink-0 space-y-2 pb-[max(env(safe-area-inset-bottom),0px)]">
          {error && previewUrl && <p className="text-center text-xs text-red-300">{error}</p>}
          {error && !previewUrl && phase !== "capturing" && (
            <button
              type="button"
              onClick={() => void capture()}
              className="w-full rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold text-white"
            >
              다시 시도
            </button>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onChangeRatio}
              className="flex-1 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/20"
            >
              비율 변경
            </button>
            <button
              type="button"
              onClick={download}
              disabled={!previewUrl}
              className="flex-1 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              이미지 저장
            </button>
            {shareable && (
              <button
                type="button"
                onClick={() => void share()}
                disabled={!previewUrl || phase === "sharing"}
                className="flex-1 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {phase === "sharing" ? "공유 중…" : "공유하기"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 화면 밖 캡처 전용 카드 */}
      <div aria-hidden style={{ position: "absolute", left: "-9999px", top: "-9999px", width: "fit-content", pointerEvents: "none" }}>
        {renderCard(cardRef, ratio)}
      </div>
    </div>,
    document.body,
  );
}
