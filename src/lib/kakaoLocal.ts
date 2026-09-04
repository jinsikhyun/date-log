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

/**
 * 여러 검색어 × 정확도순/거리순을 모두 조회해 카카오 place id 기준으로 합친다.
 * 검색어 하나만, 거리순만 쓰던 방식보다 후보 폭과 다양성을 넓힌다.
 * 조합 하나가 실패해도(네트워크 등) 나머지는 계속 진행한다.
 */
export async function collectCandidates(params: {
  apiKey: string;
  queries: string[];
  lat: number;
  lng: number;
  radiusMeters?: number;
  limitPerCall?: number;
}): Promise<KakaoCandidate[]> {
  const sorts: KakaoSort[] = ["accuracy", "distance"];
  const uniqueQueries = Array.from(
    new Set(params.queries.map((q) => q.trim()).filter(Boolean)),
  );

  const calls = uniqueQueries.flatMap((query) =>
    sorts.map((sort) =>
      searchKakaoPlaces({
        apiKey: params.apiKey,
        query,
        lat: params.lat,
        lng: params.lng,
        radiusMeters: params.radiusMeters,
        limit: params.limitPerCall ?? PAGE_SIZE,
        sort,
        maxPages: 1, // 검색어 여러 개를 합치므로 조합당 1페이지면 충분
      }),
    ),
  );

  const settled = await Promise.allSettled(calls);
  const lists = settled.flatMap(r => r.status === "fulfilled" ? [r.value] : []);
  if (!lists.length) throw new Error("모든 장소 검색 요청이 실패했습니다.");
  const merged = new Map<string, KakaoCandidate>();
  for (let i = 0; i < PAGE_SIZE; i++) {
    for (const list of lists) {
      const c = list[i];
      if (!c) continue;
      if (!merged.has(c.id)) merged.set(c.id, c);
    }
  }
  return Array.from(merged.values());
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
