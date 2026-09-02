"use client";

import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useShareImage } from "@/lib/useShareImage";

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-3.5 w-3.5"
    >
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/**
 * 작은 원형 공유 아이콘 버튼 + 모달.
 * 버튼을 누르면 화면 밖 카드를 캡처하고, 오버레이 모달에 미리보기 + 다운로드/공유하기.
 * renderCard(ref) 로 캡처 대상 카드를 받는다.
 */
export function ShareImageModal({
  filename,
  title = "이미지로 공유",
  renderCard,
}: {
  filename: string;
  title?: string;
  renderCard: (ref: RefObject<HTMLDivElement | null>) => ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { phase, previewUrl, error, shareable, capture, download, share, reset } =
    useShareImage(cardRef, filename);
  const [open, setOpen] = useState(false);

  // reset() 은 "닫을 때"만 호출한다. openModal 에서 부르면 openModal 이
  // (드물게) 한 틱에 두 번 불릴 때 capturingRef 가 초기화돼 캡처가 두 번 돈다.
  const openModal = () => {
    if (open) return;
    setOpen(true);
    void capture(); // 내부 capturingRef 가드가 한 틱 이중호출도 막는다
  };
  const closeModal = () => {
    setOpen(false);
    reset();
  };

  // Esc 닫기 + body 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        reset();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, reset]);

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label="이미지로 공유"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600 transition-colors hover:bg-stone-200 hover:text-accent"
      >
        <ShareIcon />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeModal();
            }}
          >
            <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-foreground">{title}</h2>
                <button
                  type="button"
                  onClick={closeModal}
                  aria-label="닫기"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
                >
                  <XIcon />
                </button>
              </div>

              <div className="mt-4 flex min-h-[160px] items-center justify-center rounded-2xl bg-stone-50 p-4">
                {phase === "capturing" ? (
                  <p className="py-10 text-sm text-muted">이미지 만드는 중…</p>
                ) : previewUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={previewUrl}
                    alt="공유 이미지 미리보기"
                    className="max-h-[55vh] max-w-full rounded-xl"
                  />
                ) : (
                  <p className="py-10 text-sm font-medium text-red-600">
                    {error ?? "이미지를 만들지 못했어요."}
                  </p>
                )}
              </div>

              {error && previewUrl && (
                <p className="mt-2 text-center text-xs text-red-600">{error}</p>
              )}

              <div className="mt-4 flex gap-2">
                {error && !previewUrl && phase !== "capturing" && (
                  <button type="button" onClick={() => void capture()}
                    className="rounded-full bg-stone-100 px-4 py-2.5 text-sm font-semibold">
                    다시 시도
                  </button>
                )}
                <button
                  type="button"
                  onClick={download}
                  disabled={!previewUrl}
                  className="flex-1 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  다운로드
                </button>
                {shareable && (
                  <button
                    type="button"
                    onClick={() => void share()}
                    disabled={!previewUrl || phase === "sharing"}
                    className="flex-1 rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background disabled:opacity-50"
                  >
                    {phase === "sharing" ? "공유 중…" : "공유하기"}
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* 화면 밖 캡처 전용 카드 (display:none 이면 크기 측정 불가 → 밖으로만 밀어냄) */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "-9999px",
          top: "-9999px",
          width: "fit-content",
          pointerEvents: "none",
        }}
      >
        {renderCard(cardRef)}
      </div>
    </>
  );
}
