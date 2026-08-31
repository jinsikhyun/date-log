export function StarRating({ rating }: { rating: number | null }) {
  if (rating == null) {
    return <span className="text-[13px] text-muted-3">평점 없음</span>;
  }
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span className="flex items-center gap-1.5 text-[13px]">
      <span aria-hidden className="tracking-tight text-amber">
        {"★".repeat(filled)}
        <span className="text-border">{"★".repeat(5 - filled)}</span>
      </span>
      <span className="font-semibold text-amber">{rating.toFixed(1)}</span>
    </span>
  );
}
