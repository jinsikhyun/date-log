import { forwardRef } from "react";
import type { Place } from "@/lib/places";
import { categoryIcon } from "@/lib/categories";
import { SC, CARD_W, catTag } from "@/lib/shareCardStyle";

function stars(r: number): string {
  const n = Math.max(0, Math.min(5, Math.round(r)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

/** 화면 밖에 숨겨두고 html2canvas 로 캡처하는 장소 공유 카드 (고정 폭, 세로로 약간 긴 비율) */
export const ShareCard = forwardRef<HTMLDivElement, { place: Place }>(
  function ShareCard({ place }, ref) {
    const tag = catTag(place.category);

    return (
      <div
        ref={ref}
        style={{
          width: CARD_W,
          boxSizing: "border-box",
          fontFamily: SC.font,
          background: SC.cardBg,
          color: SC.fg,
          borderRadius: 24,
          overflow: "hidden",
          border: `1px solid ${SC.border}`,
        }}
      >
        {/* 대표 사진 (없으면 카테고리 아이콘).
            object-fit 대신 background-size:cover — html2canvas 가 object-fit 을
            제대로 못 그려서 사진이 눌리거나 비뚤어 보이는 것 방지. */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 300,
            background: SC.accentTint,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {place.image_url ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: `url("${place.image_url}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              }}
            />
          ) : (
            <span style={{ fontSize: 120, lineHeight: 1 }}>
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
          <div style={{ marginTop: 7, fontSize: 13, color: SC.muted }}>
            {place.address}
          </div>

          {place.rating != null && (
            <div
              style={{
                marginTop: 13,
                fontSize: 16,
                color: SC.accent,
                letterSpacing: 2,
                fontWeight: 700,
              }}
            >
              {stars(place.rating)}{" "}
              <span style={{ color: SC.fg, fontSize: 13, letterSpacing: 0 }}>
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
                color: SC.fgSoft,
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
              background: SC.accent,
              display: "inline-block",
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.3,
              color: SC.muted,
            }}
          >
            date.log
          </span>
        </div>
      </div>
    );
  },
);
