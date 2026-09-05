"use client";

import { type ReactNode, useRef } from "react";
import { createPortal } from "react-dom";
import { useDialogA11y } from "@/lib/useDialogA11y";
import { SHARE_OUTPUTS, SHARE_RATIOS, type ShareRatio } from "@/lib/shareOutputs";

const THUMB_W = 96;

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function RatioThumb({ ratio, renderCard }: { ratio: ShareRatio; renderCard: (ratio: ShareRatio) => ReactNode }) {
  const { width, height } = SHARE_OUTPUTS[ratio];
  const scale = THUMB_W / width;
  const thumbH = Math.round(height * scale);
  return (
    <div
      style={{ width: THUMB_W, height: thumbH, overflow: "hidden", position: "relative", flexShrink: 0 }}
      aria-hidden="true"
    >
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {renderCard(ratio)}
      </div>
    </div>
  );
}

export function ShareRatioModal({
  ratio,
  onChangeRatio,
  onCancel,
  onPreview,
  renderCard,
}: {
  ratio: ShareRatio;
  onChangeRatio: (r: ShareRatio) => void;
  onCancel: () => void;
  onPreview: () => void;
  renderCard: (ratio: ShareRatio) => ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useDialogA11y(true, onCancel, containerRef);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-ratio-title"
        className="w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
      >
        <h2 id="share-ratio-title" className="text-base font-bold text-foreground">
          어떤 비율로 저장할까요?
        </h2>

        <div className="mt-4 flex flex-col gap-2" role="radiogroup" aria-label="공유 이미지 비율">
          {SHARE_RATIOS.map((r) => {
            const selected = r === ratio;
            const { label, width, height } = SHARE_OUTPUTS[r];
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChangeRatio(r)}
                className={`flex items-center gap-3 rounded-2xl border p-2.5 text-left transition-colors ${
                  selected ? "border-accent bg-accent/5" : "border-border hover:bg-black/[0.02]"
                }`}
                style={{ borderWidth: selected ? 2 : 1 }}
              >
                <RatioThumb ratio={r} renderCard={renderCard} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-foreground">{label}</span>
                    {r === "feed-4x5" && (
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">
                        추천
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-2">
                    {width} × {height}
                  </span>
                </span>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    selected ? "border-accent bg-accent text-white" : "border-border-strong text-transparent"
                  }`}
                  aria-hidden="true"
                >
                  <CheckIcon />
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full bg-stone-100 px-4 py-2.5 text-sm font-semibold text-foreground"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onPreview}
            className="flex-1 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            미리보기
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
