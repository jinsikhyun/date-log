import { forwardRef } from "react";
import { haversineKm, walkMinutes } from "@/lib/courses";
import { placeRegion } from "@/lib/placeRegion";
import { SC, catTag } from "@/lib/shareCardStyle";
import { SHARE_OUTPUTS, type ShareRatio } from "@/lib/shareOutputs";

export type CourseShareStop = {
  id: number;
  name: string;
  category: string;
  address: string;
};

type Coord = { lat: number; lng: number };

/** 헤더/좌측 패널 구석에 넣는 장식용 경로 모티프. 출력 크기에 맞춰 선 두께·노드 크기를 키운다. */
function RouteMotif({ color, width, height, strokeWidth }: { color: string; width: number; height: number; strokeWidth: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 120 60" fill="none" aria-hidden="true" style={{ opacity: 0.45 }}>
      <path
        d="M4 50 C 30 10, 50 50, 76 20 S 110 8, 116 12"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray="1 9"
      />
      <circle cx="4" cy="50" r={strokeWidth * 1.4} fill={color} />
      <circle cx="116" cy="12" r={strokeWidth * 1.4} fill={color} />
    </svg>
  );
}

type Tokens = {
  title: number;
  desc: number;
  meta: number;
  circle: number;
  number: number;
  name: number;
  distance: number;
  category: number;
  categoryPadV: number;
  categoryPadH: number;
  logoWidth: number;
  lineW: number;
  rail: number;
  nameDistGap: number;
  pad: number;
  motifW: number;
};

// RouteMotif 의 viewBox 가 120×60(정확히 2:1)이라 motifW 만 토큰화하고 높이는 항상
// motifW/2 로 계산한다 — 비율마다 폭만 다르게 줘도 장식이 찌그러지지 않는다.
const COURSE_SHARE_TOKENS: Record<ShareRatio, Tokens> = {
  "story-9x16": {
    title: 90, desc: 42, meta: 30, circle: 72, number: 32, name: 42, distance: 28,
    category: 26, categoryPadV: 10, categoryPadH: 18, logoWidth: 210, lineW: 2.5, rail: 78,
    nameDistGap: 17, pad: 76, motifW: 190,
  },
  "feed-4x5": {
    title: 82, desc: 38, meta: 28, circle: 66, number: 29, name: 38, distance: 26,
    category: 24, categoryPadV: 9, categoryPadH: 16, logoWidth: 190, lineW: 2.5, rail: 72,
    nameDistGap: 16, pad: 68, motifW: 165,
  },
  "square-1x1": {
    title: 72, desc: 32, meta: 24, circle: 58, number: 26, name: 32, distance: 22,
    category: 22, categoryPadV: 7, categoryPadH: 14, logoWidth: 185, lineW: 2, rail: 64,
    nameDistGap: 12, pad: 48, motifW: 150,
  },
};

function StopRow({
  stop, index, tk, distanceLabel,
}: {
  stop: CourseShareStop; index: number; tk: Tokens; distanceLabel: string | null;
}) {
  const tag = catTag(stop.category);
  return (
    <div
      style={{
        height: "100%",
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: `${tk.rail}px minmax(0, 1fr) auto`,
        columnGap: 28,
        rowGap: tk.nameDistGap,
        alignContent: "center",
        minWidth: 0,
      }}
    >
      <div style={{ gridColumn: 1, gridRow: "1 / 3", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <span
          style={{
            position: "relative",
            zIndex: 1,
            width: tk.circle,
            height: tk.circle,
            borderRadius: 999,
            background: SC.accent,
            color: "#ffffff",
            fontFamily: SC.mono,
            fontSize: tk.number,
            fontWeight: 700,
            lineHeight: "1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {index + 1}
        </span>
      </div>
      <span
        style={{
          gridColumn: 2,
          gridRow: 1,
          alignSelf: "center",
          minWidth: 0,
          fontWeight: 800,
          fontSize: tk.name,
          lineHeight: `${Math.round(tk.name * 1.2)}px`,
          color: SC.fg,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {stop.name}
      </span>
      <span
        style={{
          gridColumn: 3,
          gridRow: 1,
          alignSelf: "center",
          background: tag.bg,
          color: tag.fg,
          fontSize: tk.category,
          fontWeight: 700,
          lineHeight: `${tk.category + 8}px`,
          padding: `${tk.categoryPadV}px ${tk.categoryPadH}px`,
          borderRadius: 999,
          whiteSpace: "nowrap",
        }}
      >
        {stop.category}
      </span>
      {distanceLabel && (
        <span
          style={{
            gridColumn: 2,
            gridRow: 2,
            alignSelf: "center",
            fontFamily: SC.mono,
            fontSize: tk.distance,
            lineHeight: `${tk.distance + 8}px`,
            color: SC.muted,
          }}
        >
          {distanceLabel}
        </span>
      )}
    </div>
  );
}

/** 번호 원들을 잇는 세로선. 첫/마지막 원의 중심을 정확히 잇도록 top/bottom을 %로 계산한다. */
function RailLine({ count, tk }: { count: number; tk: Tokens }) {
  if (count < 2) return null;
  const half = 50 / count;
  return (
    <div
      style={{
        position: "absolute",
        left: tk.rail / 2 - tk.lineW / 2,
        top: `${half}%`,
        bottom: `${half}%`,
        width: tk.lineW,
        background: SC.hairline,
        zIndex: 0,
      }}
    />
  );
}

function StopsGrid({ stops, coords, tk }: { stops: CourseShareStop[]; coords: Map<number, Coord | null>; tk: Tokens }) {
  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
      <RailLine count={stops.length} tk={tk} />
      <div style={{ height: "100%", display: "grid", gridTemplateRows: `repeat(${stops.length}, minmax(0, 1fr))` }}>
        {stops.map((s, i) => {
          const a = coords.get(s.id) ?? null;
          const b = i < stops.length - 1 ? (coords.get(stops[i + 1].id) ?? null) : null;
          const km = a && b ? haversineKm(a, b) : null;
          const distanceLabel =
            i < stops.length - 1
              ? km != null
                ? `${km.toFixed(km < 1 ? 2 : 1)}km · 도보 약 ${walkMinutes(km)}분`
                : "거리 정보 없음"
              : null;
          return <StopRow key={s.id} stop={s} index={i} tk={tk} distanceLabel={distanceLabel} />;
        })}
      </div>
    </div>
  );
}

function BottomLogo({ tk }: { tk: Tokens }) {
  const gap = Math.round(tk.logoWidth * 0.13);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap, padding: `${Math.round(tk.pad * 0.4)}px 0` }}>
      <span style={{ color: SC.gold, fontSize: tk.meta, lineHeight: "1" }}>+</span>
      <span style={{ flex: 1, maxWidth: 72, height: 1, background: SC.hairline }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand-wordmark.png" alt="date.log" style={{ width: tk.logoWidth, height: "auto", maxWidth: "22%" }} />
      <span style={{ flex: 1, maxWidth: 72, height: 1, background: SC.hairline }} />
      <span style={{ color: SC.gold, fontSize: tk.meta, lineHeight: "1" }}>+</span>
    </div>
  );
}

function Header({
  regionLabel, title, concept, metaLine, tk,
}: {
  regionLabel: string; title: string; concept: string | null; metaLine: string; tk: Tokens;
}) {
  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        boxSizing: "border-box",
        display: "grid",
        gridTemplateRows: "auto auto auto 1fr auto",
        padding: `${Math.round(tk.pad * 0.9)}px ${tk.pad}px ${Math.round(tk.pad * 0.75)}px`,
        background: SC.accent,
        color: "#ffffff",
        overflow: "hidden",
        minHeight: 0,
      }}
    >
      <div style={{ position: "absolute", top: Math.round(tk.pad * 0.6), right: tk.pad * 0.6 }}>
        <RouteMotif color="#ffffff" width={tk.motifW} height={tk.motifW / 2} strokeWidth={tk.lineW + 1} />
      </div>
      {regionLabel && (
        <div style={{ fontFamily: SC.mono, fontSize: tk.meta, letterSpacing: 0.5, color: "#cfe0de" }}>{regionLabel}</div>
      )}
      <div
        style={{
          marginTop: Math.round(tk.title * 0.16),
          fontWeight: 700,
          fontSize: tk.title,
          lineHeight: `${Math.round(tk.title * 1.16)}px`,
          height: Math.round(tk.title * 1.16) * 2,
          maxWidth: "78%",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {title}
      </div>
      <div style={{ minHeight: 0 }}>
        {concept && (
          <div
            style={{
              marginTop: Math.round(tk.desc * 0.3),
              fontSize: tk.desc,
              lineHeight: `${Math.round(tk.desc * 1.4)}px`,
              height: Math.round(tk.desc * 1.4) * 2,
              color: "#d9e6e4",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {concept}
          </div>
        )}
      </div>
      <div />
      <div>
        <div style={{ height: 1, background: SC.gold, opacity: 0.7, maxWidth: 160 }} />
        <div style={{ marginTop: Math.round(tk.meta * 0.5), fontFamily: SC.mono, fontSize: tk.meta, color: "#cfe0de" }}>
          {metaLine}
        </div>
      </div>
    </div>
  );
}

/**
 * 공유 전용 코스 카드 — 비율별(4:5/9:16/1:1) 전용 레이아웃. 1:1은 세로형을 축소한 게
 * 아니라 좌(Archive Teal 브랜드 패널)/우(Ivory 경로 패널) 2열 전용 레이아웃을 쓴다.
 * 폰트/로고 크기는 비율별 COURSE_SHARE_TOKENS 를 그대로 쓴다 — 미리보기에서 CSS scale()로
 * 축소해서 보여줄 뿐, 카드 내부 크기 자체를 줄이지 않는다.
 * ⚠️ Tailwind 색 클래스 금지(html2canvas 가 oklch 를 못 읽음) — 전부 인라인 hex.
 */
export const ShareCourseCard = forwardRef<
  HTMLDivElement,
  { title: string; concept: string | null; stops: CourseShareStop[]; coords: Map<number, Coord | null>; ratio: ShareRatio }
>(function ShareCourseCard({ title, concept, stops, coords, ratio }, ref) {
  const { width, height } = SHARE_OUTPUTS[ratio];
  const tk = COURSE_SHARE_TOKENS[ratio];
  const region = stops[0] ? placeRegion(stops[0].address) : null;
  const regionLabel = region ? [region.province, region.district].filter(Boolean).join(" ") : "";
  let totalKm = 0;
  for (let i = 1; i < stops.length; i++) {
    const a = coords.get(stops[i - 1].id);
    const b = coords.get(stops[i].id);
    if (a && b) totalKm += haversineKm(a, b);
  }
  const metaLine = `${stops.length}곳${totalKm > 0 ? ` · 총 ${totalKm.toFixed(totalKm < 1 ? 2 : 1)}km · 도보 약 ${walkMinutes(totalKm)}분` : ""}`;

  const rootBase: React.CSSProperties = {
    width, height, boxSizing: "border-box", overflow: "hidden", overflowWrap: "anywhere",
    fontFamily: SC.font, color: SC.fg,
  };

  if (ratio === "square-1x1") {
    const leftW = Math.round(width * 0.4);
    return (
      <div ref={ref} style={{ ...rootBase, display: "flex" }}>
        {/* 좌측: Archive Teal 브랜드 패널 */}
        <div
          style={{
            width: leftW, flex: "0 0 auto", background: SC.accent, color: "#ffffff",
            display: "flex", flexDirection: "column", padding: `${tk.pad}px ${tk.pad * 0.7}px`, position: "relative",
          }}
        >
          {regionLabel && (
            <div style={{ fontFamily: SC.mono, fontSize: tk.meta - 2, letterSpacing: 0.5, color: "#cfe0de" }}>{regionLabel}</div>
          )}
          <div
            style={{
              marginTop: 16, fontWeight: 700, fontSize: tk.title, lineHeight: `${Math.round(tk.title * 1.16)}px`,
              height: Math.round(tk.title * 1.16) * 3,
              display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}
          >
            {title}
          </div>
          {concept && (
            <div
              style={{
                marginTop: 12, fontSize: tk.desc, lineHeight: `${Math.round(tk.desc * 1.4)}px`, color: "#d9e6e4",
                height: Math.round(tk.desc * 1.4) * 3,
                display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
              }}
            >
              {concept}
            </div>
          )}
          <div style={{ marginTop: 16, height: 1, background: "rgba(255,255,255,0.3)" }} />
          <div style={{ marginTop: 16, fontFamily: SC.mono, fontSize: tk.meta - 1, color: "#cfe0de" }}>{metaLine}</div>
          <div style={{ flex: 1 }} />
          <RouteMotif
            color="#ffffff"
            width={Math.min(leftW - tk.pad * 1.4, tk.motifW)}
            height={Math.min(leftW - tk.pad * 1.4, tk.motifW) / 2}
            strokeWidth={tk.lineW + 1}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand-wordmark.png"
            alt="date.log"
            style={{ width: tk.logoWidth, maxWidth: "70%", height: "auto", marginTop: 16, filter: "brightness(0) invert(1)" }}
          />
        </div>

        {/* 우측: Ivory 경로 패널 — 장소 목록이 전체 높이를 균등하게 채운다 */}
        <div style={{ flex: 1, minWidth: 0, background: SC.ivory, display: "flex", flexDirection: "column", padding: `${tk.pad}px ${tk.pad * 0.85}px` }}>
          <StopsGrid stops={stops} coords={coords} tk={tk} />
        </div>
      </div>
    );
  }

  // feed-4x5 / story-9x16: Archive Teal 헤더 + Ivory 세로형 경로
  const headerH = Math.round(height * (ratio === "story-9x16" ? 0.355 : 0.39));
  return (
    <div ref={ref} style={{ ...rootBase, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: `0 0 ${headerH}px`, minHeight: 0 }}>
        <Header
          regionLabel={regionLabel}
          title={title}
          concept={concept}
          metaLine={metaLine}
          tk={tk}
        />
      </div>

      <div
        style={{
          flex: 1, minHeight: 0, background: SC.ivory, display: "grid",
          gridTemplateRows: "minmax(0, 1fr) auto",
          padding: `${Math.round(tk.pad * 0.9)}px ${tk.pad}px ${Math.round(tk.pad * 0.7)}px`,
        }}
      >
        <StopsGrid stops={stops} coords={coords} tk={tk} />
        <BottomLogo tk={tk} />
      </div>
    </div>
  );
});
