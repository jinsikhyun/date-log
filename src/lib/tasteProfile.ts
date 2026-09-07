// CLAUDE_AI_RECOMMENDATION_UPGRADE_HANDOFF.md 4단계: buildTasteProfile.
// 네트워크와 분리된 순수 함수 — 후보(candidates)를 모른다. 후보 연결은 5단계(프롬프트 조립) 몫이다.
// src/app/api/ai-recommend/route.ts 에 연결됨(2026-09-08).
//
// facts/quote에는 "member_1"/"member_2" 같은 내부 라벨을 절대 문자열로 넣지 않는다.
// 2026-09-08 회귀 확인에서 `${label} pick`처럼 라벨을 단어에 붙인 문자열을 모델이
// reason에 그대로 베끼는 사례("member_2 pick")를 실제로 확인했다 — 후처리
// 정규식(stripInternalMemberLabels)으로 막아 두긴 했지만, 그건 유출을 사후에
// 지우는 방어망이지 원인 제거가 아니다. 여기서는 입력 자체에 라벨을 만들지 않는다:
// 한 사람만 관련되면 주어를 아예 생략하고("pick함"), 두 사람이 서로 다르게 반응했을
// 때만 "한 사람"/"다른 사람"이라는 완전한 자연어 대명사로 구분한다(personPhrase 참고).

export type TasteProfilePlace = {
  id: number;
  name: string;
  category: string;
  status: "visited" | "wishlist" | "course_only";
  rating: number | null; // 0~5, 공동(장소) 기록 — 특정 개인의 평가가 아니다.
  confirmedTags: string[];
  isRegular: boolean; // "단골" — 지정 사실이며 방문 횟수가 아니다.
  favoriteBy: string[]; // pick 한 profile id
  wantedByIds: string[]; // status === 'wishlist' 일 때만 의미 있음(폼 저장 규칙상 그 외엔 항상 [])
  firstVisitDate: string | null; // 'YYYY-MM-DD', 방문일. 최근성 기준은 이 값을 생성일보다 우선한다.
  createdAt: string; // ISO. firstVisitDate 없을 때만 최근성 폴백으로 쓴다.
};

export type TasteProfileMemory = {
  placeId: number;
  author: string | null; // 커플 구성원 display_name — 모호하면 귀속하지 않는다.
  moodTag: string | null;
  content: string | null; // 한줄평 원문
  date: string | null; // 'YYYY-MM-DD' 방문일 — created_at(작성일)과 혼동하지 않는다.
  createdAt: string;
};

export type TasteProfileMember = { id: string; displayName: string | null };

export type Reaction = "positive" | "neutral" | "negative";

export type TasteQuote = { member: string | null; text: string; reaction: Reaction };

export type TasteEvidence = {
  placeId: number;
  name: string;
  category: string;
  facts: string[]; // 중립적 사실 문장. 상충하는 신호도 숨기지 않고 함께 담는다.
  quote?: TasteQuote;
};

export type NegativeEvidenceItem = {
  placeId: number;
  name: string;
  category: string;
  facts: string[]; // 이 장소에 한정된 부정적 사실만. 업종 일반화 문구를 만들지 않는다.
};

export type WishlistOrientationItem = {
  placeId: number;
  name: string;
  category: string;
  wantedBy: string[]; // member_x[]
};

export type PersonalPreference = { member: string; places: TasteEvidence[] };
export type SharedPreference = { places: TasteEvidence[] };

export type EvidenceLevel = "none" | "low" | "medium" | "high";

export type TasteProfile = {
  representativePlaces: TasteEvidence[];
  relatedHighRatedPlaces: TasteEvidence[];
  personalPreferences: PersonalPreference[];
  sharedPreferences: SharedPreference;
  negativeEvidence: NegativeEvidenceItem[];
  wishlistOrientation: WishlistOrientationItem[];
  evidenceSufficiency: { overall: EvidenceLevel; perMember: Record<string, EvidenceLevel> };
};

const MOOD_REACTION: Record<string, Reaction> = {
  "❤️ 좋았어요": "positive",
  "🙂 괜찮았어요": "neutral",
  "😐 아쉬웠어요": "negative",
  "좋았어요": "positive",
  "괜찮았어요": "neutral",
  "아쉬웠어요": "negative",
};

// 아래 상한·경계·반감기는 실험값이다(문서 §4단계 명시) — 평가 결과로 조정한다.
const REPRESENTATIVE_CAP = 8;
const RELATED_HIGH_RATED_CAP = 10;
const PERSONAL_CAP = 8;
const NEGATIVE_CAP = 10;
const WISHLIST_CAP = 10;
const RECENCY_HALFLIFE_DAYS = 180;
const RECENCY_FLOOR = 0.4; // 오래된 단골/기록이 0에 수렴해 사라지지 않도록 하는 하한
const NEGATIVE_RATING_THRESHOLD = 3; // 5점 만점, 미만이면 부정 근거로 취급(실험값)
const HIGH_RATING_THRESHOLD = 4;

// memories.content(추억 원문)는 이 앱에서 가장 사적인 데이터이며 OpenAI로 나간다.
// 그래서 "관련 있는 것만·개수 상한·길이 상한"을 여기 한 곳에 명시한다:
//  1) 장소당 최대 1개 원문만 쓴다(가장 최근 것) — 같은 장소 원문을 여러 번 노출하지 않는다.
//  2) 원문이 붙는 장소는 이미 대표/관련/개인/공통 근거로 선별된 장소 중에서만 고른다(전체 추억을 훑지 않는다).
//  3) 그중에서도 이번 요청 전체를 통틀어 최대 QUOTE_BUDGET_TOTAL 곳까지만 원문을 붙인다(강도 점수 상위순).
//  4) 각 원문은 QUOTE_MAX_CHARS자로 자르되 문장 경계를 우선한다(의미가 뒤집히는 절단 방지).
const QUOTE_BUDGET_TOTAL = 10;
const QUOTE_MAX_CHARS = 80;

function bucketCount(n: number): EvidenceLevel {
  if (n <= 0) return "none";
  if (n <= 2) return "low";
  if (n <= 9) return "medium";
  return "high";
}

function truncateQuote(text: string, max = QUOTE_MAX_CHARS): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  // 문장 경계(마침표류 또는 해요체 종결 "요")에서 자르는 것을 우선한다 —
  // 임의 위치 절단으로 부정어("안", "별로")가 잘려나가 의미가 뒤집히는 것을 피한다.
  let boundary = -1;
  for (const marker of [".", "!", "?", "요"]) {
    const idx = cut.lastIndexOf(marker);
    if (idx > boundary) boundary = idx;
  }
  if (boundary > max * 0.4) return cut.slice(0, boundary + 1);
  return `${cut}…`;
}

function recencyWeight(dateStr: string | null, now: Date): number {
  if (!dateStr) return 0.7; // 날짜 정보 없음 — 배제하지 않고 중간값으로 취급
  // firstVisitDate('YYYY-MM-DD')와 createdAt(전체 ISO) 두 형식을 모두 받는다 — 이미 시간이 있으면 덧붙이지 않는다.
  const parsed = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00Z`);
  const days = (now.getTime() - parsed.getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days < 0) return 1;
  return Math.max(RECENCY_FLOOR, Math.pow(0.5, days / RECENCY_HALFLIFE_DAYS));
}

type Agg = {
  place: TasteProfilePlace;
  pickMembers: string[];
  wishMembers: string[];
  positiveMembers: string[];
  neutralMembers: string[];
  negativeMembers: string[];
  memoryCount: number;
  bestQuote: TasteQuote | null;
  bestQuoteDate: string | null;
};

/**
 * 방문/평가/픽/위시/단골/추억 원문을 장소 ID 기준으로 묶어 추천 프롬프트에 쓸 수 있는
 * 요약 구조로 만든다. 후보(candidates)는 입력받지 않는다 — 후보 사실 연결은 5단계 몫이다.
 */
export function buildTasteProfile(
  places: TasteProfilePlace[],
  memories: TasteProfileMemory[],
  members: TasteProfileMember[],
  now: Date,
): TasteProfile {
  const memberLabel = new Map(members.map((m, i) => [m.id, `member_${i + 1}`]));
  const aggById = new Map<number, Agg>();
  for (const place of places) {
    if (place.status === "course_only") continue; // 코스 미니폼 생성 — 취향 신호로 보지 않는다.
    aggById.set(place.id, {
      place,
      pickMembers: [],
      wishMembers: [],
      positiveMembers: [],
      neutralMembers: [],
      negativeMembers: [],
      memoryCount: 0,
      bestQuote: null,
      bestQuoteDate: null,
    });
  }

  for (const agg of aggById.values()) {
    for (const id of agg.place.favoriteBy) {
      const label = memberLabel.get(id);
      if (label && !agg.pickMembers.includes(label)) agg.pickMembers.push(label);
    }
    if (agg.place.status === "wishlist") {
      for (const id of agg.place.wantedByIds) {
        const label = memberLabel.get(id);
        if (label && !agg.wishMembers.includes(label)) agg.wishMembers.push(label);
      }
    }
  }

  for (const memory of memories) {
    const agg = aggById.get(memory.placeId);
    if (!agg) continue;
    agg.memoryCount += 1;
    const reaction = memory.moodTag ? MOOD_REACTION[memory.moodTag.trim()] : undefined;
    if (!reaction) continue;
    const matches = memory.author == null ? [] : members.filter((m) => m.displayName === memory.author);
    const label = matches.length === 1 ? memberLabel.get(matches[0].id) ?? null : null;
    if (label) {
      if (reaction === "positive" && !agg.positiveMembers.includes(label)) agg.positiveMembers.push(label);
      if (reaction === "neutral" && !agg.neutralMembers.includes(label)) agg.neutralMembers.push(label);
      if (reaction === "negative" && !agg.negativeMembers.includes(label)) agg.negativeMembers.push(label);
    }
    if (memory.content?.trim()) {
      const effectiveDate = memory.date ?? memory.createdAt;
      // 최신 원문을 대표로 쓰되, 부정·예외 반응이라고 밀어내지 않는다(원문 보존 원칙).
      if (!agg.bestQuoteDate || effectiveDate > agg.bestQuoteDate) {
        agg.bestQuoteDate = effectiveDate;
        agg.bestQuote = { member: label, text: truncateQuote(memory.content), reaction };
      }
    }
  }

  // 이 장소에 신호를 남긴 라벨을 등장 순서대로 모아 "한 사람"/"다른 사람"에 대응시킨다.
  // 반환값(Map의 value)에는 member_1/member_2 라벨이 전혀 나타나지 않는다 — 대명사만 있다.
  function pronounMap(agg: Agg): Map<string, string> {
    const order: string[] = [];
    for (const label of [
      ...agg.pickMembers,
      ...agg.wishMembers,
      ...agg.positiveMembers,
      ...agg.neutralMembers,
      ...agg.negativeMembers,
    ]) {
      if (!order.includes(label)) order.push(label);
    }
    const map = new Map<string, string>();
    if (order[0] != null) map.set(order[0], "한 사람");
    if (order[1] != null) map.set(order[1], "다른 사람");
    return map;
  }

  /** 한 사람만 관련되면 주어를 생략하고("pick함"), 두 사람이 다르게 반응했을 때만 대명사를 붙인다. */
  function personPhrase(agg: Agg, label: string, predicate: string): string {
    const map = pronounMap(agg);
    if (map.size <= 1) return predicate;
    return `${map.get(label)}은 ${predicate}`;
  }

  function baseFacts(agg: Agg): string[] {
    const facts: string[] = [];
    if (agg.pickMembers.length >= 2) facts.push("두 사람 모두 pick함");
    else for (const label of agg.pickMembers) facts.push(personPhrase(agg, label, "pick함"));
    if (agg.place.isRegular) facts.push("단골로 지정함");
    if (agg.place.rating != null) facts.push(`공동 별점 ${agg.place.rating}`);
    if (agg.place.confirmedTags.length > 0) facts.push(`확인 태그: ${agg.place.confirmedTags.join(", ")}`);
    for (const label of agg.positiveMembers) facts.push(personPhrase(agg, label, "방문 후 긍정 반응을 남김"));
    for (const label of agg.neutralMembers) facts.push(personPhrase(agg, label, "방문 후 중립 반응을 남김"));
    for (const label of agg.negativeMembers) facts.push(personPhrase(agg, label, "방문 후 아쉬운 반응을 남김")); // 상충해도 숨기지 않는다.
    if (agg.memoryCount > 0) facts.push(`추억 ${agg.memoryCount}건`); // 만족/재방문 횟수로 해석하지 않는다.
    return facts;
  }

  /** personalPreferences 전용: 이 member 본인 신호만 담아 아예 대명사가 필요 없다. */
  function personalFacts(agg: Agg, label: string): string[] {
    const facts: string[] = [];
    if (agg.pickMembers.includes(label)) facts.push("pick함");
    if (agg.wishMembers.includes(label)) facts.push("위시에 담음");
    if (agg.place.isRegular) facts.push("단골로 지정함");
    if (agg.place.rating != null) facts.push(`공동 별점 ${agg.place.rating}`);
    if (agg.place.confirmedTags.length > 0) facts.push(`확인 태그: ${agg.place.confirmedTags.join(", ")}`);
    if (agg.positiveMembers.includes(label)) facts.push("방문 후 긍정 반응을 남김");
    if (agg.neutralMembers.includes(label)) facts.push("방문 후 중립 반응을 남김");
    if (agg.negativeMembers.includes(label)) facts.push("방문 후 아쉬운 반응을 남김");
    if (agg.memoryCount > 0) facts.push(`추억 ${agg.memoryCount}건`);
    return facts;
  }

  /** quote.member도 라벨이 아니라 대명사(또는 한 명뿐이면 null)로 노출한다. */
  function quoteWithPronoun(agg: Agg): TasteQuote {
    const raw = agg.bestQuote as TasteQuote;
    const map = pronounMap(agg);
    const pronoun = raw.member && map.size > 1 ? map.get(raw.member) ?? null : null;
    return { ...raw, member: pronoun };
  }

  function toEvidence(agg: Agg): TasteEvidence {
    return {
      placeId: agg.place.id,
      name: agg.place.name,
      category: agg.place.category,
      facts: baseFacts(agg),
      ...(agg.bestQuote && quoteEligibleIds.has(agg.place.id) ? { quote: quoteWithPronoun(agg) } : {}),
    };
  }

  function strengthScore(agg: Agg): number {
    let score = 0;
    score += agg.pickMembers.length * 3;
    if (agg.pickMembers.length >= 2) score += 2;
    if (agg.place.isRegular) score += 2;
    if (agg.place.rating != null && agg.place.rating >= HIGH_RATING_THRESHOLD) score += 2;
    score += agg.positiveMembers.length * 1;
    if (agg.place.confirmedTags.length > 0) score += 1;
    if (agg.wishMembers.length > 0) score += 0.5;
    if (score <= 0) return 0;
    const recencyBasis = agg.place.firstVisitDate ?? agg.place.createdAt;
    return score * recencyWeight(recencyBasis, now);
  }

  const scored = [...aggById.values()]
    .map((agg) => ({ agg, score: strengthScore(agg) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  // 원문(quote) 노출 예산: 장소당 1개로 이미 제한돼 있지만, 이번 요청 전체에서 노출되는
  // 원문 총 개수도 강도 점수 상위 QUOTE_BUDGET_TOTAL곳으로 다시 제한한다.
  // 나머지 장소는 facts(사실)는 그대로 노출하되 quote(원문)만 뺀다 — 사실 자체를 숨기지 않는다.
  const quoteEligibleIds = new Set(
    scored
      .filter((s) => s.agg.bestQuote != null)
      .slice(0, QUOTE_BUDGET_TOTAL)
      .map((s) => s.agg.place.id),
  );

  const representativePlaces = scored.slice(0, REPRESENTATIVE_CAP).map((s) => toEvidence(s.agg));
  const representativeIds = new Set(representativePlaces.map((p) => p.placeId));

  const relatedHighRatedPlaces = [...aggById.values()]
    .filter(
      (agg) =>
        !representativeIds.has(agg.place.id) &&
        agg.place.status === "visited" &&
        ((agg.place.rating != null && agg.place.rating >= HIGH_RATING_THRESHOLD) ||
          agg.positiveMembers.length > 0),
    )
    .sort((a, b) => strengthScore(b) - strengthScore(a))
    .slice(0, RELATED_HIGH_RATED_CAP)
    .map(toEvidence);

  const personalPreferences: PersonalPreference[] = members.map((m, i) => {
    const label = `member_${i + 1}`;
    const own = [...aggById.values()]
      .filter(
        (agg) =>
          agg.pickMembers.includes(label) ||
          agg.wishMembers.includes(label) ||
          agg.positiveMembers.includes(label) ||
          agg.neutralMembers.includes(label),
      )
      .sort((a, b) => strengthScore(b) - strengthScore(a))
      .slice(0, PERSONAL_CAP)
      .map((agg) => ({
        placeId: agg.place.id,
        name: agg.place.name,
        category: agg.place.category,
        facts: personalFacts(agg, label),
        // 이 장소의 대표 원문이 실제로 이 member 것일 때만 붙인다 — 상대방 원문이
        // "본인 선호" 목록에 섞여 나오지 않게 한다. 이미 개인 목록이라 대명사도 필요 없다.
        ...(agg.bestQuote?.member === label && quoteEligibleIds.has(agg.place.id)
          ? { quote: { ...agg.bestQuote, member: null } }
          : {}),
      }));
    return { member: label, places: own };
  });

  const sharedPreferences: SharedPreference = {
    places: [...aggById.values()]
      .filter(
        (agg) =>
          agg.pickMembers.length >= 2 ||
          (agg.positiveMembers.length + agg.neutralMembers.length >= 2 &&
            members.every((m, i) => {
              const label = `member_${i + 1}`;
              return agg.positiveMembers.includes(label) || agg.neutralMembers.includes(label);
            })) ||
          agg.wishMembers.length >= 2,
      )
      .sort((a, b) => strengthScore(b) - strengthScore(a))
      .map(toEvidence),
  };

  const negativeEvidence: NegativeEvidenceItem[] = [...aggById.values()]
    .map((agg) => {
      const facts: string[] = [];
      if (agg.place.rating != null && agg.place.rating < NEGATIVE_RATING_THRESHOLD) {
        facts.push(`공동 별점 ${agg.place.rating}`);
      }
      for (const label of agg.negativeMembers) facts.push(personPhrase(agg, label, "방문 후 아쉬운 반응을 남김"));
      if (facts.length === 0) return null;
      return { placeId: agg.place.id, name: agg.place.name, category: agg.place.category, facts };
    })
    .filter((x): x is NegativeEvidenceItem => x != null)
    .slice(0, NEGATIVE_CAP);

  const wishlistOrientation: WishlistOrientationItem[] = [...aggById.values()]
    .filter((agg) => agg.place.status === "wishlist" && agg.wishMembers.length > 0)
    .sort((a, b) => strengthScore(b) - strengthScore(a))
    .slice(0, WISHLIST_CAP)
    .map((agg) => ({
      placeId: agg.place.id,
      name: agg.place.name,
      category: agg.place.category,
      wantedBy: agg.wishMembers,
    }));

  // 근거 충분성: 단순 개수 + 구성원별 근거 유무(둘 다 있어야 함) 둘 다 반영한다.
  const evidencedIds = new Set(
    [...aggById.values()]
      .filter(
        (agg) =>
          agg.pickMembers.length > 0 ||
          agg.wishMembers.length > 0 ||
          agg.positiveMembers.length > 0 ||
          agg.neutralMembers.length > 0 ||
          agg.negativeMembers.length > 0 ||
          agg.place.rating != null ||
          agg.place.isRegular ||
          agg.place.confirmedTags.length > 0,
      )
      .map((agg) => agg.place.id),
  );
  const perMember: Record<string, EvidenceLevel> = {};
  for (const m of members) {
    const label = memberLabel.get(m.id)!;
    const count = [...aggById.values()].filter(
      (agg) =>
        agg.pickMembers.includes(label) ||
        agg.wishMembers.includes(label) ||
        agg.positiveMembers.includes(label) ||
        agg.neutralMembers.includes(label) ||
        agg.negativeMembers.includes(label),
    ).length;
    perMember[label] = bucketCount(count);
  }
  let overall = bucketCount(evidencedIds.size);
  if (overall === "high" && Object.values(perMember).some((l) => l === "none")) {
    overall = "medium"; // 총량은 많아도 한쪽 구성원 근거가 전무하면 충분하다고 보지 않는다.
  }

  return {
    representativePlaces,
    relatedHighRatedPlaces,
    personalPreferences,
    sharedPreferences,
    negativeEvidence,
    wishlistOrientation,
    evidenceSufficiency: { overall, perMember },
  };
}
