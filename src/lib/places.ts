import { withSubjectParticle } from "@/lib/korean";

// 카테고리 색/아이콘/정렬은 categories.ts (DB 관리)로 이동. 기존 import 호환용 재노출.
export {
  categoryStyle,
  categoryIcon,
  categoryPin,
  orderCategories,
} from "@/lib/categories";

export type PlaceStatus = "visited" | "wishlist" | "course_only";

// Supabase `places` 테이블의 한 행.
export interface Place {
  id: number;
  name: string;
  category: string;
  address: string;
  naver_map_link: string | null;
  kakao_map_link: string | null; // 카카오 place_url 또는 장소명 검색 링크
  via_course: boolean; // 코스 미니폼으로 생성됨 → status='wishlist' 여도 /wishlist 에는 숨김
  rating: number | null;
  first_visit_date: string | null; // 'YYYY-MM-DD'
  description: string | null;
  image_url: string | null; // 대표 사진 (place-photos 버킷 public URL). 없으면 placeholder.
  lat: number | null; // 위도 (장소 검색 자동완성으로 채워짐). 없으면 지도가 주소를 지오코딩.
  lng: number | null; // 경도
  status: PlaceStatus; // 'visited'(다녀온 곳) | 'wishlist'(가고 싶은 곳)
  wanted_by: string | null; // (구) 단일값. 참고용. 이제 wanted_by_ids 사용
  wanted_by_ids: string[]; // 이 위시를 원하는 커플 구성원 profile id (0~2) — 독립 토글
  added_by: string | null; // 등록한 사람 (커플 구성원 display_name)
  favorite_by: string[]; // 이 장소를 pick 한 profiles.id (0~2개) — wanted_by 와 별개
  is_regular: boolean; // 우리 단골
  place_preferences?: { user_id: string; kind: "pick" }[];
  memory_count: number;
  created_at: string;
}

/** "{이름}이/가 추가함" — 받침에 따라 조사 처리. added_by 없으면 null. */
export function addedByLabel(name: string | null): string | null {
  return name ? `${withSubjectParticle(name)} 추가함` : null;
}

/** 장소명 + 주소의 구/동 정도로 네이버 "이미지" 탭 검색 URL */
export function naverImageSearchUrl(name: string, address: string): string {
  const region = (address || "")
    .split(/\s+/)
    .filter((t) => /(구|동|읍|면)$/.test(t))
    .slice(0, 2);
  const q = [name, ...region].filter(Boolean).join(" ");
  return `https://search.naver.com/search.naver?where=image&query=${encodeURIComponent(
    q,
  )}`;
}

// 위시리스트 "누가 가고 싶어해요?" 선택지는 이제 커플 profiles 에서 실시간으로
// 불러온다 (AuthProvider.coupleMembers + "둘다"). 하드코딩 목록은 제거됨.

/** status → 뱃지에 쓸 짧은 라벨 */
export function statusLabel(status: string): string {
  if (status === "wishlist") return "위시리스트";
  if (status === "course_only") return "이 코스 전용";
  return "다녀옴";
}

/** status 뱃지 색상 클래스 */
export function statusBadgeClass(status: string): string {
  if (status === "wishlist") return "bg-accent/10 text-accent";
  if (status === "course_only") return "bg-violet-100 text-violet-700";
  return "bg-stone-100 text-stone-500";
}

/** wanted_by_ids → 이름 배열. members 는 useAuth().coupleMembers. */
export function wantedByNames(
  ids: string[] | null | undefined,
  members: { id: string; display_name: string | null }[],
): string[] {
  return (ids ?? [])
    .map((id) => members.find((m) => m.id === id)?.display_name?.trim())
    .filter((n): n is string => !!n);
}

/** wanted_by_ids → 위시리스트 카드 한 줄 문구. 예: "{이름}이 가고 싶어해요" / "둘 다 가고 싶어해요". */
export function wantedByLabelFromIds(
  ids: string[] | null | undefined,
  members: { id: string; display_name: string | null }[],
): string | null {
  const names = wantedByNames(ids, members);
  if (names.length === 0) return null;
  if (names.length >= 2) return "둘 다 가고 싶어해요";
  return `${withSubjectParticle(names[0])} 가고 싶어해요`;
}

// ── 즐겨찾기(픽/단골) 보조 필터 ───────────────────────────────
// 카테고리 탭(주 필터)과 AND 로 결합되는 보조 토글. 켜진 토글끼리는 OR.
export interface FavoriteFilter {
  favoriteBy: string[]; // 토글된 profiles.id
  regular: boolean; // "단골" 토글
}

export const EMPTY_FAVORITE_FILTER: FavoriteFilter = {
  favoriteBy: [],
  regular: false,
};

export function favoriteFilterActive(f: FavoriteFilter): boolean {
  return f.favoriteBy.length > 0 || f.regular;
}

/** 켜진 토글 중 하나라도 해당하면 통과(OR). 아무것도 안 켜졌으면 전부 통과. */
export function matchesFavoriteFilter(place: Place, f: FavoriteFilter): boolean {
  if (!favoriteFilterActive(f)) return true;
  if (f.regular && place.is_regular) return true;
  const fav = place.favorite_by ?? [];
  return f.favoriteBy.some((id) => fav.includes(id));
}

// 장소 추가/수정 폼 값(전부 문자열) → places 테이블 row.
export interface PlaceRowInput {
  name: string;
  category: string;
  address: string;
  naver_map_link: string;
  kakao_map_link: string;
  rating: string;
  first_visit_date: string;
  description: string;
  image_url: string;
  lat: string;
  lng: string;
  status: PlaceStatus;
  wanted_by_ids: string[]; // wishlist 에서 이 위시를 원하는 커플 구성원 id (독립 토글)
  added_by: string; // 현재 선택된 사용자 이름 (폼 필드 아님, 저장 시 자동 주입)
}
// favorite_by(픽) / is_regular(단골) 는 이 폼에서 다루지 않는다.
// 장소 상세 페이지의 토글로만 켜고 끄며, 여기서 보내면 수정 저장 시 덮어써지므로 제외.

/** 폼 입력을 DB row 로. wishlist/course_only 면 방문 전용 필드(별점/방문일/한줄평/사진)는 비운다. */
export function placeInputToRow(input: PlaceRowInput) {
  const lite = input.status === "wishlist" || input.status === "course_only";
  return {
    name: input.name.trim(),
    category: input.category,
    address: input.address.trim(),
    naver_map_link: input.naver_map_link.trim() || null,
    kakao_map_link: input.kakao_map_link.trim() || null,
    lat: input.lat ? Number(input.lat) : null,
    lng: input.lng ? Number(input.lng) : null,
    status: input.status,
    added_by: input.added_by || null,
    wanted_by_ids:
      input.status === "wishlist" ? input.wanted_by_ids ?? [] : [],
    rating: lite || !input.rating ? null : Number(input.rating),
    first_visit_date: lite ? null : input.first_visit_date || null,
    description: lite ? null : input.description.trim() || null,
    image_url: lite ? null : input.image_url.trim() || null,
  };
}
