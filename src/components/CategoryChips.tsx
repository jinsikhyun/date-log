"use client";

import { categoryPin } from "@/lib/places";

/**
 * 화면 상단 카테고리 필터 칩 행 (홈·위시리스트 공용).
 * 비활성: 흰 배경 + 보더 + 좌측 카테고리 도트. 활성: ink 채움.
 * 단일 선택, null = 전체.
 */
export function CategoryChips({
  categories,
  active,
  onSelect,
  className = "",
  children,
}: {
  categories: string[];
  active: string | null;
  onSelect: (cat: string | null) => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const chip = (on: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-full px-[17px] py-[9px] text-[13px] font-medium transition-colors ${
      on
        ? "bg-foreground text-surface"
        : "bg-card text-muted ring-1 ring-border hover:ring-accent-border"
    }`;

  return (
    <div
      className={`-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 ${className}`}
    >
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={active === null}
        className={chip(active === null)}
      >
        전체
      </button>
      {categories.map((c) => {
        const on = active === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onSelect(c)}
            aria-pressed={on}
            className={chip(on)}
          >
            <span
              className="h-[7px] w-[7px] shrink-0 rounded-full"
              style={{ background: on ? "currentColor" : categoryPin(c) }}
            />
            {c}
          </button>
        );
      })}
      {children}
    </div>
  );
}
