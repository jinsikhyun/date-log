"use client";

import PhotoImage from "@/components/PhotoImage";
import {
  categoryIcon,
  categoryStyle,
  naverImageSearchUrl,
  naverMapSearchUrl,
} from "@/lib/places";
import { GptMark } from "@/components/GptMark";
import {
  kakaoCategoryDetail,
  ORIGIN_LABEL,
  type AiRecommendationOrigin,
} from "@/lib/aiRecommendClient";

export { kakaoCategoryDetail, ORIGIN_LABEL, type AiRecommendationOrigin };

export interface AiRecommendedPlace {
  id: string;
  name: string;
  category: string;
  address: string;
  reason: string;
  tags?: string[];
  distanceLabel?: string | null;
  imageUrl?: string | null;
  kakaoMapUrl?: string | null;
  /** 우리 위시리스트에서 온 후보인지, 카카오에서 새로 찾은 곳인지. 없으면 배지를 숨긴다. */
  origin?: AiRecommendationOrigin;
  /** 카카오 원본 분류 경로("음식점 > 일식 > 일본식라면"). 카드에는 중분류 뒤 세부만 보여준다. */
  kakaoCategoryName?: string | null;
}


/**
 * AI 추천 결과 카드의 표현 전용 컴포넌트.
 * 실제 추천 API와 분리해 UI를 먼저 검증하며, 사진은 date.log 기존 사진만 받는다.
 * onAddToWishlist 를 넘기면 "+ 위시리스트" 버튼이 나타난다(QA 미리보기에서는 생략).
 * onDismiss 를 넘기면 하단에 "관심 없어요" 텍스트 버튼이 나타난다(§6단계, QA 미리보기에서는 생략).
 */
export function AiRecommendationCard({
  place,
  onAddToWishlist,
  adding,
  added,
  onDismiss,
}: {
  place: AiRecommendedPlace;
  onAddToWishlist?: () => void;
  adding?: boolean;
  added?: boolean;
  onDismiss?: () => void;
}) {
  const imageSearchUrl = naverImageSearchUrl(place.name, place.address);
  const categoryDetail = kakaoCategoryDetail(place.kakaoCategoryName, place.category);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[20px] bg-card ring-1 ring-border transition duration-200 hover:ring-accent-border hover:shadow-[0_16px_32px_-22px_rgba(40,70,70,0.5)]">
      <div className="relative h-36 overflow-hidden">
        {place.imageUrl ? (
          <div className="relative h-full bg-[#e6decf]">

            <PhotoImage
              src={place.imageUrl}
              displayWidth={640}
              alt={`${place.name} 대표 사진`}
              loading="lazy"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            />
          </div>
        ) : (
          <a
            href={imageSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${place.name} 네이버 이미지 검색`}
            className="photo-placeholder flex h-full flex-col items-center justify-center gap-2 transition hover:brightness-[0.98]"
          >
            <span className="text-5xl opacity-75" aria-hidden>
              {categoryIcon(place.category)}
            </span>
            <span className="rounded-full bg-white/75 px-2.5 py-1 text-[10px] font-medium text-muted-2 backdrop-blur-sm">
              이미지 검색 ↗
            </span>
          </a>
        )}

        <span
          className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm ${categoryStyle(
            place.category,
          )}`}
        >
          {place.category}
        </span>
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[#10a37f] px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm backdrop-blur-sm">
          <GptMark className="h-3 w-3" />
          AI 추천
        </span>
        {place.origin && (
          <span
            className={`absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm ${
              place.origin === "wishlist"
                ? "bg-[#fff3d6] text-[#7a5f31] ring-1 ring-[#e7cf9a]"
                : "bg-white/90 text-accent ring-1 ring-accent-border"
            }`}
          >
            {place.origin === "wishlist" ? "♡ " : "✦ "}
            {ORIGIN_LABEL[place.origin]}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 text-[15px] font-bold leading-snug">
              {place.name}
            </h3>
            {place.distanceLabel && (
              <span className="shrink-0 text-[11px] text-muted-3">
                {place.distanceLabel}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-[11px] text-muted-2">
            {place.address}
          </p>
          {categoryDetail && (
            <p className="mt-1 truncate text-[11px] font-medium text-muted-2">
              <span className="text-muted-3">카카오 분류 · </span>
              {categoryDetail}
            </p>
          )}
        </div>

        <p className="text-[13px] leading-[1.55] text-[#4a463f]">
          {place.reason}
        </p>

        {!!place.tags?.length && (
          <div className="flex flex-wrap gap-1.5">
            {place.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-medium text-accent"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex gap-1.5 border-t border-border/70 pt-3">
          {place.imageUrl ? (
            <a
              href={imageSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 min-w-0 flex-1 items-center justify-center rounded-full bg-[#f5f3ef] px-1.5 text-[11px] font-semibold text-muted-2 transition hover:bg-[#ede9e2] hover:text-accent"
            >
              <span className="truncate">사진 ↗</span>
            </a>
          ) : null}
          {onAddToWishlist ? (
            <button
              type="button"
              onClick={onAddToWishlist}
              disabled={adding || added || place.origin === "wishlist"}
              className="flex h-9 min-w-0 flex-[1.3] items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
            >
              <span className="truncate">
                {added
                  ? "추가됨"
                  : adding
                    ? "추가 중…"
                    : place.origin === "wishlist"
                      ? "위시에 있어요"
                      : "위시리스트"}
              </span>
            </button>
          ) : null}
          <a
            href={naverMapSearchUrl(place.name, place.address)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${place.name} 네이버 지도 정보`}
            className="flex h-9 min-w-0 flex-1 items-center justify-center rounded-full bg-[#03C75A] px-1.5 text-[11px] font-semibold text-white transition hover:brightness-95"
          >
            <span className="truncate">정보 ↗</span>
          </a>
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            disabled={adding || added}
            aria-label={`${place.name} 추천에 관심 없어요`}
            className="flex w-full items-center justify-center gap-1 rounded-full py-1.5 text-[11px] font-medium text-muted-2 transition hover:bg-red-50 hover:text-red-600 active:bg-red-50 active:text-red-600 disabled:opacity-40"
          >
            <span aria-hidden>✕</span>
            <span>관심 없어요</span>
          </button>
        ) : null}
      </div>
    </article>
  );
}
