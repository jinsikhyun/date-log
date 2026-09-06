"use client";

import { useEffect, useRef, useState } from "react";

export type HomeWeatherWidgetProps = {
  location: string;
  condition: string;
  temperatureC: number;
  icon: string;
  message: string;
  feelsLikeC?: number;
  highC?: number;
  lowC?: number;
  precipitationChance?: number;
  observedLabel?: string;
};

export function HomeWeatherWidget({
  location,
  condition,
  temperatureC,
  icon,
  message,
  feelsLikeC,
  highC,
  lowC,
  precipitationChance,
  observedLabel,
}: HomeWeatherWidgetProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const hasDetails =
    feelsLikeC != null || highC != null || lowC != null || precipitationChance != null;

  return (
    <div
      ref={rootRef}
      aria-label="오늘의 날씨"
      className="relative w-fit max-w-full"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="home-weather-details"
        aria-label={`${location} 오늘 날씨 ${condition} ${temperatureC}도. 자세히 보기`}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-bold text-accent transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span aria-hidden="true" className="shrink-0 text-[15px] leading-none text-accent">
          {icon}
        </span>
        <span className="shrink-0">{temperatureC}°</span>
      </button>

      {open && (
        <div
          id="home-weather-details"
          role="region"
          aria-label="오늘의 자세한 날씨"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(300px,calc(100vw-48px))] rounded-[18px] border border-border bg-surface p-4 shadow-[0_18px_40px_-24px_rgba(48,46,43,.55)]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold tracking-[.14em] text-muted-3">TODAY · {location}</p>
              <p className="mt-1.5 text-xl font-extrabold tracking-[-.025em]">
                {icon} {condition} {temperatureC}°
              </p>
            </div>
            {observedLabel && <span className="shrink-0 text-[10px] text-muted-3">{observedLabel}</span>}
          </div>
          {hasDetails && (
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-xs">
              {feelsLikeC != null && <div className="flex justify-between gap-2"><dt className="text-muted-2">체감</dt><dd className="font-semibold">{feelsLikeC}°</dd></div>}
              {precipitationChance != null && <div className="flex justify-between gap-2"><dt className="text-muted-2">강수</dt><dd className="font-semibold">{precipitationChance}%</dd></div>}
              {highC != null && <div className="flex justify-between gap-2"><dt className="text-muted-2">최고</dt><dd className="font-semibold">{highC}°</dd></div>}
              {lowC != null && <div className="flex justify-between gap-2"><dt className="text-muted-2">최저</dt><dd className="font-semibold">{lowC}°</dd></div>}
            </dl>
          )}
          <p className="mt-3 text-[11px] leading-5 text-muted-2">{message}</p>
        </div>
      )}
    </div>
  );
}
