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

// §3단계 배분 정책: 구체 검색어(deriveSpecificSearchTerm 결과, 예: "일본식라면") 최소 보장 슬롯.
// 2026-09-08 실측(쿄오모라멘, 3회 반복 안정값)에서 diverseCandidates가 카테고리로만 자를 때
// specific 출처 생존율이 50%(base는 90.9%)까지 떨어지는 것을 확인했다 — 다만 그 실측에서도
// 합계는 10/10으로 우연히 맞아떨어져, 이 10을 그대로 하한으로 채택했다. 실측 표본이 이 장소
// 1건뿐이라 잠정치다(황재벌은 정답 후보 자체가 두 검색어 어느 쪽 raw 상위에도 없어 배분
// 정책으로 검증 불가 — HANDOFF.md 참고). 표본이 늘면 재조정한다.
export const MIN_SPECIFIC_SLOTS = 10;

/**
 * 후보를 출처 종류(specific/base)로 나눠 slot을 배분한다: specific 몫 = max(최소 보장
 * 슬롯, limit의 절반) — "최소 슬롯 보장 + 나머지 균등"에서 균등 분할 자체가 이미 최소
 * 보장을 겸하므로 한 번에 계산한다. 각 kind 안에서는 기존 diverseCandidates(카테고리
 * 다양화)로 채운다. 한쪽 풀이 자기 몫을 못 채우면 남는 슬롯은 반대쪽 남은 후보로 채운다
 * (§3단계 지시: 이미 확보된 후보를 재배분하는 것이며 새 후보를 만들지 않는다).
 *
 * 처음엔 "specific 최소 보장분만 먼저 떼고, 나머지는 (남은 specific + base)를 합쳐
 * 카테고리로 다시 나눈다"로 구현했으나, 그 합친 나머지 라운드가 다시 카테고리 다양성으로
 * 돌면서 specific의 카테고리 폭(일식/아시아음식/술집/중식)이 base의 폭(한식 편중)보다
 * 넓다는 이유로 나머지까지 더 많이 가져가 specific 65% vs base 63.6%로 역전되는 과교정이
 * 실측(쿄오모라멘, n=3)으로 확인됐다(2026-09-08). kind 간 배분은 kind 단계에서 한 번만
 * 정하고, category 다양화는 각 kind 내부로만 한정해야 이 재귀적 편향을 피할 수 있다.
 */
export function allocateBySourceKind<T extends { id: string; category: string; distanceMeters: number }>(
  items: T[],
  kindOf: (id: string) => "specific" | "base",
  limit: number,
  local: boolean,
  minSpecificSlots: number = MIN_SPECIFIC_SLOTS,
): T[] {
  const specificPool = items.filter((c) => kindOf(c.id) === "specific");
  if (!specificPool.length) return diverseCandidates(items, limit, local);
  const basePool = items.filter((c) => kindOf(c.id) !== "specific");

  const evenShare = Math.floor(limit / 2);
  const specificTarget = Math.min(Math.max(minSpecificSlots, evenShare), specificPool.length, limit);
  const specificPicked = diverseCandidates(specificPool, specificTarget, local);

  const baseTarget = limit - specificPicked.length;
  const basePicked = diverseCandidates(basePool, Math.min(baseTarget, basePool.length), local);

  // base 풀이 자기 몫을 못 채우면(예: base 후보 자체가 적음) 남는 슬롯을 specific의
  // 나머지 후보로 채운다 — 새 후보를 만드는 게 아니라 이미 확보된 specific 풀 안에서만.
  const filled = specificPicked.length + basePicked.length;
  if (filled >= limit) return [...specificPicked, ...basePicked];
  const pickedIds = new Set([...specificPicked, ...basePicked].map((c) => c.id));
  const specificLeftover = specificPool.filter((c) => !pickedIds.has(c.id));
  const extra = diverseCandidates(specificLeftover, limit - filled, local);
  return [...specificPicked, ...basePicked, ...extra];
}
