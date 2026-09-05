import { forwardRef } from "react";
import { photoOriginalUrl } from "@/lib/photoUrls";
import type { Place } from "@/lib/places";
import { categoryIcon } from "@/lib/categories";
import { placeRegion } from "@/lib/placeRegion";
import { SC, catTag } from "@/lib/shareCardStyle";
import { SHARE_OUTPUTS, type ShareRatio } from "@/lib/shareOutputs";

type Layout = {
  headerH: number;
  photoHeight: number;
  pad: number;
  contentPadTop: number;
  bottomPadBottom: number;
  nameSize: number;
  nameLine: number;
  addrSize: number;
  addrLine: number;
  ratingSize: number;
  quoteSize: number;
  quoteLine: number;
  metaSize: number;
  logoWidth: number;
  objectPositionY: string;
  gap: number;
};

// 비율별 폰트/로고 토큰. "미리보기가 작아 보인다"는 피드백에 따라 출력 캔버스(1080 기준)
// 실제 크기에 맞춰 크게 잡는다 — 미리보기에서 CSS scale()로 축소해서 보여줄 뿐, 카드 자체의
// 내부 크기를 줄이지 않는다. headerH/photoHeight 는 고정 트랙이고 정보 패널이 나머지(flex:1)를
// 갖는다 — 사진 intrinsic size 가 카드 높이에 영향을 주지 않는다.
function layoutFor(ratio: ShareRatio): Layout {
  const { width, height } = SHARE_OUTPUTS[ratio];
  if (ratio === "story-9x16") {
    return {
      headerH: 94,
      photoHeight: Math.round(height * 0.6),
      pad: 64,
      contentPadTop: 40,
      bottomPadBottom: 64,
      nameSize: 84,
      nameLine: 98,
      addrSize: 33,
      addrLine: 46,
      ratingSize: 59,
      quoteSize: 37,
      quoteLine: 52,
      metaSize: 28,
      logoWidth: 195,
      objectPositionY: "30%",
      gap: 30,
    };
  }
  if (ratio === "square-1x1") {
    return {
      headerH: 68,
      photoHeight: Math.round(height * 0.53),
      pad: 56,
      contentPadTop: 28,
      bottomPadBottom: 28,
      nameSize: 63,
      nameLine: 74,
      addrSize: 27,
      addrLine: 38,
      ratingSize: 46,
      quoteSize: 29,
      quoteLine: 41,
      metaSize: 22,
      logoWidth: 165,
      objectPositionY: "40%",
      gap: 20,
    };
  }
  // feed-4x5 (기본)
  return {
    headerH: 77,
    photoHeight: Math.round(width * (1350 / 1080) * 0.55),
    pad: 64,
    contentPadTop: 36,
    bottomPadBottom: 40,
    nameSize: 74,
    nameLine: 87,
    addrSize: 31,
    addrLine: 43,
    ratingSize: 53,
    quoteSize: 33,
    quoteLine: 46,
    metaSize: 24,
    logoWidth: 180,
    objectPositionY: "40%",
    gap: 26,
  };
}

// 정보 패널 안에서 카테고리/이름-주소/평점 사이를 나누는 Teal 톤 hairline. 완전한 accent 색은
// 너무 강해 보여서 옅게(opacity) 쓴다 — 일반 hairline(SC.hairline)과 구분되는 확정안 요소.
function TealHairline({ marginTop }: { marginTop: number }) {
  return <div style={{ marginTop, borderTop: `1px solid ${SC.accent}`, opacity: 0.28 }} />;
}

// -webkit-line-clamp 은 실제 렌더된 줄 수만큼만 높이를 차지한다. 예전엔 height:lineHeight*2 를
// 강제해 항상 2줄 몫을 고정 확보했는데, 그러면 1줄짜리 짧은 텍스트(실제 데이터 대부분)에서
// 이름/주소 아래에 불필요한 빈 줄만큼의 큰 공백이 생겼다 — 진짜 원인은 상위 overflowWrap:
// "anywhere"(카드 루트에서 지정)가 공백 없는 아주 긴 텍스트와 만나면 line-clamp 의 줄 수
// 계산이 틀어지는 것이었다. height 강제 대신 이 블록만 overflowWrap/wordBreak 을
// "break-word"(단어 경계 우선 줄바꿈)로 오버라이드해 줄 계산을 안정시키고, minHeight 로
// 완전히 찌그러지는 것만 방지한다 — 짧은 텍스트는 실제 줄 수만큼만 공간을 쓴다.
function clamp2(fontSize: number, lineHeight: number): React.CSSProperties {
  return {
    fontSize,
    lineHeight: `${lineHeight}px`,
    minHeight: lineHeight,
    overflowWrap: "break-word",
    wordBreak: "break-word",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  };
}

/**
 * 공유 전용 장소 카드 — 비율별(4:5/9:16/1:1) 전용 레이아웃을 렌더링한다.
 * 화면에는 절대 보이지 않고, SharePreviewModal / ShareRatioModal 썸네일에서만 마운트된다.
 * ⚠️ Tailwind 색 클래스 금지(html2canvas 가 oklch 를 못 읽음) — 전부 인라인 hex.
 */
export const PlaceShareCard = forwardRef<
  HTMLDivElement,
  { place: Place; ratio: ShareRatio; frameNumber: number | null }
>(function PlaceShareCard({ place, ratio, frameNumber }, ref) {
  const { width, height } = SHARE_OUTPUTS[ratio];
  const L = layoutFor(ratio);
  const tag = catTag(place.category);
  const region = placeRegion(place.address);
  const regionLabel = [region.province, region.district].filter(Boolean).join(" ");
  const frameLabel = frameNumber != null ? `FRAME ${String(frameNumber).padStart(3, "0")}` : null;
  const topLeft = [regionLabel, frameLabel].filter(Boolean).join(" · ");
  const dateLabel = place.first_visit_date ? place.first_visit_date.replace(/-/g, ".") : null;
  const isPick = (place.favorite_by ?? []).length > 0;

  return (
    <div
      ref={ref}
      data-share-card-type="place-v2"
      data-share-card-ratio={ratio}
      style={{
        width,
        height,
        boxSizing: "border-box",
        overflow: "hidden",
        overflowWrap: "anywhere",
        fontFamily: SC.font,
        background: SC.ivory,
        color: SC.fg,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 상단 메타 바 — 고정 높이 트랙 */}
      <div
        style={{
          height: L.headerH,
          boxSizing: "border-box",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `0 ${L.pad}px`,
          fontFamily: SC.mono,
          fontSize: L.metaSize,
          lineHeight: `${L.metaSize + 8}px`,
          color: SC.muted,
          letterSpacing: 0.5,
        }}
      >
        <span>{topLeft || "date.log"}</span>
        {dateLabel && <span>{dateLabel}</span>}
      </div>

      {/* 대표 사진 */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: L.photoHeight,
          overflow: "hidden",
          background: SC.accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {place.image_url ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              // 공유 이미지는 리사이즈된 표시용 사본이 아니라 무조건 저장된 최대 화질(원본)을 쓴다.
              backgroundImage: `url("${photoOriginalUrl(place.image_url) ?? ""}")`,
              backgroundSize: "cover",
              backgroundPosition: `center ${L.objectPositionY}`,
              backgroundRepeat: "no-repeat",
            }}
          />
        ) : (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 140,
              height: 140,
              fontSize: 120,
              lineHeight: "140px",
              color: "#ffffff",
            }}
          >
            {categoryIcon(place.category)}
          </span>
        )}
      </div>

      {/* 본문 */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          padding: `${L.contentPadTop}px ${L.pad}px 0`,
        }}
      >
        {/* 1. 카테고리 — mono label, pill 아님 */}
        <div
          style={{
            fontFamily: SC.mono,
            fontSize: L.metaSize,
            fontWeight: 700,
            lineHeight: `${L.metaSize + 8}px`,
            letterSpacing: 1,
            color: tag.fg,
          }}
        >
          {place.category}
        </div>

        {/* 2. Teal hairline */}
        <TealHairline marginTop={L.gap * 0.5} />

        {/* 3. 장소명 */}
        <div style={{ marginTop: L.gap * 0.6, fontWeight: 800, ...clamp2(L.nameSize, L.nameLine) }}>
          {place.name}
        </div>

        {/* 4. 주소 */}
        <div
          style={{
            marginTop: L.gap * 0.35,
            color: SC.muted,
            ...clamp2(L.addrSize, L.addrLine),
          }}
        >
          {place.address}
        </div>

        {/* 5. Teal hairline */}
        <TealHairline marginTop={L.gap * 0.6} />

        {/* 6. 숫자 평점 — 텍스트 기반, 별 아이콘 없음 */}
        {place.rating != null && (
          <div style={{ marginTop: L.gap * 0.6, display: "flex", alignItems: "baseline" }}>
            <span style={{ fontSize: L.ratingSize, fontWeight: 800, lineHeight: "1", color: SC.fg }}>
              {place.rating.toFixed(1)}
            </span>
            <span
              style={{
                marginLeft: 8,
                fontFamily: SC.mono,
                fontSize: L.metaSize,
                lineHeight: "1",
                color: SC.muted,
              }}
            >
              / 5.0
            </span>
          </div>
        )}

        {/* 7. 한 줄 평가 */}
        {place.description && (
          <div style={{ marginTop: L.gap * 0.7, fontWeight: 500, color: SC.fgSoft, ...clamp2(L.quoteSize, L.quoteLine) }}>
            &ldquo;{place.description}&rdquo;
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Teal hairline (footer 위) */}
        <TealHairline marginTop={0} />

        {/* 8. footer row — 왼쪽 OUR PICK(있을 때만) / 오른쪽 SAVED IN + 공식 로고 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: isPick ? "space-between" : "flex-end",
            padding: `${L.gap * 0.6}px 0`,
            fontFamily: SC.mono,
            fontSize: L.metaSize,
            lineHeight: `${L.metaSize + 8}px`,
            letterSpacing: 0.5,
          }}
        >
          {isPick && <span style={{ color: SC.accent, fontWeight: 700 }}>OUR PICK</span>}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: SC.muted }}>SAVED IN</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand-wordmark.png" alt="date.log" style={{ width: L.logoWidth, height: "auto" }} />
          </div>
        </div>

        {/* 9. 마지막 Teal hairline */}
        <TealHairline marginTop={0} />
        <div style={{ paddingBottom: L.bottomPadBottom }} />
      </div>
    </div>
  );
});
