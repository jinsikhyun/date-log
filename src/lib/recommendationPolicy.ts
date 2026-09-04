/** 검색과 AI 평가가 공유하는 정책. 거리 = 직선거리이며 도보시간이 아니다. */
export interface RecommendationStop {
  category: string;
  lat?: number | null;
  lng?: number | null;
}

export function contextPolicy(localCourse: boolean, context?: { travel?: string; mood?: string; category?: string }) {
  const distanceFirst = context?.travel === "가까이" || (context?.travel !== "조금 멀어도" && localCourse);
  return { distanceFirst, radiusMeters: distanceFirst ? 2000 : 20000 };
}

export function contextualQueries(base: string[], context?: { mood?: string; category?: string }) {
  const categories = context?.category ? [context.category] : base;
  // 키워드 일치는 분위기의 사실 확인이 아니다. 일반 검색도 유지해 빈 결과를 줄인다.
  return [...new Set(categories.flatMap(q => context?.mood ? [`${q} ${context.mood}`, q] : [q]))].slice(0, 8);
}

export function activityRole(category: string): string {
  if (/카페|커피|디저트|베이커리/.test(category)) return "cafe";
  if (/술집|주점|와인|칵테일|^바$/.test(category)) return "drink";
  if (/맛집|음식|한식|일식|중식|양식|분식|식당/.test(category)) return "meal";
  return "experience";
}

export function isLocalCourse(stops: RecommendationStop[]): boolean {
  if (stops.length < 2 || stops.some(s => s.lat == null || s.lng == null)) return false;
  // 모든 장소가 서로 약 2km 이내인 경우에만 지역이 정해진 코스로 취급한다.
  return stops.every(a => stops.every(b => {
    const dy = ((a.lat ?? 0) - (b.lat ?? 0)) * 111.2;
    const dx = ((a.lng ?? 0) - (b.lng ?? 0)) * 111.2 * Math.cos(((a.lat ?? 0) + (b.lat ?? 0)) / 2 * Math.PI / 180);
    return Math.hypot(dx, dy) <= 2;
  }));
}

export function searchQueries(mode: string, category: string, tags: string[], stops: RecommendationStop[]): string[] {
  if (mode !== "course") return [category, ...tags.slice(0, 2).map(t => `${category} ${t}`)];
  const roles = new Set(stops.map(s => activityRole(s.category)));
  const queries: string[] = [];
  if (!roles.has("meal")) queries.push("음식점");
  if (!roles.has("cafe")) queries.push("카페");
  if (!roles.has("experience")) queries.push("전시", "서점", "공원");
  return queries.length ? queries.slice(0, 4) : ["전시", "서점", "공원"];
}

/** 업종별로 번갈아 뽑아 가까운 한 업종이 후보 전체를 독점하지 못하게 한다. */
export function diverseCandidates<T extends { category: string; distanceMeters: number }>(items: T[], limit: number, local: boolean): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(item.category) ?? [];
    group.push(item);
    groups.set(item.category, group);
  }
  if (local) for (const group of groups.values()) group.sort((a, b) => a.distanceMeters - b.distanceMeters);
  const result: T[] = [];
  for (let i = 0; result.length < limit; i++) {
    let added = false;
    for (const group of groups.values()) {
      if (group[i] && result.length < limit) { result.push(group[i]); added = true; }
    }
    if (!added) break;
  }
  return result;
}
