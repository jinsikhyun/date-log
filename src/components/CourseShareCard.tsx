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
 * 화면 밖에 숨겨두고 html2canvas 로 캡처하는 코스 공유 카드.
 * 지도 이미지는 넣지 않고 번호 리스트 + 구간 거리/시간으로 동선 표현. 세로로 길어져도 OK.
 * ⚠️ html2canvas flexbox 처리가 부실 → 행 레이아웃은 inline-block(vertical-align) 로만.
 *    장소명은 nowrap/ellipsis 안 씀 (길면 그냥 줄바꿈 — 잘리는 것 방지).
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
        fontFamily: SC.font,
        background: SC.cardBg,
        color: SC.fg,
        borderRadius: 24,
        overflow: "hidden",
        border: `1px solid ${SC.border}`,
      }}
    >
      {/* 헤더 */}
      <div style={{ padding: "22px 24px 14px" }}>
        <div style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.3 }}>
          {title}
        </div>
        {concept ? (
          <div
            style={{
              marginTop: 8,
              fontSize: 13,
              lineHeight: 1.6,
              color: SC.fgSoft,
            }}
          >
            {concept}
          </div>
        ) : null}
        <div style={{ marginTop: 10, fontSize: 12, color: SC.muted }}>
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
              <div style={{ marginBottom: last ? 6 : 0, lineHeight: 1.5 }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    background: SC.accent,
                    color: "#ffffff",
                    fontSize: 12,
                    fontWeight: 800,
                    textAlign: "center",
                    lineHeight: "24px",
                    verticalAlign: "middle",
                    marginRight: 9,
                  }}
                >
                  {i + 1}
                </span>
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: SC.fg,
                    verticalAlign: "middle",
                  }}
                >
                  {s.name}
                </span>
                <span
                  style={{
                    display: "inline-block",
                    marginLeft: 8,
                    background: tag.bg,
                    color: tag.fg,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 999,
                    whiteSpace: "nowrap",
                    verticalAlign: "middle",
                  }}
                >
                  {s.category}
                </span>
              </div>

              {!last && (
                <div
                  style={{
                    padding: "5px 0 5px 5px",
                    fontSize: 12,
                    color: SC.muted,
                  }}
                >
                  <span style={{ marginRight: 6 }}>↓</span>
                  {km != null
                    ? `직선거리 ${km.toFixed(km < 1 ? 2 : 1)}km · 도보 약 ${walkMinutes(
                        km,
                      )}분`
                    : "거리 정보 없음"}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 워터마크 */}
      <div style={{ padding: "8px 24px 20px" }}>
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
});
