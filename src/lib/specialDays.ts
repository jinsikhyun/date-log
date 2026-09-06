// src/lib/specialDays.ts
// ─────────────────────────────────────────────────────────────
// 한국천문연구원 특일 정보 API 응답을 date.log 팝업 트리거로 변환.
// - get24DivisionsInfo (24절기) → date.log 확정 9개 절기만 필터
// - getRestDeInfo (공휴일) → 연휴 패턴(긴연휴/하루/연휴끝/명절당일) 판정
//
// 네트워크·XML fetch 는 라우트에서 하고, 이 파일은 "파싱된 항목 → 판정"만 담당해
// 테스트 가능하게 둔다. (날씨의 weather.ts 와 같은 구조)
//
// 확정 UI: 날씨는 팝업에서 제외. 팝업 트리거는 절기·공휴일·기념일·생일·1년전오늘.
//          이 파일은 그중 "절기 + 공휴일" 담당.
// ─────────────────────────────────────────────────────────────

// ── date.log 확정 절기 9개 ────────────────────────────────────
// 문구집 §6-1. API 가 주는 24개 중 이 9개만 팝업으로 쓴다.
export const DATELOG_SOLAR_TERMS = [
  "입춘",
  "춘분",
  "청명",
  "하지",
  "대서",
  "처서",
  "입동",
  "대설",
  "동지",
] as const;

export type DatelogSolarTerm = (typeof DATELOG_SOLAR_TERMS)[number];

/** API item 한 건(파싱 후). dateKind: 01국경일 02기념일 03절기 04잡절. */
export interface SpecialDayItem {
  dateKind: string;
  dateName: string;
  isHoliday: "Y" | "N" | string;
  /** YYYYMMDD 숫자. 예: 20261222 */
  locdate: number;
}

// ── locdate 유틸 ─────────────────────────────────────────────

/** 20261222 → "2026-12-22" */
export function locdateToISO(locdate: number): string {
  const s = String(locdate);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** Date → 20261222 (KST 기준은 호출부에서 맞춰 넘길 것) */
export function toLocdate(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// ── 절기 판정 ────────────────────────────────────────────────

/** 우리가 쓰는 9개 절기인지. */
export function isDatelogTerm(name: string): name is DatelogSolarTerm {
  return (DATELOG_SOLAR_TERMS as readonly string[]).includes(name);
}

/**
 * 24절기 응답에서 "오늘이 우리 9개 절기 중 하나인가" 판정.
 * 맞으면 절기명, 아니면 null.
 */
export function solarTermToday(
  items: SpecialDayItem[],
  todayLocdate: number,
): DatelogSolarTerm | null {
  for (const it of items) {
    if (it.locdate === todayLocdate && it.dateKind === "03" && isDatelogTerm(it.dateName)) {
      return it.dateName;
    }
  }
  return null;
}

// ── 공휴일 / 연휴 판정 ───────────────────────────────────────

export type HolidayPatternKey =
  | "long_weekend" // 연속 3일 이상 연휴 (시작 전날/첫날)
  | "single_holiday" // 앞뒤 안 이어지는 하루
  | "last_day_of_break" // 연휴 마지막 날
  | "major_festival_day"; // 설날·추석 당일

export interface HolidayVerdict {
  pattern: HolidayPatternKey;
  /** 연휴 총 일수(하루면 1). */
  streak: number;
  /** 그날 명칭(설날/추석/공휴일명 등). */
  name: string;
}

/** 설날·추석 당일 여부(대체·연휴 아닌 "당일"). */
function isMajorFestival(name: string): boolean {
  return name.includes("설날") || name.includes("추석");
}

/**
 * "쉬는 날" 집합을 받아, 특정 날짜가 어떤 연휴 패턴인지 판정.
 * holidays: isHoliday==='Y' 인 날들의 locdate Set (여러 달치를 미리 모아둔 것).
 * names:    locdate → 명칭 맵 (설날/추석 판정용).
 * target:   판정할 날짜 locdate.
 *
 * 반환 null = 그날은 공휴일이 아니거나 트리거 대상 아님.
 *
 * 주의: 팝업은 "오늘" 기준으로 부른다. 연휴 "시작 전날"에 미리 알리는 로직은
 * 라우트/판정에서 target 을 내일로 넣어 호출하는 식으로 확장 가능(여기선 당일 기준).
 */
export function holidayVerdict(
  holidays: Set<number>,
  names: Map<number, string>,
  target: number,
): HolidayVerdict | null {
  if (!holidays.has(target)) return null;

  const name = names.get(target) ?? "공휴일";

  // 설날·추석 당일은 별도 (데이트 강권 안 하는 배려 문구)
  if (isMajorFestival(name)) {
    return { pattern: "major_festival_day", streak: countStreak(holidays, target).total, name };
  }

  const { total, before, after } = countStreak(holidays, target);

  if (total >= 3) {
    // 연휴 마지막 날인지(뒤로 안 이어짐) 먼저 체크
    if (after === 0) return { pattern: "last_day_of_break", streak: total, name };
    return { pattern: "long_weekend", streak: total, name };
  }

  // 1~2일짜리는 "하루 공휴일"로 취급 (before/after 로 더 쪼갤 수도 있으나 단순화)
  return { pattern: "single_holiday", streak: total, name };
}

/**
 * target 을 포함한 연속 휴일 길이 계산.
 * total: 연속 총일수, before: target 앞 연속일, after: target 뒤 연속일.
 */
export function countStreak(
  holidays: Set<number>,
  target: number,
): { total: number; before: number; after: number } {
  let before = 0;
  let after = 0;

  // 앞으로(과거) 이어지는 휴일
  let cur = prevDay(target);
  while (holidays.has(cur)) {
    before++;
    cur = prevDay(cur);
  }
  // 뒤로(미래) 이어지는 휴일
  cur = nextDay(target);
  while (holidays.has(cur)) {
    after++;
    cur = nextDay(cur);
  }
  return { total: before + after + 1, before, after };
}

// ── locdate 날짜 증감 (달·해 경계 처리) ──────────────────────
// Set 조회용이라 Date 객체로 변환해 하루 증감 후 다시 locdate 로.

export function prevDay(locdate: number): number {
  return shiftDay(locdate, -1);
}
export function nextDay(locdate: number): number {
  return shiftDay(locdate, 1);
}
function shiftDay(locdate: number, delta: number): number {
  const s = String(locdate);
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return toLocdate(dt);
}
