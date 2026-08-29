export function StarRating({ rating }: { rating: number | null }) {
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
