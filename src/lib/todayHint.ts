// src/lib/todayHint.ts
// ─────────────────────────────────────────────────────────────
// "오늘 데이트 힌트 팝업에 뭘 띄울지" 통합 판정.
// 확정 UI(CLAUDE_DATE_HINT_WEATHER_IMPLEMENTATION.md) 기준:
//   - 날씨는 팝업에서 제외 (홈 위젯·추억 각인에만 사용)
//   - 우선순위: 커플기념일·생일 > 공휴일·문화기념일 > 절기
//   - 여러 개 겹쳐도 하나만
//   - 팝업 대상 없으면 null (평일엔 팝업 안 뜸)
//
// 설계 원칙: 기존 시스템을 재사용한다.
//   - 생일·N주년·100일·첫기록  → 기존 src/lib/anniversaries.ts 의 Anniversary[]
//   - 절기·공휴일               → /api/special-days (specialDays.ts)
//   - 1년 전 오늘               → 과거 방문/추억 (호출부가 조회해 넘김)
//   - 문화기념일(크리스마스 등)  → 이 파일의 상수
//
// 이 파일은 "판정"만 담당(순수 함수). DB/HTTP 조회는 호출부(훅/라우트)가 하고,
// 그 결과를 입력으로 넘긴다. 그래야 테스트 가능하고 기존 useAnniversaries 와 안 겹침.
// ─────────────────────────────────────────────────────────────

import type { Anniversary } from "@/lib/anniversaries";

// ── 팝업 트리거 타입 ─────────────────────────────────────────

export type HintType =
  | "birthday" // 생일 (당일 또는 D-7/3/1)
  | "anniversary" // N주년
  | "hundred" // 100일·N00일
  | "first_record" // 첫 기록 주년
  | "culture" // 문화기념일 (크리스마스 등)
  | "holiday" // 공휴일·연휴
  | "solar_term" // 절기
  | "on_this_day"; // 1년 전 오늘

export type CtaKind = "recall" | "fallback";

/** 팝업이 받을 최종 형태 (확정 UI 3-1: eyebrow→제목→문장→메타→CTA 하나). */
export interface TodayHint {
  type: HintType;
  eyebrow: string;
  title: string;
  message: string;
  meta?: string;
  cta: { label: string; href: string; kind: CtaKind };
}

// ── 판정 입력 (호출부가 조회해서 채워 넘김) ───────────────────

export interface HintInput {
  /** 오늘 "YYYY-MM-DD" (KST). */
  today: string;
  /** 기존 useAnniversaries 로 만든 그 해 기념일들. */
  anniversaries: Anniversary[];
  /** 다가오는 생일들(당일 제외, D-7/3/1 알림용). {name, date:"YYYY-MM-DD"} */
  upcomingBirthdays?: { name: string; date: string; daysUntil: number }[];
  /** /api/special-days 응답. */
  special?: {
    solarTerm: string | null;
    holiday: { pattern: string; streak: number; name: string } | null;
  } | null;
  /** 1년 전 오늘(또는 N년 전) 방문/추억. 없으면 null. */
  onThisDay?: {
    yearsAgo: number;
    placeId: number;
    placeName: string;
    memory?: string | null;
  } | null;
  /**
   * 과거 같은 기념일/문화기념일에 다녀온 기록이 있는지(회고 CTA vs fallback 판단용).
   * key=HintType, value=그 기념일 관련 방문이 존재하면 true.
   * 없으면 fallback CTA 로.
   */
  hasPastVisitFor?: Partial<Record<HintType, boolean>>;
}

// ── 문화기념일 상수 (자체 관리, 날짜 고정) ────────────────────
// 천문연 API 엔 없는 커플 문화기념일. "MM-DD" → 정의.

interface CultureDay {
  key: string;
  name: string;
  eyebrow: string;
  title: string;
  message: string;
}

export const CULTURE_DAYS: Record<string, CultureDay> = {
  "02-14": {
    key: "valentine",
    name: "발렌타인데이",
    eyebrow: "오늘은",
    title: "발렌타인데이예요",
    message: "달콤한 하루예요. 오늘은 서로에게 조금 더 다정해도 좋겠어요.",
  },
  "03-14": {
    key: "white_day",
    name: "화이트데이",
    eyebrow: "오늘은",
    title: "화이트데이예요",
    message: "지난번 받은 마음, 오늘 어떻게 돌려줄까요?",
  },
  "12-24": {
    key: "christmas_eve",
    name: "크리스마스이브",
    eyebrow: "오늘은",
    title: "크리스마스이브예요",
    message: "일 년에 하루뿐인 오늘 밤, 특별하게 보내요.",
  },
  "12-25": {
    key: "christmas",
    name: "크리스마스",
    eyebrow: "메리 크리스마스",
    title: "크리스마스예요",
    message: "대단한 게 없어도, 곁에 있는 것만으로 충분한 날이에요.",
  },
  "12-31": {
    key: "new_years_eve",
    name: "연말",
    eyebrow: "올해의 마지막 날",
    title: "한 해가 저물어가요",
    message: "함께 걸어온 일 년을 천천히 돌아봐요.",
  },
  "01-01": {
    key: "new_years_day",
    name: "새해",
    eyebrow: "새해가 밝았어요",
    title: "새로운 한 해예요",
    message: "올해 둘이 함께 가고 싶은 곳, 하나씩 그려볼까요?",
  },
};

// ── 절기 문구 (문구집 §6-1) ──────────────────────────────────

export const SOLAR_TERM_MESSAGES: Record<string, { title: string; message: string }> = {
  입춘: { title: "입춘이에요", message: "아직 공기는 차지만, 오늘부터 봄이래요. 겨우내 미뤄둔 그 산책, 나가볼까요?" },
  춘분: { title: "춘분이에요", message: "낮과 밤이 같아지는 날. 해가 길어지니 저녁 데이트도 여유롭겠어요." },
  청명: { title: "청명이에요", message: "하늘이 가장 맑은 때. 이런 날 꽃을 안 보면 아쉽잖아요." },
  하지: { title: "하지예요", message: "일 년 중 해가 가장 긴 날. 늦게까지 함께 걸어요." },
  대서: { title: "대서예요", message: "일 년 중 가장 덥다는 날. 오늘은 시원한 데로 숨어버릴까요?" },
  처서: { title: "처서예요", message: "더위도 이맘때면 슬슬 꺾여요. 저녁 바람이 달라진 거, 느껴져요?" },
  입동: { title: "입동이에요", message: "겨울의 시작. 쌀쌀해진 만큼 아늑한 곳이 좋겠어요." },
  대설: { title: "대설이에요", message: "눈이 많이 내린다는 때. 눈 오면 꼭 사진 남겨요." },
  동지: { title: "동지예요", message: "밤이 가장 긴 날. 따뜻한 팥죽 한 그릇 하러 갈까요?" },
};

// ── 공휴일 문구 (문구집 §6-2) ────────────────────────────────

const HOLIDAY_MESSAGES: Record<string, { title: string; message: string }> = {
  long_weekend: { title: "연휴예요", message: "이번엔 며칠 쉬어요. 이런 날은 흔치 않으니까, 조금 멀리 떠나봐도 좋겠어요." },
  single_holiday: { title: "쉬는 날이에요", message: "평일이라 늘 미뤄뒀던 그곳, 오늘 갈 수 있겠어요." },
  last_day_of_break: { title: "연휴의 끝이에요", message: "아쉬운 만큼, 마지막 하루는 가까운 데서 느긋하게 채워요." },
  major_festival_day: { title: "명절이에요", message: "오늘은 각자의 가족 곁에서. 우리 시간은 남은 연휴에 따로 만들어요." },
};

// ── MM-DD 추출 ───────────────────────────────────────────────
function monthDay(iso: string): string {
  return iso.slice(5); // "2026-12-25" → "12-25"
}

// ── CTA 조립 ─────────────────────────────────────────────────
// 확정 UI 3-3: 과거 기록 있으면 회고형, 없으면 fallback.

function recallOrFallback(
  type: HintType,
  input: HintInput,
  recall: { label: string; href: string },
  fallback: { label: string; href: string } = {
    label: "함께 갈 곳 찾아보기",
    href: "/wishlist",
  },
): { label: string; href: string; kind: CtaKind } {
  const has = input.hasPastVisitFor?.[type];
  return has
    ? { ...recall, kind: "recall" }
    : { ...fallback, kind: "fallback" };
}

// ── 핵심: 오늘의 힌트 하나 판정 ───────────────────────────────

/**
 * 우선순위대로 검사해 가장 먼저 걸리는 하나를 반환. 없으면 null.
 * 우선순위(확정 UI 3-2): 커플기념일·생일 > 공휴일·문화기념일 > 절기.
 * (1년 전 오늘은 "기념일 없을 때 잔잔하게" — 문화/공휴일보다 뒤, 절기와 비슷한 급)
 */
export function decideTodayHint(input: HintInput): TodayHint | null {
  const { today, anniversaries } = input;
  const mmdd = monthDay(today);

  // 오늘 걸린 기존 기념일들 (생일 당일·주년·100일·첫기록)
  const todays = anniversaries.filter((a) => a.date === today);

  // ── 1순위: 커플 기념일 / 생일 ──
  // 1-a) 생일 당일
  const bday = todays.find((a) => a.kind === "birthday");
  if (bday) {
    return {
      type: "birthday",
      eyebrow: "오늘은",
      title: bday.label, // "지민의 생일"
      message: `오늘은 ${bday.label}이에요. 오늘만큼은 그 사람이 좋아하는 곳으로.`,
      cta: recallOrFallback("birthday", input, {
        label: "지난 생일 돌아보기",
        href: "/recap",
      }),
    };
  }
  // 1-b) N주년
  const anniv = todays.find((a) => a.kind === "anniversary");
  if (anniv) {
    return {
      type: "anniversary",
      eyebrow: "오늘은",
      title: anniv.label, // "우리의 1주년"
      message: `${anniv.label}이에요. 처음 함께한 그곳, 다시 가볼까요?`,
      cta: recallOrFallback("anniversary", input, {
        label: "우리의 기록 돌아보기",
        href: "/recap",
      }),
    };
  }
  // 1-c) 100일
  const hundred = todays.find((a) => a.kind === "hundred");
  if (hundred) {
    return {
      type: "hundred",
      eyebrow: "오늘은",
      title: hundred.label, // "함께한 지 100일"
      message: `${hundred.label}이에요. 특별한 곳에 오늘을 남겨둘까요?`,
      cta: { label: "오늘 기록하기", href: "/", kind: "fallback" },
    };
  }
  // 1-d) 첫 기록 주년
  const firstRec = todays.find((a) => a.kind === "first-record");
  if (firstRec) {
    return {
      type: "first_record",
      eyebrow: "오늘은",
      title: firstRec.label,
      message: `${firstRec.label}이에요. 그때 그 첫 기록, 다시 꺼내볼까요?`,
      cta: recallOrFallback("first_record", input, {
        label: "첫 기록 보러 가기",
        href: "/recap",
      }),
    };
  }
  // 1-e) 다가오는 생일 (D-7/3/1)
  const upBday = input.upcomingBirthdays?.find((b) => [7, 3, 1].includes(b.daysUntil));
  if (upBday) {
    return {
      type: "birthday",
      eyebrow: "곧 다가와요",
      title: `${upBday.name}의 생일`,
      message: `${upBday.daysUntil}일 뒤면 ${upBday.name}의 생일이에요. 특별한 곳, 미리 찾아둘까요?`,
      meta: `D-${upBday.daysUntil}`,
      cta: { label: "함께 갈 곳 찾아보기", href: "/wishlist", kind: "fallback" },
    };
  }

  // ── 2순위: 문화기념일 / 공휴일 ──
  // 2-a) 문화기념일 (상수)
  const culture = CULTURE_DAYS[mmdd];
  if (culture) {
    return {
      type: "culture",
      eyebrow: culture.eyebrow,
      title: culture.title,
      message: culture.message,
      cta: recallOrFallback("culture", input, {
        label: `지난 ${culture.name} 돌아보기`,
        href: "/recap",
      }),
    };
  }
  // 2-b) 공휴일
  const holiday = input.special?.holiday;
  if (holiday) {
    const msg = HOLIDAY_MESSAGES[holiday.pattern] ?? HOLIDAY_MESSAGES.single_holiday;
    return {
      type: "holiday",
      eyebrow: "오늘은",
      title: msg.title,
      message: msg.message,
      meta: holiday.name,
      cta: { label: "함께 갈 곳 찾아보기", href: "/wishlist", kind: "fallback" },
    };
  }

  // ── 3순위: 절기 ──
  const term = input.special?.solarTerm;
  if (term && SOLAR_TERM_MESSAGES[term]) {
    const t = SOLAR_TERM_MESSAGES[term];
    return {
      type: "solar_term",
      eyebrow: "절기",
      title: t.title,
      message: t.message,
      cta: { label: "함께 갈 곳 찾아보기", href: "/wishlist", kind: "fallback" },
    };
  }

  // ── 4순위: 1년 전 오늘 (잔잔한 회고) ──
  const otd = input.onThisDay;
  if (otd) {
    return {
      type: "on_this_day",
      eyebrow: `${otd.yearsAgo}년 전 오늘`,
      title: `그날, ${otd.placeName}에 있었어요`,
      message: otd.memory?.trim()
        ? `"${otd.memory.trim()}" — 그날의 기록이 남아있어요.`
        : "그날의 기록이 남아있어요. 다시 꺼내볼까요?",
      cta: { label: "그날 보러 가기", href: `/places/${otd.placeId}`, kind: "recall" },
    };
  }

  // 아무것도 안 걸림 → 팝업 없음
  return null;
}
