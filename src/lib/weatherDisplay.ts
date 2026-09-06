// src/lib/weatherDisplay.ts
// ─────────────────────────────────────────────────────────────
// 날씨 "상태(WeatherState)"를 화면 표시용으로 바꾸는 헬퍼 모음.
// 확정 UI 기준:
//   - 홈 위젯: "오늘 서울 · 맑음 22°" + 감성 한 줄
//   - 추억 각인 배지: 날짜 옆 작게 "☂ 비 · 19°"
//   - 회고 문구: "그날도 비가 왔었어요"
//   - 날씨별 추억 필터: 넣지 않기로 확정 → 필터 라벨 없음
//
// weather.ts 의 WeatherState 를 재사용한다.
// ─────────────────────────────────────────────────────────────

import type { WeatherState } from "@/lib/weather";

/** 상태별 이모지 아이콘. 추억 배지·위젯에 공통 사용. */
export const WEATHER_ICON: Record<WeatherState, string> = {
  clear: "☀️",
  cloudy: "☁️",
  rain: "🌧️",
  snow: "❄️",
  first_snow: "❄️",
  heat: "🥵",
  cold: "🥶",
  dust: "😷",
};

/** 상태별 짧은 한글 라벨. 배지·위젯 텍스트. */
export const WEATHER_LABEL: Record<WeatherState, string> = {
  clear: "맑음",
  cloudy: "흐림",
  rain: "비",
  snow: "눈",
  first_snow: "첫눈",
  heat: "폭염",
  cold: "한파",
  dust: "미세먼지",
};

// ── 과거 추억용 수동 선택 상태 ────────────────────────────────
// 확정 UI: 과거 날짜는 날씨를 자동 추정하지 않고, 사용자가 직접 고른다.
// 고를 수 있는 건 맑음·흐림·비·눈 4개만 (폭염/한파/미세먼지/첫눈은 자동 판정
// 영역이라 수동 선택지에서 제외). 과거 기온은 확인 불가라 저장하지 않는다.
export const PAST_WEATHER_OPTIONS: WeatherState[] = [
  "clear",
  "cloudy",
  "rain",
  "snow",
];

/** 과거 수동 선택 UI에 쓸 {상태, 아이콘, 라벨} 목록. */
export function pastWeatherChoices(): {
  state: WeatherState;
  icon: string;
  label: string;
}[] {
  return PAST_WEATHER_OPTIONS.map((state) => ({
    state,
    icon: WEATHER_ICON[state],
    label: WEATHER_LABEL[state],
  }));
}

/**
 * 추억 카드용 날짜 옆 배지. 확정 UI 예: "☂ 비 · 19°"
 * - temp 가 있으면(오늘 각인) "아이콘 라벨 · 19°"
 * - temp 가 없으면(과거 수동 선택) "아이콘 라벨"
 * - state 가 없으면 null(배지 안 그림)
 */
export function weatherBadge(
  state: WeatherState | null | undefined,
  temp: number | null | undefined,
): string | null {
  if (!state) return null;
  const base = `${WEATHER_ICON[state]} ${WEATHER_LABEL[state]}`;
  if (temp == null) return base;
  return `${base} · ${Math.round(temp)}°`;
}

/**
 * 홈 위젯 한 줄. 예: "오늘 서울 · 맑음 22°"
 * 위치명은 호출부에서 넘긴다(기본 "서울").
 */
export function weatherOneLiner(
  state: WeatherState,
  temp: number,
  place = "서울",
): string {
  return `오늘 ${place} · ${WEATHER_LABEL[state]} ${Math.round(temp)}°`;
}

/**
 * 회고("작년 이맘때") 문구 조각. 확정 UI 예: "그날도 비가 왔었어요"
 * 회고 배너가 이 문장을 감성 문구로 덧붙인다. state 없으면 null.
 * (온도는 회고 문구에 쓰지 않음 — 상태만으로 정서 전달)
 */
export const WEATHER_RECALL_PHRASE: Record<WeatherState, string> = {
  clear: "그날도 하늘이 맑았어요",
  cloudy: "그날은 하늘이 흐렸었죠",
  rain: "그날도 비가 왔었어요",
  snow: "그날은 눈이 내렸어요",
  first_snow: "그날, 첫눈이 왔었죠",
  heat: "그날도 참 더웠어요",
  cold: "그날은 무척 추웠죠",
  dust: "그날은 하늘이 뿌옜어요",
};

export function weatherRecallPhrase(
  state: WeatherState | null | undefined,
): string | null {
  if (!state) return null;
  return WEATHER_RECALL_PHRASE[state] ?? null;
}

// ── 추억 저장 payload ─────────────────────────────────────────
// 확정 UI: 오늘 기록은 자동 제안된 날씨(state+temp, 수정 가능),
//          과거 기록은 수동 선택(state만, temp 없음).

/** 추억에 저장할 날씨 필드. */
export interface MemoryWeatherFields {
  weather_state: WeatherState | null;
  weather_temp: number | null;
}

/**
 * 오늘 추억 각인용. /api/weather 응답을 저장 형태로.
 * enabled=false(사용자가 각인 끔)면 둘 다 null.
 * 사용자가 자동 제안된 state 를 수정했으면 overrideState 로 덮어쓴다.
 */
export function todayWeatherFields(
  weather: { state: WeatherState; tempC: number } | null,
  enabled: boolean,
  overrideState?: WeatherState | null,
): MemoryWeatherFields {
  if (!enabled || !weather) {
    return { weather_state: null, weather_temp: null };
  }
  return {
    weather_state: overrideState ?? weather.state,
    weather_temp: Math.round(weather.tempC),
  };
}

/**
 * 과거 추억 각인용. 사용자가 4개 중 직접 고른 상태만 저장, 기온은 항상 null.
 * (확정 UI: "확인되지 않은 과거 기온은 저장하지 않는다")
 * 안 골랐으면(null) 둘 다 null.
 */
export function pastWeatherFields(
  chosen: WeatherState | null,
): MemoryWeatherFields {
  // 과거 선택지는 4개로 제한 — 그 밖의 값이 들어오면 무시(방어).
  if (!chosen || !PAST_WEATHER_OPTIONS.includes(chosen)) {
    return { weather_state: null, weather_temp: null };
  }
  return { weather_state: chosen, weather_temp: null };
}

/**
 * 홈 위젯 접힌 버튼용 짧은 맥락 문구. 팝오버의 긴 문구와는 별개(그쪽은 그대로 둔다).
 * 사용자 결정: 접힌 상태 "아이콘+기온만" 원칙을 의도적으로 완화 — HANDOFF.md 참고.
 */
export const WEATHER_SHORT_NOTE: Record<WeatherState, string> = {
  clear: "걷기 좋은 날",
  cloudy: "차분한 날",
  rain: "실내가 좋은 날",
  snow: "남기고 싶은 날",
  first_snow: "첫눈 오는 날",
  heat: "너무 더워요",
  cold: "너무 추워요",
  dust: "실내가 좋은 날",
};
