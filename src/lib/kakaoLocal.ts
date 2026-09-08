// 카카오 로컬 REST API(서버 전용) — 키워드로 실제 장소 후보를 찾는다.
// 브라우저에서 쓰는 kakao.ts(JS SDK, NEXT_PUBLIC_KAKAO_MAP_KEY)와는 다른 키.
// KAKAO_REST_API_KEY 는 NEXT_PUBLIC_ 접두사가 없으므로 브라우저 번들에 포함되지 않는다.

import { haversineKm } from "@/lib/courses";

const KEYWORD_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";
const MAX_RADIUS_METERS = 20000; // 카카오 API 상한
const PAGE_SIZE = 15; // 카카오 API 상한
const DEFAULT_MAX_PAGES = 3; // pageable_count 상한(45) 안에서 최대 3페이지

export type KakaoSort = "accuracy" | "distance";

export interface KakaoCandidate {
  id: string;
  name: string;
  category: string; // 중분류 — 카드 표시용 (기존 그대로)
  categoryName: string; // 카카오 원본 전체 breadcrumb — AI 판단용 상세 정보
  address: string;
  lat: number;
  lng: number;
  kakaoMapUrl: string | null;
}

interface KakaoKeywordDocument {
  id: string;
  place_name: string;
  category_name: string;
  address_name: string;
  road_address_name: string;
  x: string; // lng
  y: string; // lat
  place_url: string;
}

interface KakaoKeywordResponse {
  documents: KakaoKeywordDocument[];
  meta: { pageable_count: number; is_end: boolean };
}

function shortCategory(categoryName: string): string {
  // "음식점 > 카페 > 프랜차이즈 > 공차" 처럼 브랜드명까지 붙는 경우가 있어
  // 마지막 조각 대신 중분류(두 번째 조각)를 쓴다. 2단계 미만이면 마지막 조각.
  const parts = categoryName.split(">").map((s) => s.trim());
  return parts[1] || parts[parts.length - 1] || categoryName;
}

function toCandidate(doc: KakaoKeywordDocument): KakaoCandidate {
  return {
    id: doc.id,
    name: doc.place_name,
    category: shortCategory(doc.category_name),
    categoryName: doc.category_name,
    address: doc.road_address_name || doc.address_name,
    lat: Number(doc.y),
    lng: Number(doc.x),
    kakaoMapUrl: doc.place_url || null,
  };
}

/** 서울/경기 주소만 통과. date.log 사용 범위 밖(다른 지방) 후보와 API 낭비를 막는다. */
export function isSeoulGyeonggi(address: string): boolean {
  return /^(서울|경기)/.test(address.trim());
}

/** kakao_map_link(place_url) 에서 place id 추출. "https://place.map.kakao.com/1082586921" → "1082586921" */
export function extractKakaoId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(\d+)\/?$/);
  return m ? m[1] : null;
}

// "프랜차이즈"/"브랜드" 다음 세그먼트는 브랜드명(예: "공차", "CU")이라 검색어로 안 쓴다 —
// shortCategory()가 같은 이유로 parts[1]을 쓰는 것과 동일한 문제. 브랜드명으로 검색하면
// 그 브랜드 매장만 나와 후보 폭이 오히려 좁아진다.
const CATEGORY_BRAND_MARKER = /^(프랜차이즈|브랜드)$/;
// 말단이 이런 값이면 구체성이 없으므로 그 앞 단계로 물러난다.
const CATEGORY_GENERIC_LEAF = /^(기타|기타서비스)$/;

/**
 * Kakao category_name 전체 경로(예: "음식점 > 일식 > 일본식라면")에서 상세 후보 검색어로
 * 쓸 가장 구체적인 항목을 고른다. 2026-09-08 실측(§3단계 진단): 실제 응답이
 * "음식점 > 일식 > 일본식라면"(3단), "음식점 > 일식"(2단), "음식점 > 샤브샤브"(2단)처럼
 * 깊이가 섞여 있어 "항상 말단" 또는 "항상 두 번째"로 고정할 수 없었다.
 * - parts[0](최상위, "음식점"/"카페" 등)은 우리 앱 자체 대분류와 비슷한 수준이라 제외.
 * - "프랜차이즈"/"브랜드" 세그먼트를 만나면 그 다음(브랜드명)은 쓰지 않는다.
 * - 그러고도 남은 것 중 가장 구체적인(마지막) 항목을 쓰되, "기타"류면 건너뛴다.
 * - 쓸 만한 게 없으면 null — 호출부는 기존 대분류 검색만 쓴다(억지로 만들지 않는다).
 */
export function deriveSpecificSearchTerm(categoryName: string): string | null {
  const parts = categoryName
    .split(">")
    .map((s) => s.trim())
    .filter(Boolean);
  const usable: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    if (CATEGORY_BRAND_MARKER.test(parts[i])) break;
    usable.push(parts[i]);
  }
  for (let i = usable.length - 1; i >= 0; i--) {
    if (!CATEGORY_GENERIC_LEAF.test(usable[i])) return usable[i];
  }
  return null;
}

/**
 * 기준 장소 자신을 이름 + 좌표로 재검색해 Kakao 쪽 세부 category_name을 얻는다.
 * Kakao Local API에는 place id로 직접 조회하는 엔드포인트가 없다(공식 문서 확인,
 * 2026-09-08) — 이름 검색 + 좌표 편향 + kakao_map_link의 id 대조가 유일한 우회다.
 * 좌표 편향(x/y/radius) 없이 이름만 검색하면 흔한 이름(예: "약수터")에서 전국의
 * 동명 자연 지형만 나오고 실제 매칭이 실패하는 것을 실측으로 확인했다 — radius는
 * 선택이 아니라 필수다. id가 일치하는 결과가 없으면 null — 추측해서 엉뚱한
 * category_name을 쓰지 않는다.
 */
export async function findReferenceCategoryName(params: {
  apiKey: string;
  name: string;
  lat: number;
  lng: number;
  expectedId: string;
}): Promise<{ categoryName: string } | null> {
  const url = new URL(KEYWORD_SEARCH_URL);
  url.searchParams.set("query", params.name);
  url.searchParams.set("x", String(params.lng));
  url.searchParams.set("y", String(params.lat));
  url.searchParams.set("radius", "500");
  url.searchParams.set("sort", "distance");
  url.searchParams.set("page", "1");
  url.searchParams.set("size", String(PAGE_SIZE));
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${params.apiKey}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as KakaoKeywordResponse;
  const match = body.documents.find((d) => d.id === params.expectedId);
  return match ? { categoryName: match.category_name } : null;
}

/**
 * 키워드 검색 한 번(한 정렬 기준)으로 후보를 모으고 서울/경기 밖 주소는 제외한다.
 * 최대 maxPages 페이지 조회, 필터 후 앞에서부터 반환.
 */
export async function searchKakaoPlaces(params: {
  apiKey: string;
  query: string;
  lat: number;
  lng: number;
  radiusMeters?: number;
  limit?: number;
  sort?: KakaoSort; // 기본 accuracy — 거리순만 쓰지 않는다.
  maxPages?: number;
}): Promise<KakaoCandidate[]> {
  const radius = Math.min(MAX_RADIUS_METERS, Math.max(1, params.radiusMeters ?? 3000));
  const limit = params.limit ?? 12;
  const maxPages = params.maxPages ?? DEFAULT_MAX_PAGES;

  const results: KakaoCandidate[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(KEYWORD_SEARCH_URL);
    url.searchParams.set("query", params.query);
    url.searchParams.set("x", String(params.lng));
    url.searchParams.set("y", String(params.lat));
    url.searchParams.set("radius", String(radius));
    url.searchParams.set("sort", params.sort ?? "accuracy");
    url.searchParams.set("page", String(page));
    url.searchParams.set("size", String(PAGE_SIZE));

    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${params.apiKey}` },
    });
    if (!res.ok) {
      throw new Error(`카카오 로컬 API 오류 (${res.status})`);
    }
    const body = (await res.json()) as KakaoKeywordResponse;

    for (const doc of body.documents) {
      if (!isSeoulGyeonggi(doc.road_address_name || doc.address_name)) continue;
      results.push(toCandidate(doc));
    }

    if (body.meta.is_end || results.length >= limit) break;
  }

  return results.slice(0, limit);
}

// 후보가 어느 검색어에서 왔는지 구분하는 유일한 차원 — "구체 검색어"(deriveSpecificSearchTerm
// 결과) vs "그 외 전부"(대분류·태그조합·역할 검색어). 정렬(accuracy/distance)은 별도 차원으로
// 나누지 않는다 — §3단계 진단에서 distance 정렬 기여도가 지역마다 0~4건으로 들쭉날쭉해,
// 차원을 늘리면 실험 공간만 커지고 결론이 안 나기 때문(2026-09-08).
export type QueryKind = "specific" | "base";

/** 최종 채택된 후보 하나가 어느 검색어·정렬·원래 순위에서 왔는지. 로그/진단 전용 —
 * KakaoCandidate 필드로 붙이지 않고 별도 Map으로만 관리해 AI 프롬프트·응답 바디에
 * 구조적으로 섞일 수 없게 한다(§3단계 지시: 내부 라벨 유출 패턴 재발 방지). */
export interface CandidateSource {
  query: string;
  kind: QueryKind;
  sort: KakaoSort;
  rank: number; // 그 검색어×정렬 조합 안에서의 원래 순위(1-based)
}

export interface CollectCandidatesResult {
  candidates: KakaoCandidate[];
  sources: Map<string, CandidateSource>; // candidate id -> 최초 채택된 출처
}

/**
 * 여러 검색어 × 정확도순/거리순을 모두 조회해 카카오 place id 기준으로 합친다.
 * 검색어 하나만, 거리순만 쓰던 방식보다 후보 폭과 다양성을 넓힌다.
 * 조합 하나가 실패해도(네트워크 등) 나머지는 계속 진행한다.
 */
export async function collectCandidates(params: {
  apiKey: string;
  queries: Array<{ query: string; kind: QueryKind }>;
  lat: number;
  lng: number;
  radiusMeters?: number;
  limitPerCall?: number;
}): Promise<CollectCandidatesResult> {
  const sorts: KakaoSort[] = ["accuracy", "distance"];
  const seen = new Set<string>();
  const uniqueQueries: Array<{ query: string; kind: QueryKind }> = [];
  for (const q of params.queries) {
    const query = q.query.trim();
    if (!query || seen.has(query)) continue;
    seen.add(query);
    uniqueQueries.push({ query, kind: q.kind });
  }

  const calls = uniqueQueries.flatMap(({ query, kind }) =>
    sorts.map((sort) => ({ query, kind, sort })),
  );

  const settled = await Promise.allSettled(
    calls.map((c) =>
      searchKakaoPlaces({
        apiKey: params.apiKey,
        query: c.query,
        lat: params.lat,
        lng: params.lng,
        radiusMeters: params.radiusMeters,
        limit: params.limitPerCall ?? PAGE_SIZE,
        sort: c.sort,
        maxPages: 1, // 검색어 여러 개를 합치므로 조합당 1페이지면 충분
      }),
    ),
  );

  const lists = settled.flatMap((r, i) =>
    r.status === "fulfilled" ? [{ ...calls[i], docs: r.value }] : [],
  );
  if (!lists.length) throw new Error("모든 장소 검색 요청이 실패했습니다.");

  const merged = new Map<string, KakaoCandidate>();
  const sources = new Map<string, CandidateSource>();
  for (let i = 0; i < PAGE_SIZE; i++) {
    for (const { query, kind, sort, docs } of lists) {
      const c = docs[i];
      if (!c) continue;
      if (!merged.has(c.id)) {
        merged.set(c.id, c);
        sources.set(c.id, { query, kind, sort, rank: i + 1 });
      }
    }
  }
  return { candidates: Array.from(merged.values()), sources };
}

export interface KakaoCandidateWithDistance extends KakaoCandidate {
  distanceMeters: number;
}

/** 후보마다 기준 좌표(origin)로부터의 직선거리(m)를 붙인다. */
export function withDistance(
  candidates: KakaoCandidate[],
  origin: { lat: number; lng: number },
): KakaoCandidateWithDistance[] {
  return candidates.map((c) => ({
    ...c,
    distanceMeters: Math.round(
      haversineKm(origin, { lat: c.lat, lng: c.lng }) * 1000,
    ),
  }));
}

const normAddr = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/**
 * 지금 보고 있는 장소 자신 / 같은 주소 / 반경 minDistanceMeters 이내 후보를 제외한다.
 * (요청: 같은 Kakao id는 반드시 제외, 같은 주소·50m 이내는 기본 제외)
 * withDistance() 로 distanceMeters 를 먼저 붙인 배열을 넣는다.
 */
export function excludeNearSelf(
  candidates: KakaoCandidateWithDistance[],
  self: { id?: string | null; address?: string | null },
  minDistanceMeters = 50,
): KakaoCandidateWithDistance[] {
  const selfAddr = self.address ? normAddr(self.address) : null;
  return candidates.filter((c) => {
    if (self.id && c.id === self.id) return false;
    if (selfAddr && normAddr(c.address) === selfAddr) return false;
    if (c.distanceMeters <= minDistanceMeters) return false;
    return true;
  });
}
