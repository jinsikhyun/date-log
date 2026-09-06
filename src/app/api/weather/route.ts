// src/app/api/weather/route.ts
// ─────────────────────────────────────────────────────────────
// 현재 날씨를 조회해 date.log 날씨 "상태(WeatherState)"로 판정해 돌려준다.
// - OPENWEATHER_API_KEY 는 NEXT_PUBLIC_ 이 아니므로 브라우저 번들에 안 들어간다.
//   (kakao-candidates 라우트와 동일한 서버 전용 키 패턴)
// - 날씨는 자주 바뀌지 않으므로 좌표 기준으로 10분 서버 캐싱 → OpenWeather 호출 절약.
// - 위치 미지정 시 서울 중심 좌표로 폴백(date.log 는 아직 실시간 GPS 없음).
//
// 응답: { state, tempC, feelsLikeC, conditionId, aqi, highC, lowC, precipChance, cachedAt }
//   state 는 문구집 §6-5 상태 키. 문구 선택은 클라이언트/후속 판정 로직이 담당.
//   highC/lowC/precipChance 는 5일 예보(3시간 슬롯) 중 오늘 남은 슬롯 기준 —
//   실측값이 아니라 예보치이며, 예보 호출 실패 시 셋 다 null.
// ─────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import {
  classifyWeather,
  toWeatherInput,
  extractTodayForecast,
  type WeatherState,
  type OpenWeatherCurrent,
  type OpenWeatherAir,
  type OpenWeatherForecast,
  type TodayForecast,
} from "@/lib/weather";

// 서울 시청 좌표 — 위치 미지정 시 폴백.
const SEOUL = { lat: 37.5665, lng: 126.978 };

// 좌표 기준 캐시 TTL(ms). 날씨는 10분이면 충분히 신선하다.
const CACHE_TTL_MS = 10 * 60 * 1000;

const RequestSchema = z.object({
  lat: z.number().finite().min(-90).max(90).optional(),
  lng: z.number().finite().min(-180).max(180).optional(),
});

interface WeatherResult {
  state: WeatherState;
  tempC: number;
  feelsLikeC: number;
  conditionId: number;
  aqi: number | null;
  /** 오늘 남은 시간대(3시간 슬롯) 기준 최고/최저/최대강수확률. 예보 실패 시 전부 null. */
  highC: number | null;
  lowC: number | null;
  precipChance: number | null;
  cachedAt: number;
}

// 오늘(KST) "YYYY-MM-DD". UTC 기준 시각에 +9h 한 뒤 반드시 getUTC* 로만 읽는다 —
// 서버 로컬 타임존이 이미 KST면 로컬 getter가 9시간을 중복 적용해 날짜가 하루
// 밀리는 문제(특일 라우트에서 실측으로 발견된 버그)를 피하기 위함.
function todayKST(): string {
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = nowKst.getUTCFullYear();
  const m = nowKst.getUTCMonth() + 1;
  const d = nowKst.getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// 아주 단순한 인메모리 캐시. kakao rate-limit 와 마찬가지로 서버리스에선
// 인스턴스별이라 best-effort 지만, 날씨 호출 절약 목적엔 충분하다.
const cache = new Map<string, WeatherResult>();

function cacheKey(lat: number, lng: number): string {
  // 소수 2자리(~1km)로 뭉쳐 캐시 적중률을 높인다.
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

async function fetchWeather(lat: number, lng: number, apiKey: string): Promise<WeatherResult> {
  const key = cacheKey(lat, lng);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
    return hit;
  }

  const base = "https://api.openweathermap.org/data/2.5";
  const common = `lat=${lat}&lon=${lng}&appid=${apiKey}`;

  // 현재 날씨(섭씨) + 대기질 + 5일 예보(3시간 단위)를 병렬 호출.
  const [curRes, airRes, forecastRes] = await Promise.all([
    fetch(`${base}/weather?${common}&units=metric`, { cache: "no-store" }),
    fetch(`${base}/air_pollution?${common}`, { cache: "no-store" }),
    fetch(`${base}/forecast?${common}&units=metric`, { cache: "no-store" }),
  ]);

  if (!curRes.ok) {
    // 401(키 미활성/오류)·429(쿼터) 등을 그대로 상위로 던져 라우트가 안내.
    throw new WeatherApiError(curRes.status);
  }

  const current = (await curRes.json()) as OpenWeatherCurrent;
  // 대기질은 실패해도 치명적이지 않다(미세먼지 판정만 빠짐).
  const air = airRes.ok ? ((await airRes.json()) as OpenWeatherAir) : undefined;

  const input = toWeatherInput(current, air, /* isFirstSnowOfSeason */ false);
  if (!input) {
    throw new WeatherApiError(502);
  }

  // 예보도 대기질과 마찬가지로 실패해도 치명적이지 않다(최고/최저/강수확률만 null).
  let todayForecast: TodayForecast = { highC: null, lowC: null, precipChance: null };
  if (forecastRes.ok) {
    try {
      const forecast = (await forecastRes.json()) as OpenWeatherForecast;
      todayForecast = extractTodayForecast(forecast, todayKST());
    } catch {
      // 파싱 실패해도 null 유지 — 위젯은 그 줄만 생략.
    }
  }

  const result: WeatherResult = {
    state: classifyWeather(input),
    tempC: input.temp,
    feelsLikeC: input.feelsLike,
    conditionId: input.conditionId,
    aqi: input.aqi ?? null,
    highC: todayForecast.highC,
    lowC: todayForecast.lowC,
    precipChance: todayForecast.precipChance,
    cachedAt: Date.now(),
  };
  cache.set(key, result);
  return result;
}

class WeatherApiError extends Error {
  constructor(public status: number) {
    super(`OpenWeather responded ${status}`);
  }
}

export async function POST(req: NextRequest) {
  // 로그인 사용자만(비로그인은 전역 미들웨어가 이미 /login 으로 보냄 — 이중 체크).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    console.error("[weather] OPENWEATHER_API_KEY 가 설정되지 않았어요.");
    return NextResponse.json(
      { error: "날씨 기능이 아직 설정되지 않았어요." },
      { status: 500 },
    );
  }

  let rawBody: unknown = {};
  try {
    // body 가 비어도 허용(위치 없으면 서울 폴백).
    const text = await req.text();
    if (text) rawBody = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "위치 정보가 올바르지 않아요." }, { status: 400 });
  }

  const lat = parsed.data.lat ?? SEOUL.lat;
  const lng = parsed.data.lng ?? SEOUL.lng;

  try {
    const result = await fetchWeather(lat, lng, apiKey);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof WeatherApiError) {
      // 401 은 키 활성화 지연일 수 있어 별도 안내.
      if (err.status === 401) {
        console.error("[weather] OpenWeather 401 — 키가 아직 활성화 안 됐거나 잘못됨.");
        return NextResponse.json(
          { error: "날씨 서비스 인증에 문제가 있어요. 잠시 후 다시 시도해 주세요." },
          { status: 502 },
        );
      }
      console.error(`[weather] OpenWeather ${err.status}`);
      return NextResponse.json(
        { error: "날씨 정보를 가져오지 못했어요. 잠시 후 다시 시도해 주세요." },
        { status: 502 },
      );
    }
    console.error("[weather] 예기치 못한 오류:", err);
    return NextResponse.json(
      { error: "날씨 정보를 가져오지 못했어요." },
      { status: 500 },
    );
  }
}
