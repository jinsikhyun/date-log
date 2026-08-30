import { forwardRef } from "react";
import { haversineKm, walkMinutes } from "@/lib/courses";
import { SC, catTag } from "@/lib/shareCardStyle";

export type ShareStop = {
  id: number;
  name: string;
  category: string;
};
type Coord = { lat: number; lng: number };

/**
 * 화면 밖에 숨겨두고 html2canvas 로 캡처하는 코스 공유 카드.
 * 지도 이미지는 넣지 않고(외부 타일 캡처 깨짐 방지) 번호 리스트 + 구간 거리/시간으로 동선 표현.
 * 세로로 길어져도 OK.
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
        width: 380,
        fontFamily: SC.font,
        background: SC.cardBg,
        color: SC.fg,
        borderRadius: 24,
        overflow: "hidden",
        border: `1px solid ${SC.border}`,
      }}
    >
      {/* 헤더 */}
      <div style={{ padding: "24px 24px 16px" }}>
        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.3 }}>
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
      <div style={{ padding: "16px 24px 8px" }}>
        {stops.map((s, i) => {
          const tag = catTag(s.category);
          const a = coords.get(s.id) ?? null;
          const b =
            i < stops.length - 1
              ? (coords.get(stops[i + 1].id) ?? null)
              : null;
          const km = a && b ? haversineKm(a, b) : null;

          return (
            <div key={s.id}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    flex: "0 0 auto",
                    width: 26,
                    height: 26,
                    borderRadius: 999,
                    background: SC.accent,
                    color: "#ffffff",
                    fontSize: 13,
                    fontWeight: 800,
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
                    fontSize: 15,
                    fontWeight: 700,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
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
                    padding: "3px 9px",
                    borderRadius: 999,
                  }}
                >
                  {s.category}
                </span>
              </div>

              {i < stops.length - 1 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 0 6px 8px",
                    fontSize: 12,
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
          padding: "8px 24px 20px",
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
});
