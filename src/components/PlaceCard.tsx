import Link from "next/link";
import {
  type Place,
  addedByLabel,
  categoryIcon,
  categoryStyle,
  naverImageSearchUrl,
} from "@/lib/places";
import { StarRating } from "@/components/StarRating";

export function PlaceCard({ place }: { place: Place }) {
  const visited = place.first_visit_date
    ? place.first_visit_date.split("-").join(".")
    : null;

  return (
    <article className="group relative isolate flex flex-col overflow-hidden rounded-3xl bg-card ring-1 ring-border/70 transition duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-accent/10">
      {/* isolate: 카드 내부 z-10/z-20 이 카드 안에서만 겹치도록 stacking context 를 가둔다. */}
      {/* 카드 전체를 상세 페이지 링크로 (placeholder/네이버지도 링크는 위에 z-20 로 띄움) */}
      <Link
        href={`/places/${place.id}`}
        className="absolute inset-0 z-10"
        aria-label={`${place.name} 상세 보기`}
      />

      {place.image_url ? (
        // 사진 있음 — 기존 세로형 그대로
        <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-stone-200 to-stone-300">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={place.image_url}
            alt={place.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <span
            className={`absolute left-4 top-4 z-[1] rounded-full px-3 py-1 text-xs font-semibold ${categoryStyle(
              place.category,
            )}`}
          >
            {place.category}
          </span>
          {addedByLabel(place.added_by) && (
            <span className="absolute right-4 top-4 z-[1] rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
              {addedByLabel(place.added_by)}
            </span>
          )}
        </div>
      ) : (
        // 사진 없음 — 같은 크기의 placeholder(카테고리 색 + 아이콘).
        // 이 영역만 클릭 시 네이버 이미지 검색 (카드 전체 클릭 = 상세, 로 전파 안 되게 stopPropagation)
        <a
          href={naverImageSearchUrl(place.name, place.address)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={`${place.name} 네이버 이미지 검색`}
          title="네이버 이미지 검색"
          className={`relative z-20 flex aspect-[4/3] cursor-pointer items-center justify-center transition hover:brightness-105 ${categoryStyle(
            place.category,
          )}`}
        >
          <span className="text-6xl" aria-hidden>
            {categoryIcon(place.category)}
          </span>
          <span className="absolute left-4 top-4 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-foreground/80">
            {place.category}
          </span>
          {addedByLabel(place.added_by) && (
            <span className="absolute right-4 top-4 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
              {addedByLabel(place.added_by)}
            </span>
          )}
        </a>
      )}

      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold leading-snug">{place.name}</h2>
          {visited && (
            <span className="shrink-0 text-xs text-muted">{visited}</span>
          )}
        </div>
        <p className="text-sm text-muted">{place.address}</p>
        {place.description && (
          <p className="line-clamp-2 text-sm text-foreground/75">
            {place.description}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <StarRating rating={place.rating} />
          <div className="relative z-20 flex items-center gap-2">
            {place.naver_map_link && (
              <a
                href={place.naver_map_link}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-200"
              >
                네이버지도
              </a>
            )}
            <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
              추억 {place.memory_count}개
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
