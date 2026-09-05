"use client";

import { useAuth } from "@/components/AuthProvider";
import { CrownMini, HeartMini } from "@/components/PlaceTagBadges";
import type { FavoriteFilter } from "@/lib/places";

/**
 * 카테고리 탭(주 필터) 아래에 놓이는 취향 필터.
 * 커플 구성원별 pick + 공동 단골. 여러 개 동시 on 가능(OR).
 * 카테고리 탭보다 작고 부드럽게 보여 주 필터와 시각적 위계를 나눈다.
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

  const chipClass = (on: boolean, tone: "accent" | "amber" | "neutral") =>
    `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${
      on
        ? tone === "amber"
          ? "bg-amber-50 text-amber-700 ring-amber-300"
          : tone === "accent"
            ? "bg-accent/10 text-accent ring-accent/30"
            : "bg-foreground text-surface ring-foreground"
        : "bg-transparent text-muted ring-border hover:text-foreground hover:ring-accent-border"
    }`;

  const toggleMember = (id: string) =>
    onChange({
      ...value,
      favoriteBy: value.favoriteBy.includes(id)
        ? value.favoriteBy.filter((x) => x !== id)
        : [...value.favoriteBy, id],
    });

  return (
    <div className="mb-6 -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 py-1">
      <button
        type="button"
        aria-pressed={!value.favoriteBy.length && !value.regular}
        onClick={() => onChange({ favoriteBy: [], regular: false })}
        className={chipClass(
          !value.favoriteBy.length && !value.regular,
          "neutral",
        )}
      >
        전체
      </button>

      {members.map((m) => {
        const on = value.favoriteBy.includes(m.id);
        const name = m.display_name?.trim() ?? "";
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={on}
            aria-label={`${name} 즐겨찾기 필터`}
            onClick={() => toggleMember(m.id)}
            className={chipClass(on, "accent")}
          >
            <HeartMini className="h-3.5 w-3.5" />
            {name}
          </button>
        );
      })}

      <button
        type="button"
        aria-pressed={value.regular}
        onClick={() => onChange({ ...value, regular: !value.regular })}
        className={chipClass(value.regular, "amber")}
      >
        <CrownMini className="h-3.5 w-3.5" />
        단골
      </button>
    </div>
  );
}
