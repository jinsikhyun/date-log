// src/hooks/useHomeWeather.ts
// ─────────────────────────────────────────────────────────────
// 홈 날씨 위젯(HomeWeatherWidget)용 데이터 훅.
// date.log_백엔드연결_계약서.md §2 그대로: 마운트 시 1회 POST /api/weather,
// 서버가 10분 캐싱하므로 여기서 추가로 매 렌더 호출하지 않는다.
// 실패(로그인 전/API 오류)하면 위젯을 숨길 수 있도록 weather=null 을 유지한다.
// ─────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import type { WeatherState } from "@/lib/weather";

export interface HomeWeather {
  state: WeatherState;
  tempC: number;
  feelsLikeC: number;
  /** 오늘 남은 시간대 기준 예보치. 예보 실패 시 셋 다 null. */
  highC: number | null;
  lowC: number | null;
  precipChance: number | null;
  cachedAt: number;
}

export function useHomeWeather(): { weather: HomeWeather | null; loading: boolean } {
  const { ready } = useAuth();
  const [weather, setWeather] = useState<HomeWeather | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    fetch("/api/weather", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setWeather({
          state: data.state,
          tempC: data.tempC,
          feelsLikeC: data.feelsLikeC,
          highC: data.highC ?? null,
          lowC: data.lowC ?? null,
          precipChance: data.precipChance ?? null,
          cachedAt: data.cachedAt,
        });
      })
      .catch(() => {
        /* 조용히 무시 — 위젯은 숨김 처리(확정 UI 5) */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // ready 가 true 로 바뀌는 시점(로그인 확인 완료) 1회만 — 마운트당 1회 호출 보장.
  }, [ready]);

  return { weather, loading };
}
