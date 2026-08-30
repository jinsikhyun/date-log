"use client";

import { useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/places";
import { ShareCard } from "@/components/ShareCard";
import {
  captureElement,
  downloadBlob,
  canShareImage,
  shareImage,
} from "@/lib/shareImage";

type Phase = "idle" | "capturing" | "ready" | "sharing";

export function SharePlaceButton({ place }: { place: Place }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filename = `datelog-${(place.name || "place")
    .trim()
    .replace(/\s+/g, "-")}.png`;

  // 이미지 파일 공유 가능 여부 (모바일 위주).
  // 이 컴포넌트는 PlaceDetail 로드 후에만 렌더돼서 SSR 을 안 타므로 초기화에서 바로 확인해도 안전.
  const [shareable] = useState(() => canShareImage());

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const capture = async () => {
    setError(null);
    setPhase("capturing");
    try {
      // 웹폰트 로드 끝난 뒤 캡처 (글자 잘림 방지)
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      const el = cardRef.current;
      if (!el) throw new Error("카드를 준비하지 못했어요.");
      const b = await captureElement(el);
      setBlob(b);
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(b);
      });
      setPhase("ready");
    } catch (e) {
      console.error("[share] 캡처 실패:", e);
      setError(
        e instanceof Error ? e.message : "이미지를 만들지 못했어요.",
      );
      setPhase("idle");
    }
  };

  const onShare = async () => {
    if (!blob) return;
    setPhase("sharing");
    setError(null);
    try {
      await shareImage(blob, filename, { title: place.name });
      setPhase("ready");
    } catch (e) {
      // 사용자가 공유 시트를 그냥 닫은 경우는 오류 아님
      if (e instanceof Error && e.name === "AbortError") {
        setPhase("ready");
        return;
      }
      console.error("[share] 공유 실패:", e);
      setError("공유하지 못했어요. 다운로드로 저장해 보세요.");
      setPhase("ready");
    }
  };

  const reset = () => {
    setPhase("idle");
    setBlob(null);
    setError(null);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  };

  const btnBase =
    "rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60";

  return (
    <div className="rounded-3xl bg-card p-5 ring-1 ring-border/70">
      {phase === "idle" && (
        <button
          type="button"
          onClick={capture}
          className={`${btnBase} bg-accent text-white hover:opacity-90`}
        >
          이미지로 저장/공유
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
              alt="공유 카드 미리보기"
              className="w-40 rounded-2xl ring-1 ring-border"
            />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => blob && downloadBlob(blob, filename)}
              className={`${btnBase} bg-accent text-white hover:opacity-90`}
            >
              다운로드
            </button>
            {shareable && (
              <button
                type="button"
                onClick={onShare}
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
        <ShareCard ref={cardRef} place={place} />
      </div>
    </div>
  );
}
