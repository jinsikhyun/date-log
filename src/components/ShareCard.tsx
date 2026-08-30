import { forwardRef } from "react";
import type { Place } from "@/lib/places";
import { categoryIcon } from "@/lib/categories";
import { SC, CARD_W, catTag } from "@/lib/shareCardStyle";

function stars(r: number): string {
  const n = Math.max(0, Math.min(5, Math.round(r)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

/**
 * 화면 밖에 숨겨두고 html2canvas 로 캡처하는 장소 공유 카드.
 * ⚠️ html2canvas 의 커스텀 폰트 line-height/baseline 오차 → 나란히 놓인 요소가 밀림.
 *    대응: 나란히 배치는 flex + alignItems:"center", 모든 텍스트에 절대값(px) lineHeight.
 */
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
          border: `1px solid ${SC.border}`,
        }}
      >
        {/* 대표 사진 (없으면 카테고리 아이콘). overflow:hidden 은 고정 높이인 여기만. */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 300,
            background: SC.accentTint,
            overflow: "hidden",
            borderRadius: "23px 23px 0 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
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
            <span style={{ fontSize: 120, lineHeight: "1" }}>
              {categoryIcon(place.category)}
            </span>
          )}
        </div>

        {/* 본문 */}
        <div style={{ padding: "18px 22px 14px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span
              style={{
                background: tag.bg,
                color: tag.fg,
                fontSize: 12,
                fontWeight: 700,
                lineHeight: "16px",
                padding: "4px 11px",
                borderRadius: 999,
                whiteSpace: "nowrap",
              }}
            >
              {place.category}
            </span>
          </div>

          <div
            style={{
              marginTop: 10,
              fontSize: 23,
              fontWeight: 800,
              lineHeight: "30px",
            }}
          >
            {place.name}
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 13,
              lineHeight: "18px",
              color: SC.muted,
            }}
          >
            {place.address}
          </div>

          {place.rating != null && (
            <div
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  fontSize: 16,
                  lineHeight: "1",
                  color: SC.accent,
                  letterSpacing: 2,
                  fontWeight: 700,
                }}
              >
                {stars(place.rating)}
              </span>
              <span
                style={{ fontSize: 13, lineHeight: "1", color: SC.fg }}
              >
                {place.rating.toFixed(1)}
              </span>
            </div>
          )}

          {place.description && (
            <div
              style={{
                marginTop: 12,
                fontSize: 14,
                lineHeight: "22px",
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
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0 22px 18px",
          }}
        >
          <span
            style={{
              flex: "0 0 auto",
              width: 6,
              height: 6,
              borderRadius: 999,
              background: SC.accent,
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.3,
              lineHeight: "16px",
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
