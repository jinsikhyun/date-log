"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type CalendarEvent = {
  id: number;
  date: string;
  title: string;
  href: string;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthIndex(date: Date) {
  return date.getFullYear() * 12 + date.getMonth();
}

export function CoupleCalendar({
  startDate,
  preview = false,
}: {
  startDate: string;
  preview?: boolean;
}) {
  const today = useMemo(() => new Date(), []);
  const startYear = Number(startDate.slice(0, 4));
  const minMonth = startYear * 12;
  const [cursor, setCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [events, setEvents] = useState<CalendarEvent[]>(() =>
    preview
      ? [
          { id: 1, date: "2026-09-02", title: "코오모라멘", href: "#" },
          { id: 2, date: "2026-09-07", title: "리사르 약수점", href: "#" },
          { id: 3, date: "2026-09-07", title: "DDP 산책", href: "#" },
          { id: 4, date: "2026-09-18", title: "에디션덴마크 쇼룸", href: "#" },
          { id: 5, date: "2026-09-27", title: "안주마을", href: "#" },
        ]
      : [],
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preview) {
      return;
    }
    let cancelled = false;

    supabase
      .from("places")
      .select("id, name, first_visit_date")
      .eq("status", "visited")
      .not("first_visit_date", "is", null)
      .then((placesResult) => {
      if (cancelled) return;
      if (placesResult.error) {
        setError("기록을 불러오지 못했어요.");
        setLoading(false);
        return;
      }

      const placeEvents: CalendarEvent[] = (placesResult.data ?? []).map((row) => ({
        id: Number(row.id),
        date: String(row.first_visit_date),
        title: String(row.name),
        href: `/places/${row.id}`,
      }));

      setEvents(placeEvents);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [preview]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const list = map.get(event.date) ?? [];
      list.push(event);
      map.set(event.date, list);
    }
    return map;
  }, [events]);

  const selectedEvents = selectedDate ? eventsByDate.get(selectedDate) ?? [] : [];
  const canGoPrevious = monthIndex(cursor) > minMonth;
  const canGoNext = monthIndex(cursor) < monthIndex(today);
  const selectableYears = Array.from(
    { length: today.getFullYear() - startYear + 1 },
    (_, index) => startYear + index,
  ).reverse();

  const moveMonth = (amount: number) => {
    const next = new Date(year, month + amount, 1);
    if (monthIndex(next) < minMonth || monthIndex(next) > monthIndex(today)) return;
    setCursor(next);
    setSelectedDate(null);
  };

  return (
    <section className="rounded-3xl bg-card p-5 ring-1 ring-border/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted">우리의 기록 캘린더</p>
          <p className="mt-1 text-xs text-muted">
            함께 다녀온 날들을 한눈에 모았어요.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent" /> 다녀온 곳
          </span>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-[#fffcf7] p-3 sm:p-4">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => moveMonth(-1)}
            disabled={!canGoPrevious}
            aria-label="이전 달"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-accent-soft hover:text-accent disabled:opacity-20"
          >
            ‹
          </button>
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1.5">
              <label className="relative">
                <span className="sr-only">연도 선택</span>
                <select
                  value={year}
                  onChange={(event) => {
                    const nextYear = Number(event.target.value);
                    const nextMonth = nextYear === today.getFullYear()
                      ? Math.min(month, today.getMonth())
                      : month;
                    setCursor(new Date(nextYear, nextMonth, 1));
                    setSelectedDate(null);
                  }}
                  className="cursor-pointer appearance-none rounded-full bg-white py-1 pl-3 pr-7 text-sm font-bold text-foreground shadow-sm outline-none ring-1 ring-border transition hover:ring-accent-border focus:ring-accent"
                >
                  {selectableYears.map((selectYear) => (
                    <option key={selectYear} value={selectYear}>{selectYear}년</option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-muted">▼</span>
              </label>
              <label className="relative">
                <span className="sr-only">월 선택</span>
                <select
                  value={month}
                  onChange={(event) => {
                    setCursor(new Date(year, Number(event.target.value), 1));
                    setSelectedDate(null);
                  }}
                  className="cursor-pointer appearance-none rounded-full bg-white py-1 pl-3 pr-7 text-sm font-bold text-foreground shadow-sm outline-none ring-1 ring-border transition hover:ring-accent-border focus:ring-accent"
                >
                  {Array.from({ length: 12 }, (_, selectMonth) => (
                    <option
                      key={selectMonth}
                      value={selectMonth}
                      disabled={year === today.getFullYear() && selectMonth > today.getMonth()}
                    >
                      {selectMonth + 1}월
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-muted">▼</span>
              </label>
            </div>
            <button
              type="button"
              onClick={() => {
                setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
                setSelectedDate(null);
              }}
              className="mt-0.5 text-[10px] font-medium text-muted hover:text-accent"
            >
              오늘로 돌아가기
            </button>
          </div>
          <button
            type="button"
            onClick={() => moveMonth(1)}
            disabled={!canGoNext}
            aria-label="다음 달"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-accent-soft hover:text-accent disabled:opacity-20"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 text-center text-[10px] font-medium text-muted-3">
          {WEEKDAYS.map((weekday, index) => (
            <span key={weekday} className={index === 0 ? "text-[#bd7562]" : ""}>
              {weekday}
            </span>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-y-1">
          {cells.map((day, index) => {
            if (!day) return <span key={`blank-${index}`} className="h-10 sm:h-11" />;
            const key = dateKey(year, month, day);
            const dayEvents = eventsByDate.get(key) ?? [];
            const hasRecord = dayEvents.length > 0;
            const isToday = key === dateKey(today.getFullYear(), today.getMonth(), today.getDate());
            const isSelected = key === selectedDate;

            return (
              <button
                type="button"
                key={key}
                onClick={() => setSelectedDate(isSelected ? null : key)}
                aria-label={`${month + 1}월 ${day}일, 기록 ${dayEvents.length}개`}
                className={`mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-xl text-xs transition sm:h-11 sm:w-11 ${
                  isSelected
                    ? "bg-accent text-white shadow-sm"
                    : isToday
                      ? "bg-accent-soft font-bold text-accent"
                      : "hover:bg-white"
                }`}
              >
                <span>{day}</span>
                <span className="mt-1 flex h-1.5 items-center gap-1">
                  {hasRecord && (
                    <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-white" : "bg-accent"}`} />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {loading && <p className="mt-3 text-xs text-muted">기록을 불러오는 중…</p>}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      {selectedDate && !loading && (
        <div className="mt-3 rounded-2xl bg-accent-soft/60 px-4 py-3">
          <p className="text-xs font-semibold text-accent">
            {Number(selectedDate.slice(5, 7))}월 {Number(selectedDate.slice(8, 10))}일
          </p>
          {selectedEvents.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {selectedEvents.map((event) => (
                <Link
                  key={event.id}
                  href={event.href}
                  className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-xs transition hover:bg-white"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                  <span className="min-w-0 flex-1 truncate font-medium">{event.title}</span>
                  <span className="text-muted">장소 ›</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted">이날은 아직 기록이 없어요.</p>
          )}
        </div>
      )}
    </section>
  );
}
