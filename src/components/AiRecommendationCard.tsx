"use client";

import {
  categoryIcon,
  categoryStyle,
  naverImageSearchUrl,
  naverMapSearchUrl,
} from "@/lib/places";
import { GptMark } from "@/components/GptMark";

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
}

/**
 * AI 추천 결과 카드의 표현 전용 컴포넌트.
 * 실제 추천 API와 분리해 UI를 먼저 검증하며, 사진은 date.log 기존 사진만 받는다.
 * onAddToWishlist 를 넘기면 "+ 위시리스트" 버튼이 나타난다(QA 미리보기에서는 생략).
 */
export function AiRecommendationCard({
  place,
  onAddToWishlist,
  adding,
  added,
}: {
  place: AiRecommendedPlace;
  onAddToWishlist?: () => void;
  adding?: boolean;
  added?: boolean;
}) {
  const imageSearchUrl = naverImageSearchUrl(place.name, place.address);

  return (
    <article className="group overflow-hidden rounded-[20px] bg-card ring-1 ring-border transition duration-200 hover:ring-accent-border hover:shadow-[0_16px_32px_-22px_rgba(40,70,70,0.5)]">
      <div className="relative h-36 overflow-hidden">
        {place.imageUrl ? (
          <div className="relative h-full bg-[#e6decf]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={place.imageUrl}
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
      </div>

      <div className="space-y-3 p-4">
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

        <div className="flex items-center justify-between border-t border-border/70 pt-3">
          <a
            href={imageSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-medium text-muted-2 transition-colors hover:text-accent"
          >
            사진 보기 ↗
          </a>
          <div className="flex items-center gap-1.5">
            {onAddToWishlist && (
              <button
                type="button"
                onClick={onAddToWishlist}
                disabled={adding || added}
                className="rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
              >
                {added ? "추가됨" : adding ? "추가 중…" : "+ 위시리스트"}
              </button>
            )}
            <a
              href={naverMapSearchUrl(place.name, place.address)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${place.name} 네이버 지도 정보`}
              className="rounded-full bg-[#03C75A] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:brightness-95"
            >
              정보 ↗
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
