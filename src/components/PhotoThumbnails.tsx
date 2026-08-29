"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** 정사각 썸네일 가로 나열 + 클릭 시 라이트박스. urls 가 비면 아무것도 렌더 안 함. */
export function PhotoThumbnails({
  urls,
  className,
}: {
  urls: string[] | null | undefined;
  className?: string;
}) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const list = urls ?? [];
  if (list.length === 0) return null;

  return (
    <>
      <div className={`flex flex-wrap gap-2 ${className ?? ""}`}>
        {list.map((u, i) => (
          <button
            key={`${u}-${i}`}
            type="button"
            onClick={(e) => {
              // 카드 전체가 링크인 경우(예: /memories)에도 라이트박스만 열리도록
              e.preventDefault();
              e.stopPropagation();
              setOpenAt(i);
            }}
            className="h-16 w-16 shrink-0 overflow-hidden rounded-lg ring-1 ring-border/70 transition-transform hover:scale-[1.04]"
            aria-label={`사진 ${i + 1} 크게 보기`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={u}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>
      {openAt !== null && (
        <Lightbox
          urls={list}
          index={openAt}
          onClose={() => setOpenAt(null)}
        />
      )}
    </>
  );
}

function Lightbox({
  urls,
  index,
  onClose,
}: {
  urls: string[];
  index: number;
  onClose: () => void;
}) {
  const [i, setI] = useState(index);

  const prev = () => setI((v) => (v - 1 + urls.length) % urls.length);
  const next = () => setI((v) => (v + 1) % urls.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lightbox 는 클릭(클라이언트)으로만 렌더되므로 document 는 항상 존재
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="absolute right-4 top-4 rounded-full bg-white/15 px-3 py-1 text-lg font-bold text-white hover:bg-white/25"
      >
        ✕
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={urls[i]}
        alt=""
        className="max-h-[85vh] max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {urls.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            aria-label="이전 사진"
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-3 py-2 text-xl text-white hover:bg-white/25"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            aria-label="다음 사진"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-3 py-2 text-xl text-white hover:bg-white/25"
          >
            ›
          </button>
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white">
            {i + 1} / {urls.length}
          </span>
        </>
      )}
    </div>,
    document.body,
  );
}
