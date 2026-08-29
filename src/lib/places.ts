// Supabase `places` 테이블의 한 행.
export interface Place {
  id: number;
  name: string;
  category: string;
  address: string;
  naver_map_link: string | null;
  rating: number | null;
  first_visit_date: string | null; // 'YYYY-MM-DD'
  description: string | null;
  memory_count: number;
  created_at: string;
}

// 장소 추가 폼에서 고를 수 있는 카테고리
export const CATEGORY_OPTIONS = ["맛집", "카페", "전시", "산책", "기타"] as const;

// 카테고리별 태그 색상. 여기 없는 값이 오면 categoryStyle()이 회색(기본)으로 처리한다.
const CATEGORY_STYLES: Record<string, string> = {
  맛집: "bg-orange-100 text-orange-700",
  카페: "bg-amber-100 text-amber-800",
  전시: "bg-violet-100 text-violet-700",
  산책: "bg-emerald-100 text-emerald-700",
  기타: "bg-stone-200 text-stone-600",
};

export const DEFAULT_CATEGORY_STYLE = "bg-stone-200 text-stone-600";

/** 알 수 없는 카테고리는 기본 회색으로 */
export function categoryStyle(category: string): string {
  return CATEGORY_STYLES[category] ?? DEFAULT_CATEGORY_STYLE;
}
