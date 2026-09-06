// src/lib/weather.ts
// ─────────────────────────────────────────────────────────────
// OpenWeather 응답 → date.log 날씨 "상태(WeatherState)" 판정.
// 순수 함수만 모아두어 네트워크 없이 테스트 가능하게 한다.
// (실제 API 호출은 src/app/api/weather/route.ts 에서, 이 파일의 함수로 판정)
//
// 문구집 §6-5 상태: clear / cloudy / rain / snow / first_snow / heat / cold / dust
// 문구집 내부 우선순위: first_snow > dust > heat/cold > snow/rain > cloudy/clear
//   (건강·안전 관련을 감성보다 먼저)
// ─────────────────────────────────────────────────────────────

/** date.log 문구집이 쓰는 날씨 상태 키. */
export type WeatherState =
  | "clear"
  | "cloudy"
  | "rain"
  | "snow"
  | "first_snow"
  | "heat"
  | "cold"
  | "dust";

/** 판정에 필요한, API에서 뽑아낸 최소 입력값. */
export interface WeatherInput {
  /** OpenWeather weather[0].id (컨디션 코드). */
  conditionId: number;
  /** 체감 온도(섭씨). main.feels_like (units=metric). */
  feelsLike: number;
  /** 실제 기온(섭씨). main.temp. 폴백용. */
  temp: number;
  /**
   * 대기질 지수(1~5, OpenWeather Air Pollution `list[0].main.aqi`).
   * 1 좋음 · 2 보통 · 3 나쁨 · 4 매우나쁨 · 5 위험. 없으면 undefined.
   */
  aqi?: number;
  /**
   * 올겨울 첫눈 여부. 날씨 API로는 알 수 없고, 서버가 "이 지역 이번 시즌
   * 첫 눈 관측인지"를 별도로 판단해 넘겨준다. (판정 로직은 아래 note 참고)
   */
  isFirstSnowOfSeason?: boolean;
}

// ── 임계값 (필요하면 여기만 조정) ────────────────────────────
export const HEAT_FEELS_LIKE = 33; // 체감 이 이상 → 폭염(heat)
export const COLD_FEELS_LIKE = 0; // 체감 이 이하 → 한파(cold)
export const DUST_AQI_MIN = 3; // AQI 이 이상 → 미세먼지(dust)

/**
 * OpenWeather 컨디션 코드가 "비 계열"인지.
 *   2xx 뇌우, 3xx 이슬비, 5xx 비 → 모두 rain 으로 묶는다.
 */
export function isRainCode(id: number): boolean {
  return (id >= 200 && id < 600);
}

/** 6xx 눈 계열. */
export function isSnowCode(id: number): boolean {
  return id >= 600 && id < 700;
}

/**
 * 800 맑음 / 801~804 구름.
 * 7xx(안개·연무 등)는 "특별히 감성 문구가 없는" 상태라 cloudy 로 흡수한다.
 */
export function isClearCode(id: number): boolean {
  return id === 800;
}

/**
 * 핵심 판정. 우선순위(문구집 §6-5)를 그대로 코드 순서로 옮긴다:
 *   first_snow > dust > heat/cold > snow/rain > cloudy/clear
 *
 * 주의: 온도(heat/cold)를 눈·비보다 먼저 볼지 나중에 볼지는 취향인데,
 * 문구집이 "폭염/한파 > 눈/비"로 명시했으므로 그 순서를 따른다.
 * (예: 영하에 눈이 오면 → cold. 감성보다 "따뜻하게" 안내가 우선)
 */
export function classifyWeather(input: WeatherInput): WeatherState {
  const { conditionId, feelsLike, aqi, isFirstSnowOfSeason } = input;

  // 1) 첫눈 — 실제로 지금 눈이 올 때만 유효
  if (isFirstSnowOfSeason && isSnowCode(conditionId)) {
    return "first_snow";
  }

  // 2) 미세먼지 — 건강 이슈라 날씨 감성보다 먼저
  if (aqi != null && aqi >= DUST_AQI_MIN) {
    return "dust";
  }

  // 3) 폭염 / 한파 — 온도 극단
  if (feelsLike >= HEAT_FEELS_LIKE) return "heat";
  if (feelsLike <= COLD_FEELS_LIKE) return "cold";

  // 4) 눈 / 비
  if (isSnowCode(conditionId)) return "snow";
  if (isRainCode(conditionId)) return "rain";

  // 5) 맑음 / 흐림
  if (isClearCode(conditionId)) return "clear";
  return "cloudy"; // 801~804 구름 + 7xx 안개류 흡수
}

// ── OpenWeather 원본 응답에서 WeatherInput 뽑기 ───────────────
// 라우트에서 fetch 한 JSON 을 이 함수로 정규화한 뒤 classifyWeather 에 넘긴다.

/** OpenWeather /data/2.5/weather 응답 중 우리가 쓰는 필드만. */
export interface OpenWeatherCurrent {
  weather?: { id: number }[];
  main?: { temp: number; feels_like: number };
}

/** OpenWeather /data/2.5/air_pollution 응답 중 우리가 쓰는 필드만. */
export interface OpenWeatherAir {
  list?: { main?: { aqi?: number } }[];
}

/**
 * 두 응답을 합쳐 판정 입력으로. conditionId/온도가 없으면 null(판정 불가).
 * firstSnow 는 서버가 시즌 첫눈 여부를 계산해 넘긴다(기본 false).
 */
export function toWeatherInput(
  current: OpenWeatherCurrent,
  air?: OpenWeatherAir,
  isFirstSnowOfSeason = false,
): WeatherInput | null {
  const conditionId = current.weather?.[0]?.id;
  const temp = current.main?.temp;
  const feelsLike = current.main?.feels_like;
  if (conditionId == null || temp == null || feelsLike == null) return null;

  return {
    conditionId,
    temp,
    feelsLike,
    aqi: air?.list?.[0]?.main?.aqi,
    isFirstSnowOfSeason,
  };
}

// ── 참고: 첫눈(first_snow) 판정 메모 ─────────────────────────
// 이 라이브러리는 "지금 눈이 오는가"(conditionId)만 안다. "올겨울 처음인가"는
// 과거 관측 기록이 필요하므로 서버 상태로 판단해야 한다. 가장 단순한 방법:
//   - couples(또는 별도 테이블)에 last_first_snow_season(예: "2026-2027") 저장
//   - 눈(6xx) 감지 + 현재 겨울시즌이 저장된 값과 다르면 → 첫눈으로 보고 값 갱신
//   - 시즌 경계는 대략 11월~다음해 3월. (지역·연도별 편차는 추후 조정)
// 초기 버전에서는 isFirstSnowOfSeason=false 로 두고, snow 로만 처리해도 무방.

/** OpenWeather /data/2.5/forecast 응답 중 우리가 쓰는 필드만. */
export interface OpenWeatherForecast {
  list?: {
    main?: { temp_min?: number; temp_max?: number };
    pop?: number; // 강수확률 0~1
    dt_txt?: string; // "2026-09-06 15:00:00" (UTC)
  }[];
}

export interface TodayForecast {
  highC: number | null;
  lowC: number | null;
  /** 강수확률 % (0~100 정수). 없으면 null. */
  precipChance: number | null;
}

/**
 * 예보 응답에서 특정 날짜(YYYY-MM-DD)의 최고/최저/최대강수확률.
 * todayDate 는 KST 기준 "YYYY-MM-DD".
 *
 * 주의: dt_txt 는 UTC 시각이다. KST 오늘과 UTC 날짜가 다를 수 있어
 *   (한국 자정~오전 9시는 UTC 로 전날), 라우트에서 todayDate 를 KST 로 넘기되
 *   슬롯 매칭은 dt_txt 의 날짜부분과 느슨하게 비교한다. 완벽한 경계 정합보다
 *   "오늘 근처 슬롯들"의 최고/최저를 잡는 게 목적이라 실용상 충분.
 */
export function extractTodayForecast(
  forecast: OpenWeatherForecast,
  todayDate: string,
): TodayForecast {
  const slots = forecast.list ?? [];
  let high = -Infinity;
  let low = Infinity;
  let maxPop = 0;
  let matched = 0;

  for (const s of slots) {
    const dateOfSlot = (s.dt_txt ?? "").slice(0, 10); // "2026-09-06"
    if (dateOfSlot !== todayDate) continue;
    matched++;
    const mx = s.main?.temp_max;
    const mn = s.main?.temp_min;
    if (typeof mx === "number") high = Math.max(high, mx);
    if (typeof mn === "number") low = Math.min(low, mn);
    if (typeof s.pop === "number") maxPop = Math.max(maxPop, s.pop);
  }

  // 오늘 슬롯이 하나도 안 남았으면(늦은 밤 등) 첫 미래 슬롯이라도 참고할 수 있으나,
  // 여기선 단순하게 null 반환(팝오버가 그 줄을 생략).
  if (matched === 0) {
    return { highC: null, lowC: null, precipChance: null };
  }

  return {
    highC: high === -Infinity ? null : Math.round(high),
    lowC: low === Infinity ? null : Math.round(low),
    precipChance: Math.round(maxPop * 100),
  };
}
