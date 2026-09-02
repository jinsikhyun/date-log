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

// Archive Teal 핸드오프의 확정 카테고리 색 (이름 기준, 정확한 hex).
// bg = 칩 배경, text = 칩 글자색 (= currentColor → 지도 핀 테두리색).
// ⚠️ 아래 클래스 문자열은 Tailwind 가 스캔하도록 리터럴로 나열 (동적 조합 금지).
export const CANON_CATEGORY_TAG: Record<string, string> = {
  맛집: "bg-[#E3ECE8] text-[#36585A]",
  카페: "bg-[#F2E9D8] text-[#7A5F31]",
  술집: "bg-[#F3E2DC] text-[#8B5143]",
  바: "bg-[#EAE4EF] text-[#5F4A79]",
  사진: "bg-[#DFE8EC] text-[#3B6076]",
  전시: "bg-[#E7E4D8] text-[#6B6432]",
  기타: "bg-[#ECE7DC] text-[#68635C]",
};

// 핸드오프 확정 카테고리 hex (공유 카드/회고 막대 등 인라인 색 매핑용)
export const CANON_CATEGORY_HEX: Record<
  string,
  { bg: string; fg: string; pin: string }
> = {
  맛집: { bg: "#E3ECE8", fg: "#36585A", pin: "#36585A" },
  카페: { bg: "#F2E9D8", fg: "#7A5F31", pin: "#A68452" },
  술집: { bg: "#F3E2DC", fg: "#8B5143", pin: "#B06A55" },
  바: { bg: "#EAE4EF", fg: "#5F4A79", pin: "#7E6699" },
  사진: { bg: "#DFE8EC", fg: "#3B6076", pin: "#55809A" },
  전시: { bg: "#E7E4D8", fg: "#6B6432", pin: "#8E8646" },
  기타: { bg: "#ECE7DC", fg: "#68635C", pin: "#9A9287" },
};

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

/** 카테고리 태그 색상 클래스. 확정 7종은 핸드오프 hex, 그 외는 레지스트리 색. */
export function categoryStyle(name: string): string {
  return (
    CANON_CATEGORY_TAG[name] ??
    colorClass(registry.find((c) => c.name === name)?.color ?? DEFAULT_COLOR)
  );
}

/** 카테고리 아이콘 이모지 (레지스트리 기반) */
export function categoryIcon(name: string): string {
  return registry.find((c) => c.name === name)?.icon ?? DEFAULT_ICON;
}

/** 카테고리의 원시 색 이름 (COLOR_CLASSES 의 키). 캡처용 인라인 색 매핑 등에 사용. */
export function categoryColorName(name: string): string {
  return registry.find((c) => c.name === name)?.color ?? DEFAULT_COLOR;
}

// tailwind 색 이름 → 대략적인 500 hex (필터 칩 도트 / 지도 핀 등 인라인 색용)
const TW_PIN: Record<string, string> = {
  stone: "#78716c",
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  yellow: "#eab308",
  lime: "#84cc16",
  green: "#22c55e",
  emerald: "#10b981",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  sky: "#0ea5e9",
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  purple: "#a855f7",
  fuchsia: "#d946ef",
  pink: "#ec4899",
  rose: "#f43f5e",
};

/** 필터 칩 도트·지도 핀에 쓸 카테고리 대표 hex. 확정 7종은 핸드오프 pin 값. */
export function categoryPin(name: string): string {
  return (
    CANON_CATEGORY_HEX[name]?.pin ??
    TW_PIN[categoryColorName(name)] ??
    TW_PIN[DEFAULT_COLOR]
  );
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

/**
 * 위시리스트의 자유로운 세부 업종을 다녀온 곳의 공식 카테고리로 정규화한다.
 * 공식 카테고리 이름과 이미 같으면 그대로 유지하고, 매핑할 수 없으면 기타(또는 첫 공식 분류).
 */
export function normalizeVisitedCategory(
  source: string,
  officialNames: Iterable<string>,
): string {
  const names = [...officialNames];
  const original = source.trim();
  if (!original) return "";
  if (names.includes(original)) return original;

  const rules: Array<{ target: string; pattern: RegExp }> = [
    {
      target: "맛집",
      pattern:
        /(한식|중식|일식|양식|분식|음식점|식당|레스토랑|국수|면요리|고기|구이|치킨|피자|햄버거|패스트푸드|뷔페|아시아음식|간식)/i,
    },
    {
      target: "카페",
      pattern: /(카페|커피|베이커리|디저트|제과|제빵|찻집|티룸)/i,
    },
    {
      target: "술집",
      pattern: /(술집|주점|포장마차|호프|이자카야|막걸리|맥주집|소주방)/i,
    },
    { target: "바", pattern: /(^|\s)(바|bar)($|\s)|와인바|칵테일/i },
    { target: "사진", pattern: /(사진관|스튜디오|셀프사진|포토)/i },
    { target: "전시", pattern: /(전시|미술관|박물관|갤러리|문화시설)/i },
    { target: "쇼핑", pattern: /(쇼핑|백화점|시장|소품|편집숍|편집샵|상점)/i },
    { target: "산책", pattern: /(산책|공원|정원|숲|둘레길)/i },
  ];

  const matched = rules.find(
    ({ target, pattern }) => names.includes(target) && pattern.test(original),
  );
  if (matched) return matched.target;
  if (names.includes("기타")) return "기타";
  return names[0] ?? original;
}
