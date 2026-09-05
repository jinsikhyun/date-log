import type { Place } from "@/lib/places";

/** 카카오 검색으로 찾은, 아직 우리 기록에 없는 후보. */
export interface KakaoCandidate {
  kakaoId: string;
  name: string;
  category: string;        // 우리 카테고리로 매핑된 값
  kakaoCategory: string;   // 카카오 원본 (예: "음식점 > 일식 > 라멘")
  address: string;
  lat: number;
  lng: number;
  kakaoMapUrl: string;
  distanceMeters: number | null;
}

/** kakao_map_link 에서 place id 추출. 못 뽑으면 null. */
export function extractKakaoId(link: string | null | undefined): string | null {
  if (!link) return null;
  return /place\.map\.kakao\.com\/(\d+)/.exec(link)?.[1] ?? null;
}

/** 카카오 category_name("음식점 > 일식 > 라멘") → 우리 카테고리 이름 후보. */
export function suggestCategory(categoryName: string, groupCode: string): string {
  if (groupCode === "CE7") return "카페";
  if (groupCode === "CT1") return "전시";
  // 술집·바는 카카오가 구분하지 못한다 → 전부 "술집"으로 통일하고 사후 수정.
  if (/술집|호프|바\b|와인|위스키|칵테일|이자카야|포차/.test(categoryName)) return "술집";
  if (groupCode === "FD6") return "맛집";
  return "맛집";
}

/**
 * 키워드 검색. bounds 를 주면 그 영역 안에서만 찾고, 결과가 없으면
 * 범위 없이 한 번 더 찾아 outOfBounds=true 로 돌려준다.
 */
export function searchKeyword(
  query: string,
  opts: { bounds?: kakao.maps.LatLngBounds; center?: { lat: number; lng: number } },
): Promise<{ items: KakaoCandidate[]; outOfBounds: boolean }> {
  const ps = new window.kakao.maps.services.Places();

  const run = (useBounds: boolean) =>
    new Promise<KakaoCandidate[]>((resolve) => {
      ps.keywordSearch(
        query,
        (data, status) => {
          if (status !== window.kakao.maps.services.Status.OK) return resolve([]);
          resolve(data.map((d) => toCandidate(d, opts.center)));
        },
        useBounds && opts.bounds ? { bounds: opts.bounds } : {},
      );
    });

  return run(true).then((inside) =>
    inside.length > 0
      ? { items: inside, outOfBounds: false }
      : run(false).then((all) => ({ items: all, outOfBounds: all.length > 0 })),
  );
}

/** 현위치 주변 음식점·카페 (검색어 없이). "주변 검색"용. */
export function searchNearby(
  center: { lat: number; lng: number },
  radius = 500,
): Promise<KakaoCandidate[]> {
  const ps = new window.kakao.maps.services.Places();
  const loc = new window.kakao.maps.LatLng(center.lat, center.lng);

  const byGroup = (code: string) =>
    new Promise<KakaoCandidate[]>((resolve) => {
      ps.categorySearch(
        code,
        (data, status) => {
          if (status !== window.kakao.maps.services.Status.OK) return resolve([]);
          resolve(data.map((d) => toCandidate(d, center)));
        },
        { location: loc, radius, sort: window.kakao.maps.services.SortBy.DISTANCE },
      );
    });

  return Promise.all([byGroup("FD6"), byGroup("CE7")]).then(([a, b]) =>
    dedupe([...a, ...b]).sort(
      (x, y) => (x.distanceMeters ?? 0) - (y.distanceMeters ?? 0),
    ),
  );
}

function toCandidate(
  d: kakao.maps.services.PlacesSearchResultItem,
  center?: { lat: number; lng: number },
): KakaoCandidate {
  const lat = parseFloat(d.y);
  const lng = parseFloat(d.x);
  return {
    kakaoId: d.id,
    name: d.place_name,
    category: suggestCategory(d.category_name, d.category_group_code),
    kakaoCategory: d.category_name,
    address: d.road_address_name || d.address_name,
    lat,
    lng,
    kakaoMapUrl: d.place_url,
    // d.distance 는 location 옵션을 줬을 때만 채워진다 → 없으면 직접 계산
    distanceMeters: d.distance
      ? Number(d.distance)
      : center
        ? Math.round(haversineMeters(center, { lat, lng }))
        : null,
  };
}

function dedupe(list: KakaoCandidate[]): KakaoCandidate[] {
  const seen = new Map<string, KakaoCandidate>();
  list.forEach((c) => { if (!seen.has(c.kakaoId)) seen.set(c.kakaoId, c); });
  return [...seen.values()];
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** 카카오 결과에서 이미 저장한 곳을 걸러낸다. place id 대조. */
export function splitCandidates(
  results: KakaoCandidate[],
  places: Place[],
): { alreadySaved: Place[]; fresh: KakaoCandidate[] } {
  const byId = new Map<string, Place>();
  places.forEach((p) => {
    const id = extractKakaoId(p.kakao_map_link);
    if (id) byId.set(id, p);
  });

  const alreadySaved: Place[] = [];
  const fresh: KakaoCandidate[] = [];
  results.forEach((c) => {
    const mine = byId.get(c.kakaoId);
    if (mine) alreadySaved.push(mine);
    else fresh.push(c);
  });
  return { alreadySaved, fresh };
}
