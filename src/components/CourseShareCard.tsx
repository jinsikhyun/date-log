import { forwardRef } from "react";
import { haversineKm, walkMinutes } from "@/lib/courses";
import { SC, CARD_W, catTag } from "@/lib/shareCardStyle";

export type ShareStop = {
  id: number;
  name: string;
  category: string;
};
type Coord = { lat: number; lng: number };

/**
 * 화면 밖에 숨겨두고 공유 PNG로 캡처하는 코스 공유 카드.
 * 지도 이미지는 넣지 않고 번호 리스트 + 구간 거리/시간으로 동선 표현.
 *
 * ⚠️ html2canvas 는 커스텀 폰트의 line-height / baseline 을 브라우저와 다르게 계산해서
 *    vertical-align 이나 배수 line-height 에 의존하면 캡처본에서 요소가 밀린다. 그래서:
 *      - 나란히 놓인 요소는 전부 flex + alignItems:"center"
 *      - 모든 텍스트에 절대값(px) lineHeight
 */
export const CourseShareCard = forwardRef<
  HTMLDivElement,
  {
    title: string;
    concept: string | null;
    stops: ShareStop[];
    coords: Map<number, Coord | null>;
  }
>(function CourseShareCard({ title, concept, stops, coords }, ref) {
  return (
    <div
      ref={ref}
      style={{
        width: CARD_W,
        boxSizing: "border-box",
        overflowWrap: "anywhere",
        fontFamily: SC.font,
        background: SC.cardBg,
        color: SC.fg,
        borderRadius: 24,
        border: `1px solid ${SC.border}`,
      }}
    >
      {/* 헤더 */}
      <div style={{ padding: "22px 24px 14px" }}>
        <div style={{ fontSize: 21, fontWeight: 800, lineHeight: "28px" }}>
          {title}
        </div>
        {concept ? (
          <div
            style={{
              marginTop: 8,
              fontSize: 13,
              lineHeight: "20px",
              whiteSpace: "pre-wrap",
              color: SC.fgSoft,
            }}
          >
            {concept}
          </div>
        ) : null}
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            lineHeight: "16px",
            color: SC.muted,
          }}
        >
          장소 {stops.length}곳
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${SC.border}` }} />

      {/* 순서 리스트 */}
      <div style={{ padding: "14px 24px 6px" }}>
        {stops.map((s, i) => {
          const tag = catTag(s.category);
          const a = coords.get(s.id) ?? null;
          const b =
            i < stops.length - 1
              ? (coords.get(stops[i + 1].id) ?? null)
              : null;
          const km = a && b ? haversineKm(a, b) : null;
          const last = i === stops.length - 1;

          return (
            <div key={s.id}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  marginBottom: last ? 6 : 0,
                }}
              >
                <span
                  style={{
                    flex: "0 0 auto",
                    alignSelf: "center",
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    background: SC.accent,
                    color: "#ffffff",
                    fontSize: 12,
                    fontWeight: 800,
                    lineHeight: "1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {i + 1}
                </span>
                <span
                  style={{
                    flex: "1 1 auto",
                    minWidth: 0,
                    fontSize: 15,
                    fontWeight: 700,
                    lineHeight: "20px",
                    color: SC.fg,
                  }}
                >
                  {s.name}
                </span>
                <span
                  style={{
                    flex: "0 0 auto",
                    background: tag.bg,
                    color: tag.fg,
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: "16px",
                    padding: "2px 8px",
                    borderRadius: 999,
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.category}
                </span>
              </div>

              {!last && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 0 5px 5px",
                    fontSize: 12,
                    lineHeight: "16px",
                    color: SC.muted,
                  }}
                >
                  <span>↓</span>
                  <span>
                    {km != null
                      ? `직선거리 ${km.toFixed(km < 1 ? 2 : 1)}km · 도보 약 ${walkMinutes(
                          km,
                        )}분`
                      : "거리 정보 없음"}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 워터마크 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 24px 20px",
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
});
