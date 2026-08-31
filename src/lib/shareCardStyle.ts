// 공유 카드(ShareCard / CourseShareCard) 공용 스타일 토큰.
// ⚠️ html2canvas 가 Tailwind v4 의 oklch() 색을 못 읽으므로 공유 카드는
//    Tailwind 색 클래스를 안 쓰고 전부 인라인 hex 로만 스타일링한다.
import { CANON_CATEGORY_HEX, categoryColorName } from "@/lib/categories";

/** 공유 카드 고정 폭(px). 캡처 영역이 뷰포트를 물려받지 않도록 항상 이 값으로 고정. */
export const CARD_W = 400;

// Archive Teal
export const SC = {
  cardBg: "#ffffff",
  fg: "#302e2b",
  fgSoft: "#4a463f",
  muted: "#7c766c",
  accent: "#36585a",
  border: "#ded6c8",
  accentTint: "#e3ece8",
  font: '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
} as const;

// 카테고리 색 이름 → (배경, 글자) hex. (Tailwind 100/700 근사값)
const TAG_HEX: Record<string, { bg: string; fg: string }> = {
  stone: { bg: "#e7e5e4", fg: "#57534e" },
  red: { bg: "#fee2e2", fg: "#b91c1c" },
  orange: { bg: "#ffedd5", fg: "#c2410c" },
  amber: { bg: "#fef3c7", fg: "#92400e" },
  yellow: { bg: "#fef9c3", fg: "#854d0e" },
  lime: { bg: "#ecfccb", fg: "#4d7c0f" },
  green: { bg: "#dcfce7", fg: "#15803d" },
  emerald: { bg: "#d1fae5", fg: "#047857" },
  teal: { bg: "#ccfbf1", fg: "#0f766e" },
  cyan: { bg: "#cffafe", fg: "#0e7490" },
  sky: { bg: "#e0f2fe", fg: "#0369a1" },
  blue: { bg: "#dbeafe", fg: "#1d4ed8" },
  indigo: { bg: "#e0e7ff", fg: "#4338ca" },
  violet: { bg: "#ede9fe", fg: "#6d28d9" },
  purple: { bg: "#f3e8ff", fg: "#7e22ce" },
  fuchsia: { bg: "#fae8ff", fg: "#a21caf" },
  pink: { bg: "#fce7f3", fg: "#be185d" },
  rose: { bg: "#ffe1e2", fg: "#be123c" },
};

export function catTag(category: string): { bg: string; fg: string } {
  const canon = CANON_CATEGORY_HEX[category];
  if (canon) return { bg: canon.bg, fg: canon.fg };
  return TAG_HEX[categoryColorName(category)] ?? { bg: SC.accentTint, fg: SC.accent };
}
