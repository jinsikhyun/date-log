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
 * ⚠️ html2canvas 는 flexbox / absolute overlay / object-fit 처리가 부실하다.
 *    → 레이아웃은 block + inline-block(vertical-align) 로만, 사진은 background-size:cover,
 *      카테고리 태그는 사진 위 오버레이가 아니라 본문 안 일반 흐름에 둔다.
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
        {/* 대표 사진 (없으면 카테고리 아이콘).
            overflow:hidden 은 여기(고정 높이 300)만 — 배경이미지를 둥근 윗모서리로 자르기 위함.
            루트에는 overflow 를 두지 않는다(하단 잘림 우려 제거). */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 300,
            background: SC.accentTint,
            overflow: "hidden",
            borderRadius: "23px 23px 0 0",
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
            <div
              style={{
                position: "absolute",
                inset: 0,
                textAlign: "center",
                fontSize: 120,
                lineHeight: "300px",
              }}
            >
              {categoryIcon(place.category)}
            </div>
          )}
        </div>

        {/* 본문 */}
        <div style={{ padding: "18px 22px 14px" }}>
          <span
            style={{
              display: "inline-block",
              background: tag.bg,
              color: tag.fg,
              fontSize: 12,
              fontWeight: 700,
              padding: "4px 11px",
              borderRadius: 999,
              whiteSpace: "nowrap",
            }}
          >
            {place.category}
          </span>

          <div
            style={{
              marginTop: 10,
              fontSize: 23,
              fontWeight: 800,
              lineHeight: 1.3,
            }}
          >
            {place.name}
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 13,
              color: SC.muted,
              lineHeight: 1.5,
            }}
          >
            {place.address}
          </div>

          {place.rating != null && (
            <div
              style={{
                marginTop: 12,
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
                marginTop: 12,
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
        <div style={{ padding: "0 22px 18px" }}>
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: 999,
              background: SC.accent,
              verticalAlign: "middle",
              marginRight: 6,
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.3,
              color: SC.muted,
              verticalAlign: "middle",
            }}
          >
            date.log
          </span>
        </div>
      </div>
    );
  },
);
