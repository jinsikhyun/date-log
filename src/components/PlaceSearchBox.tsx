"use client";

import { useEffect, useRef, useState } from "react";

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

/**
 * 우리 장소 목록을 걸러내는 검색창. 카카오 검색이 아니라 이미 저장된 곳만 찾는다.
 * 접힘 상태에선 아이콘만 차지하고, 닫으면 검색어를 비운다.
 */
export function PlaceSearchBox({
  value,
  onChange,
  placeholder = "이름 · 주소 · 한줄평 · 태그",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    onChange("");
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="장소 검색"
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-black/[0.04] hover:text-accent"
      >
        <SearchIcon className="h-[18px] w-[18px]" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-full bg-card px-3 py-1.5 ring-1 ring-border focus-within:ring-accent">
      <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
        placeholder={placeholder}
        aria-label="장소 검색"
        className="w-40 bg-transparent text-sm outline-none placeholder:text-muted-2 sm:w-56"
      />
      <button
        type="button"
        onClick={close}
        aria-label="검색 닫기"
        className="shrink-0 text-muted transition-colors hover:text-accent"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden="true"
          className="h-4 w-4"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
