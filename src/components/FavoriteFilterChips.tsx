"use client";

import { useAuth } from "@/components/AuthProvider";
import type { FavoriteFilter } from "@/lib/places";

/**
 * 카테고리 탭(주 필터) 아래에 놓이는 보조 토글 칩.
 * "{이름} pick" (커플 구성원별) + "단골". 여러 개 동시 on 가능(OR).
 * 카테고리 탭보다 작고 옅게 → 시각적 위계: 카테고리 > 즐겨찾기.
 */
export function FavoriteFilterChips({
  value,
  onChange,
}: {
  value: FavoriteFilter;
  onChange: (next: FavoriteFilter) => void;
}) {
  const { coupleMembers } = useAuth();
  const members = coupleMembers.filter((m) => m.display_name?.trim());
  if (members.length === 0) return null;

  // 카테고리 탭과 크기는 맞추되(px-4 py-1.5 text-sm), 색은 옅게 → 위계 유지
  const chipClass = (on: boolean, tone: "accent" | "amber") =>
    `shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ring-1 transition-colors ${
      on
        ? tone === "amber"
          ? "bg-amber-100 text-amber-700 ring-amber-300"
          : "bg-accent/10 text-accent ring-accent/40"
        : "bg-transparent text-muted/80 ring-border hover:text-accent"
    }`;

  const toggleMember = (id: string) =>
    onChange({
      ...value,
      favoriteBy: value.favoriteBy.includes(id)
        ? value.favoriteBy.filter((x) => x !== id)
        : [...value.favoriteBy, id],
    });

  return (
    <div className="mb-6 -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pt-1.5 pb-1">
      <span className="shrink-0 pr-1 text-xs font-medium text-muted/60">
        즐겨찾기
      </span>
      {members.map((m) => {
        const on = value.favoriteBy.includes(m.id);
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggleMember(m.id)}
            className={chipClass(on, "accent")}
          >
            {m.display_name} pick
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={value.regular}
        onClick={() => onChange({ ...value, regular: !value.regular })}
        className={chipClass(value.regular, "amber")}
      >
        단골
      </button>
    </div>
  );
}
