"use client";

import { useState } from "react";
import { HomeWeatherWidget } from "@/components/HomeWeatherWidget";

const weatherOptions = [
  { key: "clear", icon: "☀", label: "맑음" },
  { key: "cloudy", icon: "☁", label: "흐림" },
  { key: "rain", icon: "☂", label: "비" },
  { key: "snow", icon: "❄", label: "눈" },
] as const;

export function WeatherArchivePreview() {
  const [weather, setWeather] = useState<(typeof weatherOptions)[number]["key"]>("rain");
  const selected = weatherOptions.find((item) => item.key === weather)!;

  return (
    <div className="space-y-10">
      <header>
        <p className="text-[10px] font-semibold tracking-[.18em] text-accent">
          WEATHER ARCHIVE · UI PREVIEW
        </p>
        <h1 className="mt-2 text-[28px] font-extrabold tracking-[-.035em]">
          그날의 날씨까지, 함께 기록해요.
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-2">
          API와 저장 기능을 연결하기 전 화면 구성을 확인하는 샘플이에요.
        </p>
      </header>

      <section>
        <p className="mb-3 text-xs font-semibold text-muted-2">01 · 홈의 조용한 날씨</p>
        <div className="rounded-[20px] bg-card p-5 ring-1 ring-border">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[22px] font-extrabold tracking-[-.02em]">우리가 다녀온 곳</p>
            <HomeWeatherWidget
              location="서울"
              condition="맑음"
              temperatureC={22}
              icon="☀"
              message="천천히 걷기 좋은 날"
              feelsLikeC={21}
              highC={24}
              lowC={16}
              precipitationChance={10}
              observedLabel="오후 4:20 기준"
            />
          </div>
          <p className="mt-1 text-sm text-muted-2">지금까지 32곳 · 함께 만든 추억 18개</p>
        </div>
      </section>

      <section>
        <p className="mb-3 text-xs font-semibold text-muted-2">02 · 추억을 저장하는 순간</p>
        <article className="rounded-[24px] bg-card p-5 ring-1 ring-border sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-medium text-muted">
              날짜
              <span className="rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-foreground">
                2026.09.06
              </span>
            </label>
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-muted">그날의 날씨</span>
              <div className="flex min-h-10 items-center justify-between rounded-xl border border-accent-border bg-accent-soft/45 px-3 py-2">
                <span className="text-sm font-semibold text-accent">
                  {selected.icon} {selected.label}{weather === "rain" ? " · 19°" : ""}
                </span>
                <span className="text-[10px] font-medium text-muted-2">서울 · 자동 확인</span>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-[11px] leading-5 text-muted-2">
              오늘 날씨를 자동으로 가져왔어요. 다르게 기억한다면 바꿔주세요.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label="날씨 선택">
              {weatherOptions.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={weather === item.key}
                  onClick={() => setWeather(item.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    weather === item.key
                      ? "bg-accent text-white"
                      : "bg-background text-muted-2 ring-1 ring-border hover:text-accent"
                  }`}
                >
                  {item.icon} {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-dashed border-border bg-background/70 px-3.5 py-3">
            <p className="text-[11px] font-semibold text-foreground">과거 날짜를 선택한 경우</p>
            <p className="mt-1 text-[11px] leading-5 text-muted-2">
              자동 날씨를 표시하지 않고 `그날 날씨 직접 선택`만 보여줘요. 확인하지 못한 기온은 기록하지 않아요.
            </p>
          </div>
        </article>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-muted-2">03 · 날씨로 다시 꺼내보기</p>
            <h2 className="mt-1 text-xl font-extrabold tracking-[-.02em]">추억 모아보기</h2>
          </div>
          <span className="text-xs text-muted-3">비 오던 날 8개</span>
        </div>

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-3">
          {weatherOptions.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setWeather(item.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                weather === item.key
                  ? "bg-accent text-white"
                  : "bg-card text-muted-2 ring-1 ring-border"
              }`}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </div>

        <figure className="relative overflow-hidden rounded-[20px] bg-card px-6 py-6 ring-1 ring-border sm:px-[30px]">
          <div className="flex items-center gap-3">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-foreground/60">
              H
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">현</p>
              <p className="text-[11px] text-muted-3">2026.09.06 · 서울</p>
            </div>
            <span className="rounded-full bg-[#edf2ef] px-2.5 py-1 text-[11px] font-semibold text-accent">
              {selected.icon} {selected.label}{weather === "rain" ? " 19°" : ""}
            </span>
          </div>
          <blockquote className="relative mt-6 pl-6">
            <span aria-hidden className="absolute -left-1 -top-8 select-none font-serif text-[4.5rem] leading-none text-accent/[.07]">
              &ldquo;
            </span>
            <p className="relative text-[18px] leading-[1.75] text-foreground/90">
              우산 하나를 나눠 쓰고 오래 걸었던 저녁.
            </p>
          </blockquote>
          <p className="mt-5 border-t border-border pt-4 text-xs text-muted-2">
            그날도 비가 왔었어요. <span className="font-semibold text-accent">작년 이맘때의 기록</span>
          </p>
        </figure>
      </section>
    </div>
  );
}
