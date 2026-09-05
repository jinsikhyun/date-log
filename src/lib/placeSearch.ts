export type SearchablePlace = {
  name: string;
  address?: string | null;
  category?: string | null;
  description?: string | null;
  tags?: string[] | null;
};

/** 비교용 정규화 — 공백 제거 + 소문자. "카멜 커피" 와 "카멜커피" 를 같게 본다. */
export function normalizeForSearch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

/** 이 장소에서 검색 대상이 되는 문자열들. wide 가 아니면 이름·태그만. */
function fieldsFor(place: SearchablePlace, wide: boolean): string[] {
  const base = [place.name ?? "", ...(place.tags ?? [])];
  if (!wide) return base;
  return [...base, place.address ?? "", place.category ?? "", place.description ?? ""];
}

/**
 * 검색어 매칭. 공백으로 나눈 토큰을 전부 만족해야 통과(AND)하고,
 * 각 토큰은 어느 필드에든 들어 있으면 된다(OR).
 * 예: "성수 카페" → 주소에 성수, 카테고리에 카페 → 통과.
 */
export function matchesQuery(place: SearchablePlace, query: string): boolean {
  const raw = query.trim();
  if (!raw) return true;

  // 2자 이하에선 주소·설명을 빼고 이름·태그만 본다.
  // 도로명 주소가 대부분 "…로", "…길" 로 끝나서 짧은 검색어에 전부 걸린다.
  const wide = raw.replace(/\s/g, "").length >= 3;

  const tokens = raw.split(/\s+/).filter(Boolean).map(normalizeForSearch);
  const haystack = fieldsFor(place, wide).map(normalizeForSearch);
  return tokens.every((t) => haystack.some((f) => f.includes(t)));
}

/** 낮을수록 상위. 0=이름 시작, 1=이름 포함, 2=태그, 3=그 외 */
export function matchRank(place: SearchablePlace, query: string): number {
  const q = normalizeForSearch(query);
  const name = normalizeForSearch(place.name ?? "");
  if (name.startsWith(q)) return 0;
  if (name.includes(q)) return 1;
  if ((place.tags ?? []).some((t) => normalizeForSearch(t).includes(q))) return 2;
  return 3;
}
