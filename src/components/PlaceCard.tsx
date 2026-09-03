import Link from "next/link";
import {
  type Place,
  addedByLabel,
  categoryIcon,
  categoryStyle,
  naverImageSearchUrl,
} from "@/lib/places";
import { StarRating } from "@/components/StarRating";
import { PlaceTagBadges } from "@/components/PlaceTagBadges";
import type { Anniversary } from "@/lib/anniversaries";

const CARD =
  "group relative isolate flex h-full flex-col overflow-hidden rounded-[20px] bg-card ring-1 ring-border transition duration-200 hover:ring-accent-border hover:shadow-[0_16px_32px_-22px_rgba(40,70,70,0.5)]";
const CAT_CHIP =
  "absolute left-3.5 top-3.5 z-[1] rounded-full px-3 py-1 text-[11px] font-semibold";

export function PlaceCard({ place, visitAnniversaries = [] }: { place: Place; visitAnniversaries?: Anniversary[] }) {
  const visited = place.first_visit_date
    ? place.first_visit_date.split("-").join(".")
    : null;
  const addedBy = addedByLabel(place.added_by);

  return (
    <article className={CARD}>
      {/* 카드 전체를 상세 링크로 (placeholder/외부링크는 위에 z-20 로) */}
      <Link
        href={`/places/${place.id}`}
        className="absolute inset-0 z-10"
        aria-label={`${place.name} 상세 보기`}
      />

      {place.image_url ? (
        <div className="relative h-44 overflow-hidden bg-[#e6decf]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={place.image_url}
            alt={place.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <span className={`${CAT_CHIP} ${categoryStyle(place.category)}`}>
            {place.category}
          </span>
          <PlaceTagBadges
            favoriteBy={place.favorite_by}
            isRegular={place.is_regular}
            size="sm"
          />
        </div>
      ) : (
        // 사진 없음 — 크림 스트라이프 placeholder. 클릭 시 네이버 이미지 검색(새 탭).
        <a
          href={naverImageSearchUrl(place.name, place.address)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={`${place.name} 네이버 이미지 검색`}
          title="네이버 이미지 검색"
          className="photo-placeholder relative z-20 flex h-44 cursor-pointer items-center justify-center transition hover:brightness-[0.98]"
        >
          <span className="text-5xl opacity-70" aria-hidden>
            {categoryIcon(place.category)}
          </span>
          <span
            className={`${CAT_CHIP} bg-white/85 text-foreground/70`}
            style={{ zIndex: 1 }}
          >
            {place.category}
          </span>
          <PlaceTagBadges
            favoriteBy={place.favorite_by}
            isRegular={place.is_regular}
            size="sm"
          />
        </a>
      )}

      <div className="flex flex-1 flex-col gap-[7px] px-[18px] pb-[18px] pt-4">
        <div className="flex items-baseline gap-2">
          <h2 className="min-w-0 flex-1 truncate text-base font-bold leading-snug">
            {place.name}
          </h2>
          {visited && (
            <span className="shrink-0 text-[11px] text-muted-3">{visited}</span>
          )}
        </div>
        <p className="truncate text-xs text-muted-2">{place.address}</p>
        {place.description && (
          <p className="line-clamp-2 text-[13px] leading-[1.6] text-[#4a463f]">
            {place.description}
          </p>
        )}
        {visitAnniversaries.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {visitAnniversaries.slice(0, 2).map((event) => (
              <span key={`${event.kind}-${event.label}`} className="w-fit rounded-full bg-[#fff3ee] px-2.5 py-1 text-[10px] font-semibold text-[#a85f50] ring-1 ring-[#e7b9ad]/50">
                {event.icon} {event.label}에 다녀왔어요
              </span>
            ))}
            {visitAnniversaries.length > 2 && <span className="rounded-full bg-[#fff3ee] px-2 py-1 text-[10px] font-bold text-[#a85f50]">+{visitAnniversaries.length - 2}</span>}
          </div>
        )}

        <div className="mt-auto flex min-h-7 items-center justify-between gap-2 pt-2">
          <StarRating rating={place.rating} />
          <div className="relative z-20 flex items-center gap-1.5">
            {addedBy && (
              <span className="whitespace-nowrap rounded-full bg-background px-2.5 py-1 text-[11px] font-medium text-muted-2">
                {addedBy}
              </span>
            )}
            <span className="whitespace-nowrap rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent">
              추억 {place.memory_count}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
