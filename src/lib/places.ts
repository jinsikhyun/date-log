import { withSubjectParticle } from "@/lib/korean";

// 카테고리 색/아이콘/정렬은 categories.ts (DB 관리)로 이동. 기존 import 호환용 재노출.
export { categoryStyle, categoryIcon, orderCategories } from "@/lib/categories";

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
  wanted_by: string | null; // '나' | '여자친구' | '둘다' — wishlist 에서만
  added_by: string | null; // 등록한 사람 ('진식' / '지민')
  memory_count: number;
  created_at: string;
}

/** "진식이 추가함" / "징구리가 추가함" — 받침에 따라 조사 처리. added_by 없으면 null. */
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

/** wanted_by 값 → 카드에 보여줄 문구 */
export function wantedByLabel(v: string | null): string | null {
  switch (v) {
    case "둘다":
      return "둘 다 가고 싶어해요";
    // 구 값 (마이그레이션 전 데이터 대비)
    case "나":
      return "내가 가고 싶어해요";
    case "여자친구":
      return "여자친구가 가고 싶어해요";
    case null:
    case "":
      return null;
    default:
      return `${withSubjectParticle(v)} 가고 싶어해요`; // 커플 구성원 이름 (받침 처리)
  }
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
  wanted_by: string;
  added_by: string; // 현재 선택된 사용자 이름 (폼 필드 아님, 저장 시 자동 주입)
}

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
    wanted_by: input.status === "wishlist" ? input.wanted_by || null : null,
    rating: lite || !input.rating ? null : Number(input.rating),
    first_visit_date: lite ? null : input.first_visit_date || null,
    description: lite ? null : input.description.trim() || null,
    image_url: lite ? null : input.image_url.trim() || null,
  };
}
