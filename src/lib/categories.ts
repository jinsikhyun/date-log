// 카테고리는 Supabase `categories` 테이블에서 관리한다 (추가/수정/삭제 가능).
// - React 트리에서는 useCategories() 컨텍스트로 반응형으로 읽고,
// - DOM 을 직접 만드는 코드(mapBadge 등)나 순수 함수는 아래 모듈 레지스트리를 읽는다.
//   레지스트리는 CategoriesProvider 가 DB 값으로 채워 준다.

export interface Category {
  id: number;
  name: string;
  color: string; // tailwind 색 이름 (COLOR_CLASSES 의 키)
  icon: string; // 이모지
  sort_order: number;
}

export const CATEGORY_COLUMNS = "id, name, color, icon, sort_order";

// 색 이름 → (배경 + 글자색) 클래스.
// ⚠️ Tailwind 가 스캔할 수 있도록 완성된 클래스 문자열을 리터럴로 나열한다. 동적 조합 금지.
export const COLOR_CLASSES: Record<string, string> = {
  stone: "bg-stone-200 text-stone-600",
  red: "bg-red-100 text-red-700",
  orange: "bg-orange-100 text-orange-700",
  amber: "bg-amber-100 text-amber-800",
  yellow: "bg-yellow-100 text-yellow-800",
  lime: "bg-lime-100 text-lime-700",
  green: "bg-green-100 text-green-700",
  emerald: "bg-emerald-100 text-emerald-700",
  teal: "bg-teal-100 text-teal-700",
  cyan: "bg-cyan-100 text-cyan-700",
  sky: "bg-sky-100 text-sky-700",
  blue: "bg-blue-100 text-blue-700",
  indigo: "bg-indigo-100 text-indigo-700",
  violet: "bg-violet-100 text-violet-700",
  purple: "bg-purple-100 text-purple-700",
  fuchsia: "bg-fuchsia-100 text-fuchsia-700",
  pink: "bg-pink-100 text-pink-700",
  rose: "bg-rose-100 text-rose-700",
};

export const COLOR_NAMES = Object.keys(COLOR_CLASSES);
export const DEFAULT_COLOR = "stone";
export const DEFAULT_ICON = "📍";

export function colorClass(color: string): string {
  return COLOR_CLASSES[color] ?? COLOR_CLASSES[DEFAULT_COLOR];
}

// 테이블이 없거나 로드 전일 때 쓰는 기본 카테고리 (id 음수 = 합성)
export const DEFAULT_CATEGORIES: Category[] = [
  { id: -1, name: "맛집", color: "orange", icon: "🍽️", sort_order: 10 },
  { id: -2, name: "카페", color: "amber", icon: "☕", sort_order: 20 },
  { id: -3, name: "술집", color: "rose", icon: "🍶", sort_order: 30 },
  { id: -4, name: "바", color: "purple", icon: "🍸", sort_order: 40 },
  { id: -5, name: "사진", color: "sky", icon: "📷", sort_order: 50 },
  { id: -6, name: "전시", color: "fuchsia", icon: "🖼️", sort_order: 60 },
  { id: -7, name: "기타", color: "stone", icon: "📍", sort_order: 70 },
];

// ── 모듈 레지스트리 ──────────────────────────────────────────
let registry: Category[] = DEFAULT_CATEGORIES;

export function setCategoryRegistry(cats: Category[]): void {
  registry = cats.length > 0 ? cats : DEFAULT_CATEGORIES;
}

/** 카테고리 태그 색상 클래스 (레지스트리 기반) */
export function categoryStyle(name: string): string {
  return colorClass(registry.find((c) => c.name === name)?.color ?? DEFAULT_COLOR);
}

/** 카테고리 아이콘 이모지 (레지스트리 기반) */
export function categoryIcon(name: string): string {
  return registry.find((c) => c.name === name)?.icon ?? DEFAULT_ICON;
}

/** 이름 목록을 주어진 카테고리 순서로 정렬 (미등록은 뒤로) */
export function orderNamesBy(
  cats: Category[],
  names: Iterable<string>,
): string[] {
  const order = cats.map((c) => c.name);
  return [...new Set(names)].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

/** 데이터에 등장하는 카테고리를 레지스트리 순서로 정렬 (미등록은 뒤) */
export function orderCategories(names: Iterable<string>): string[] {
  return orderNamesBy(registry, names);
}
