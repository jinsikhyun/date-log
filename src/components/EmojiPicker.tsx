"use client";

import { useEffect, useRef, useState } from "react";

// 댓글 텍스트에 삽입할 이모지 (반응 이모지와 별개)
const EMOJIS = [
  "❤️",
  "😂",
  "😭",
  "😍",
  "🥹",
  "😳",
  "🙈",
  "👍",
  "🔥",
  "✨",
  "😅",
  "🥲",
];

function SmileyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-[18px] w-[18px]"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14a4 4 0 0 0 8 0" />
      <path d="M9 9h.01M15 9h.01" />
    </svg>
  );
}

/** 웃는 얼굴 버튼 → 이모지 선택판 팝업. 고르면 onPick(emoji) 호출 후 닫힘. */
export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        type="button"
        // 입력창의 포커스/커서 위치를 뺏지 않도록 mousedown 기본동작 차단
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        aria-label="이모지 넣기"
        aria-expanded={open}
        className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-stone-100 ${
          open ? "text-accent" : "text-stone-400 hover:text-accent"
        }`}
      >
        <SmileyIcon />
      </button>

      {open && (
        // 위로 연다 (입력창 위 공간이 넓음)
        <div
          role="menu"
          className="absolute bottom-full right-0 z-20 mb-1.5 grid w-max grid-cols-6 gap-0.5 rounded-2xl border border-border bg-white p-1.5 shadow-lg"
        >
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => {
                onPick(e);
                setOpen(false);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-transform hover:scale-110 hover:bg-stone-100"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
