// src/lib/coupleAnniversary.ts
// ─────────────────────────────────────────────────────────────
// date.log 내부 데이터(사귄날·생일·과거 추억)로 "오늘의 커플 트리거"를 판정.
// 외부 API 없음. 전부 순수 함수라 테스트 가능.
//
// 확정 UI 팝업 트리거 중 이 파일이 담당하는 것:
//   - N주년        (couples.start_date 기준)
//   - 100일·N00일   (start_date 기준)
//   - 생일 (본인/상대, 다가옴 D-7/3/1 + 당일)  (profiles.birth_date)
//   - 1년 전 오늘   (그날 다녀온 곳/추억이 있으면)
//
// 문구·CTA 데이터는 통합 판정 로직에서 이 결과로 조립한다.
// 날짜는 전부 KST 기준 "YYYY-MM-DD" 문자열 또는 {y,m,d} 로 다룬다.
// ─────────────────────────────────────────────────────────────

// ── 날짜 유틸 (타임존 함정 피하려 문자열/숫자로만 다룸) ────────

export interface YMD {
  y: number;
  m: number; // 1~12
  d: number; // 1~31
}

/** "2025-06-28" → {y:2025, m:6, d:28} */
export function parseYMD(iso: string): YMD {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

/** 두 날짜의 월·일이 같은지 (연도 무시). 기념일/생일 "그날" 판정용. */
export function sameMonthDay(a: YMD, b: YMD): boolean {
  return a.m === b.m && a.d === b.d;
}

/**
 * from(과거) → today 까지 경과 일수. 둘 다 YMD.
 * 100일 계산용. UTC 자정 기준으로 안전하게 뺀다.
 */
export function daysBetween(from: YMD, today: YMD): number {
  const a = Date.UTC(from.y, from.m - 1, from.d);
  const b = Date.UTC(today.y, today.m - 1, today.d);
  return Math.round((b - a) / 86400000);
}

/** today 가 target(월·일) 며칠 전인지. 아직 안 왔으면 양수, 지났으면 음수, 당일 0. */
export function daysUntilAnniversary(target: YMD, today: YMD): number {
  // 올해 target 날짜
  let next = Date.UTC(today.y, target.m - 1, target.d);
  const now = Date.UTC(today.y, today.m - 1, today.d);
  // 이미 지났으면 내년으로 (D-day 는 "다가오는" 것 기준)
  if (next < now) next = Date.UTC(today.y + 1, target.m - 1, target.d);
  return Math.round((next - now) / 86400000);
}

// ── N주년 / 100일 ────────────────────────────────────────────

export interface RelationshipVerdict {
  kind: "anniversary" | "hundred_days";
  /** anniversary: N주년의 N / hundred_days: 며칠(100,200..) */
  n: number;
  /** hundred_days 는 D-1 미리 알림도 지원. true 면 "내일이 N일". */
  isTomorrow?: boolean;
}

/**
 * 사귄날 기준 오늘이 N주년인지 / 100일·N00일(또는 그 전날)인지.
 * start: 사귄날 YMD, today: 오늘 YMD.
 * 여러 개 동시 성립 가능성은 낮지만, 주년을 100일보다 우선해 하나만 반환.
 */
export function relationshipVerdict(
  start: YMD,
  today: YMD,
): RelationshipVerdict | null {
  // N주년: 월·일 같고 최소 1년 지남
  if (sameMonthDay(start, today) && today.y > start.y) {
    return { kind: "anniversary", n: today.y - start.y };
  }

  // 100일 단위: 경과일이 100의 배수이거나, 내일이 100의 배수(D-1 알림)
  const elapsed = daysBetween(start, today) + 1; // 사귄 당일이 1일째
  if (elapsed > 0 && elapsed % 100 === 0) {
    return { kind: "hundred_days", n: elapsed };
  }
  const tomorrowElapsed = elapsed + 1;
  if (tomorrowElapsed > 0 && tomorrowElapsed % 100 === 0) {
    return { kind: "hundred_days", n: tomorrowElapsed, isTomorrow: true };
  }
  return null;
}

// ── 생일 ─────────────────────────────────────────────────────

export type BirthdayWho = "partner" | "self";

export interface BirthdayVerdict {
  who: BirthdayWho;
  /** 당일이면 0, 다가오면 남은 일수(7/3/1 중 하나에서 알림). */
  daysUntil: number;
  /** 상대 이름(who==='partner' 일 때 문구용). */
  partnerName?: string;
}

/** 미리 알림을 띄울 D-day 지점. */
export const BIRTHDAY_REMIND_DAYS = [7, 3, 1];

/**
 * 생일 판정. 상대 생일이 우선(내 생일 당일은 상대 쪽에서 알림이 뜨는 구조).
 * partnerBirth/selfBirth: YMD | null, today: YMD.
 *
 * 반환 규칙(확정 UI):
 *   - 상대 생일 당일/D-7·3·1  → who='partner'
 *   - 본인 생일 당일          → who='self' (미리 알림은 상대 쪽에서)
 * 상대와 본인 중 상대를 먼저 검사(상대 챙기는 게 팝업의 핵심).
 */
export function birthdayVerdict(
  today: YMD,
  partnerBirth: YMD | null,
  selfBirth: YMD | null,
  partnerName?: string,
): BirthdayVerdict | null {
  // 상대 생일: 당일 또는 D-7/3/1
  if (partnerBirth) {
    if (sameMonthDay(partnerBirth, today)) {
      return { who: "partner", daysUntil: 0, partnerName };
    }
    const d = daysUntilAnniversary(partnerBirth, today);
    if (BIRTHDAY_REMIND_DAYS.includes(d)) {
      return { who: "partner", daysUntil: d, partnerName };
    }
  }
  // 본인 생일: 당일만 (미리 알림은 상대에게)
  if (selfBirth && sameMonthDay(selfBirth, today)) {
    return { who: "self", daysUntil: 0 };
  }
  return null;
}

// ── 1년 전 오늘 (그날 다녀온 곳/추억) ─────────────────────────

/** 방문/추억 조회 결과 한 건(팝업 CTA 대상). */
export interface PastVisit {
  placeId: number;
  placeName: string;
  /** 그 방문/추억 날짜 "YYYY-MM-DD" */
  date: string;
  /** 추억 내용(있으면 회고 문구에 활용). */
  memory?: string | null;
}

export interface OnThisDayVerdict {
  /** 몇 년 전인지(1 이상). */
  yearsAgo: number;
  visit: PastVisit;
}

/**
 * "작년 오늘(또는 N년 전 오늘)" 다녀온 곳이 있는지.
 * visits: 커플의 방문/추억 목록(날짜 포함). today: 오늘 YMD.
 * 같은 월·일의 과거 기록 중 가장 오래된(=가장 여러 해 전) 것을 우선.
 * (확정 UI: "1년 전 오늘 → 그 추억" — 여러 해면 더 애틋한 오래된 것)
 */
export function onThisDayVerdict(
  visits: PastVisit[],
  today: YMD,
): OnThisDayVerdict | null {
  const matches = visits
    .map((v) => ({ v, ymd: parseYMD(v.date) }))
    .filter(({ ymd }) => sameMonthDay(ymd, today) && ymd.y < today.y)
    .sort((a, b) => a.ymd.y - b.ymd.y); // 오래된 것 먼저

  if (matches.length === 0) return null;
  const oldest = matches[0];
  return {
    yearsAgo: today.y - oldest.ymd.y,
    visit: oldest.v,
  };
}
