"use client";

import { useAuth } from "@/components/AuthProvider";

function HeartMini({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 21s-6.716-4.297-9.428-7.01C.86 12.278.86 9.34 2.572 7.63a4.83 4.83 0 0 1 6.828 0L12 10.229l2.6-2.6a4.83 4.83 0 0 1 6.828 6.83C18.716 16.702 12 21 12 21z" />
    </svg>
  );
}

function CrownMini({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 7l4 4 5-7 5 7 4-4-1.5 12h-15L3 7zm2.8 10h12.4v2H5.8v-2z" />
    </svg>
  );
}

/**
 * 장소 카드/상세의 즐겨찾기 태그 배지 (사진 위 우상단, 세로로 쌓임).
 * favorite_by 의 profile 이름으로 "{이름} pick" (최대 2), is_regular 면 "우리 단골".
 * 카테고리 태그(솔리드 색 pill)와 구분되게 흰색 반투명 배경 + 아이콘 + 포인트 색 글자.
 */
export function PlaceTagBadges({
  favoriteBy,
  isRegular,
  size = "md",
}: {
  favoriteBy: string[];
  isRegular: boolean;
  size?: "sm" | "md";
}) {
  const { coupleMembers } = useAuth();

  const names = (favoriteBy ?? [])
    .map((id) => coupleMembers.find((m) => m.id === id)?.display_name?.trim())
    .filter((n): n is string => !!n)
    .slice(0, 2);

  if (names.length === 0 && !isRegular) return null;

  // 카테고리 태그(px-3 py-1 text-xs)와 비슷한 크기
  const pill =
    size === "sm" ? "gap-1 px-3 py-1 text-xs" : "gap-1.5 px-3 py-1.5 text-sm";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const bg = { background: "rgba(255,255,255,0.92)" };

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-[1] flex flex-col items-end gap-1">
      {isRegular && (
        <span
          style={bg}
          className={`flex items-center rounded-full font-bold text-amber-600 shadow-sm ${pill}`}
        >
          <CrownMini className={icon} />
          단골
        </span>
      )}
      {names.map((name, i) => (
        <span
          key={i}
          style={bg}
          className={`flex items-center rounded-full font-bold text-accent shadow-sm ${pill}`}
        >
          <HeartMini className={icon} />
          {name} pick
        </span>
      ))}
    </div>
  );
}
