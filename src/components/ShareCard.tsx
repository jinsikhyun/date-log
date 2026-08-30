import { forwardRef } from "react";
import type { Place } from "@/lib/places";
import { categoryColorName, categoryIcon } from "@/lib/categories";

// ⚠️ 캡처 전용. html2canvas 는 Tailwind v4 의 oklch() 색을 못 읽으므로
//    이 카드는 Tailwind 색 클래스를 쓰지 않고 전부 인라인 hex 로만 스타일링한다.
const CARD_BG = "#ffffff";
const FG = "#3c332b";
const FG_SOFT = "#5c5148";
const MUTED = "#8a7d70";
const ACCENT = "#e0785c";
const BORDER = "#efe4d7";
const ACCENT_TINT = "#fbe9e3";

// 카테고리 색 이름 → (배경, 글자) hex. (Tailwind 100/700 근사값)
const TAG_HEX: Record<string, { bg: string; fg: string }> = {
  stone: { bg: "#e7e5e4", fg: "#57534e" },
  red: { bg: "#fee2e2", fg: "#b91c1c" },
  orange: { bg: "#ffedd5", fg: "#c2410c" },
  amber: { bg: "#fef3c7", fg: "#92400e" },
  yellow: { bg: "#fef9c3", fg: "#854d0e" },
  lime: { bg: "#ecfccb", fg: "#4d7c0f" },
  green: { bg: "#dcfce7", fg: "#15803d" },
  emerald: { bg: "#d1fae5", fg: "#047857" },
  teal: { bg: "#ccfbf1", fg: "#0f766e" },
  cyan: { bg: "#cffafe", fg: "#0e7490" },
  sky: { bg: "#e0f2fe", fg: "#0369a1" },
  blue: { bg: "#dbeafe", fg: "#1d4ed8" },
  indigo: { bg: "#e0e7ff", fg: "#4338ca" },
  violet: { bg: "#ede9fe", fg: "#6d28d9" },
  purple: { bg: "#f3e8ff", fg: "#7e22ce" },
  fuchsia: { bg: "#fae8ff", fg: "#a21caf" },
  pink: { bg: "#fce7f3", fg: "#be185d" },
  rose: { bg: "#ffe1e2", fg: "#be123c" },
};

const FONT =
  '"Apple SD Gothic Neo", "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

function stars(r: number): string {
  const n = Math.max(0, Math.min(5, Math.round(r)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

/** 화면 밖에 숨겨두고 html2canvas 로 캡처하는 장소 공유 카드 (360px 폭, 세로로 약간 긴 비율) */
export const ShareCard = forwardRef<HTMLDivElement, { place: Place }>(
  function ShareCard({ place }, ref) {
    const tag = TAG_HEX[categoryColorName(place.category)] ?? {
      bg: ACCENT_TINT,
      fg: "#b7532f",
    };

    return (
      <div
        ref={ref}
        style={{
          width: 360,
          fontFamily: FONT,
          background: CARD_BG,
          color: FG,
          borderRadius: 24,
          overflow: "hidden",
          border: `1px solid ${BORDER}`,
        }}
      >
        {/* 대표 사진 (없으면 카테고리 아이콘) */}
        <div
          style={{
            position: "relative",
            width: 360,
            height: 360,
            background: ACCENT_TINT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {place.image_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={place.image_url}
              crossOrigin="anonymous"
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : (
            <span style={{ fontSize: 130, lineHeight: 1 }}>
              {categoryIcon(place.category)}
            </span>
          )}

          <span
            style={{
              position: "absolute",
              left: 16,
              top: 16,
              background: tag.bg,
              color: tag.fg,
              fontSize: 13,
              fontWeight: 700,
              padding: "5px 12px",
              borderRadius: 999,
            }}
          >
            {place.category}
          </span>
        </div>

        {/* 본문 */}
        <div style={{ padding: "20px 22px 14px" }}>
          <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.25 }}>
            {place.name}
          </div>
          <div style={{ marginTop: 7, fontSize: 13, color: MUTED }}>
            {place.address}
          </div>

          {place.rating != null && (
            <div
              style={{
                marginTop: 13,
                fontSize: 16,
                color: ACCENT,
                letterSpacing: 2,
                fontWeight: 700,
              }}
            >
              {stars(place.rating)}{" "}
              <span style={{ color: FG, fontSize: 13, letterSpacing: 0 }}>
                {place.rating.toFixed(1)}
              </span>
            </div>
          )}

          {place.description && (
            <div
              style={{
                marginTop: 13,
                fontSize: 14,
                lineHeight: 1.6,
                color: FG_SOFT,
              }}
            >
              &ldquo;{place.description}&rdquo;
            </div>
          )}
        </div>

        {/* 워터마크 */}
        <div
          style={{
            padding: "0 22px 18px",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: ACCENT,
              display: "inline-block",
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.3,
              color: MUTED,
            }}
          >
            date.log
          </span>
        </div>
      </div>
    );
  },
);
