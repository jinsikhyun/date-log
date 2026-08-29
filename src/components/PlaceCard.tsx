import { type Place, categoryStyle } from "@/lib/places";

function StarRating({ rating }: { rating: number | null }) {
  if (rating == null) {
    return <span className="text-sm text-muted">평점 없음</span>;
  }
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span className="flex items-center gap-1.5 text-sm">
      <span aria-hidden className="tracking-tight text-accent">
        {"★".repeat(filled)}
        <span className="text-border">{"★".repeat(5 - filled)}</span>
      </span>
      <span className="font-semibold">{rating.toFixed(1)}</span>
    </span>
  );
}

export function PlaceCard({ place }: { place: Place }) {
  const visited = place.first_visit_date
    ? place.first_visit_date.split("-").join(".")
    : null;

  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl bg-card ring-1 ring-border/70 transition duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-accent/10">
      {/* 사진 자리 — 회색 placeholder */}
      <div className="relative aspect-[4/3] bg-gradient-to-br from-stone-200 to-stone-300">
        <span
          className={`absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-semibold ${categoryStyle(
            place.category,
          )}`}
        >
          {place.category}
        </span>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-stone-400">
          사진 준비 중
        </span>
      </div>

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
          <div className="flex items-center gap-2">
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
