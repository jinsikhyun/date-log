"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 사진 크게 보기 라이트박스.
 * - 어두운 반투명 배경 + object-contain(원본 비율 유지, 크롭 없음)
 * - 뷰포트 안에 들어가는 선에서 최대 크기 (max-h-[85vh] max-w-full)
 * - X 버튼 / 바깥(배경) 클릭 / Esc 로 닫힘
 * - urls 가 2장 이상이면 좌우 이동 + 카운터 (장소 대표 사진처럼 1장이면 안 보임)
 */
export function Lightbox({
  urls,
  index = 0,
  onClose,
}: {
  urls: string[];
  index?: number;
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

  // 클릭(클라이언트)으로만 렌더되므로 document 는 항상 존재
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="사진 크게 보기"
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
