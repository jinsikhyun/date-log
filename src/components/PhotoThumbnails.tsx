"use client";

import PhotoImage from "@/components/PhotoImage";
import { useState } from "react";
import { Lightbox } from "@/components/Lightbox";

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

            <PhotoImage
              src={u}
              displayWidth={320}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>
      {openAt !== null && (
        <Lightbox urls={list} index={openAt} onClose={() => setOpenAt(null)} />
      )}
    </>
  );
}
