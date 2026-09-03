"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { categoryStyle } from "@/lib/places";
import { buildAnniversaries, type Birthday } from "@/lib/anniversaries";

type DayPlace = {
  id: number; date: string; name: string; category: string; address: string;
  description: string | null; imageUrl: string | null; imageCapturedDate: string | null; visitOrder: number | null;
};
type DayMemory = {
  id: number; placeId: number; date: string; content: string | null;
  mood: string | null; author: string | null; photos: string[];
  replies: number; reactions: number;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const keyOf = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const prefixOf = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}-`;
const monthIndex = (date: Date) => date.getFullYear() * 12 + date.getMonth();

export function CoupleCalendar({ startDate, preview = false }: { startDate: string; preview?: boolean }) {
  const today = useMemo(() => new Date(), []);
  const startYear = Number(startDate.slice(0, 4));
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState<string | null>(null);
  const [orderEditing, setOrderEditing] = useState(false);
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderMessage, setOrderMessage] = useState<string | null>(null);
  const [places, setPlaces] = useState<DayPlace[]>(() => preview ? [
    { id: 1, date: "2026-09-02", name: "코오모라멘", category: "맛집", address: "서울 중구 다산로8길", description: "담백한 라멘", imageUrl: null, imageCapturedDate: null, visitOrder: null },
    { id: 2, date: "2026-09-07", name: "리사르 약수점", category: "카페", address: "서울 중구 다산로8길", description: null, imageUrl: "/brand-app-icon.png", imageCapturedDate: "2026-09-07", visitOrder: 1 },
    { id: 3, date: "2026-09-07", name: "DDP 산책", category: "산책", address: "서울 중구 을지로", description: "늦여름 밤 산책", imageUrl: "/brand-wordmark.png", imageCapturedDate: "2026-09-06", visitOrder: 2 },
  ] : []);
  const [memories, setMemories] = useState<DayMemory[]>(() => preview ? [
    { id: 1, placeId: 2, date: "2026-09-07", content: "커피 마시고 오래 이야기했던 날", mood: "❤️ 좋았어요", author: "지민", photos: [], replies: 2, reactions: 1 },
    { id: 2, placeId: 3, date: "2026-09-07", content: "선선한 밤공기를 느끼며 걸었던 날", mood: "🙂 편안했어요", author: "진식", photos: [], replies: 0, reactions: 0 },
  ] : []);
  const [birthdays, setBirthdays] = useState<Birthday[]>(() => preview ? [
    { name: "진식", birthDate: "1998-09-07" },
  ] : []);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    const loadPlaces = async () => {
      const withOrder = await supabase.from("places").select("id, name, category, address, description, image_url, image_captured_date, first_visit_date, visit_order").eq("status", "visited").not("first_visit_date", "is", null);
      if (!withOrder.error || !/(visit_order|image_captured_date)/i.test(withOrder.error.message)) return withOrder;
      return supabase.from("places").select("id, name, category, address, description, image_url, first_visit_date").eq("status", "visited").not("first_visit_date", "is", null);
    };
    Promise.all([
      loadPlaces(),
      supabase.from("memories").select("id, place_id, date, content, mood_tag, author, photo_urls, memory_replies(count)").not("date", "is", null),
      supabase.from("profiles").select("id, display_name, birth_date").not("birth_date", "is", null),
    ]).then(async ([pRes, mRes, bRes]) => {
      if (cancelled) return;
      if (pRes.error || mRes.error) {
        setError("날짜별 기록을 불러오지 못했어요."); setLoading(false); return;
      }
      const rows = (mRes.data ?? []) as unknown as Array<{
        id: number; place_id: number; date: string; content: string | null;
        mood_tag: string | null; author: string | null; photo_urls: string[] | null;
        memory_replies?: { count: number }[];
      }>;
      const reactionCounts = new Map<number, number>();
      if (rows.length) {
        const { data } = await supabase.from("reactions").select("target_id").eq("target_type", "memory").in("target_id", rows.map((r) => r.id));
        for (const reaction of data ?? []) {
          const id = Number(reaction.target_id);
          reactionCounts.set(id, (reactionCounts.get(id) ?? 0) + 1);
        }
      }
      if (cancelled) return;
      setPlaces((pRes.data ?? []).map((p) => ({
        id: Number(p.id), date: String(p.first_visit_date), name: String(p.name),
        category: String(p.category), address: String(p.address),
        description: (p.description as string | null) ?? null,
        imageUrl: (p.image_url as string | null) ?? null,
        imageCapturedDate: ("image_captured_date" in p ? (p.image_captured_date as string | null) : null) ?? null,
        visitOrder: ("visit_order" in p ? (p.visit_order as number | null) : null) ?? null,
      })));
      setMemories(rows.map((m) => ({
        id: m.id, placeId: m.place_id, date: m.date, content: m.content,
        mood: m.mood_tag, author: m.author, photos: m.photo_urls ?? [],
        replies: m.memory_replies?.[0]?.count ?? 0, reactions: reactionCounts.get(m.id) ?? 0,
      })));
      if (!bRes.error) {
        setBirthdays((bRes.data ?? []).map((member) => ({
          name: String(member.display_name ?? "우리"),
          birthDate: String(member.birth_date),
        })));
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [preview]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, i) => {
    const day = i - firstWeekday + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });
  const placesByDate = useMemo(() => {
    const map = new Map<string, DayPlace[]>();
    for (const p of [...places].sort((a, b) =>
      (a.visitOrder ?? Number.MAX_SAFE_INTEGER) - (b.visitOrder ?? Number.MAX_SAFE_INTEGER) || a.id - b.id)) {
      map.set(p.date, [...(map.get(p.date) ?? []), p]);
    }
    return map;
  }, [places]);
  const calendarMemories = useMemo(() => {
    const visitDateByPlace = new Map(places.map((place) => [place.id, place.date]));
    return memories.filter((memory) => visitDateByPlace.get(memory.placeId) === memory.date);
  }, [memories, places]);
  const memoriesByDate = useMemo(() => {
    const map = new Map<string, DayMemory[]>();
    for (const m of calendarMemories) map.set(m.date, [...(map.get(m.date) ?? []), m]);
    return map;
  }, [calendarMemories]);
  const firstRecordDate = [...places].sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? null;
  const eventsByDate = new Map<string, ReturnType<typeof buildAnniversaries>>();
  for (const event of buildAnniversaries(startDate, birthdays, year, year, firstRecordDate)) {
    eventsByDate.set(event.date, [...(eventsByDate.get(event.date) ?? []), event]);
  }

  const prefix = prefixOf(year, month);
  const monthPlaces = places.filter((p) => p.date.startsWith(prefix));
  const monthMemories = calendarMemories.filter((m) => m.date.startsWith(prefix));
  const dateDays = new Set([...monthPlaces.map((p) => p.date), ...monthMemories.map((m) => m.date)]).size;
  const prev = new Date(year, month - 1, 1);
  const prevCount = places.filter((p) => p.date.startsWith(prefixOf(prev.getFullYear(), prev.getMonth()))).length;
  const difference = monthPlaces.length - prevCount;
  const bestPhotoMemory = [...monthMemories].filter((m) => m.photos.length).sort((a, b) =>
    b.reactions * 3 + b.replies * 2 - (a.reactions * 3 + a.replies * 2))[0];
  const representativePlace = bestPhotoMemory
    ? places.find((p) => p.id === bestPhotoMemory.placeId) ?? null
    : monthPlaces.find((p) => p.imageUrl) ?? null;
  const representativePhoto = bestPhotoMemory?.photos[0] ?? representativePlace?.imageUrl ?? null;

  const selectedPlaces = selectedDate ? placesByDate.get(selectedDate) ?? [] : [];
  const selectedMemories = selectedDate ? memoriesByDate.get(selectedDate) ?? [] : [];
  const selectedEvents = selectedDate ? eventsByDate.get(selectedDate) ?? [] : [];
  const selectedPlaceIds = new Set(selectedPlaces.map((place) => place.id));
  const selectedPlaceOrder = new Map(selectedPlaces.map((place, index) => [place.id, index]));
  const selectedMemoriesInRouteOrder = [...selectedMemories].sort((a, b) => {
    const aOrder = selectedPlaceOrder.get(a.placeId) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = selectedPlaceOrder.get(b.placeId) ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder || a.id - b.id;
  });
  const selectedRoutePhotoByPlace = new Map(
    selectedPlaces
      .filter((place) => place.imageUrl && place.imageCapturedDate === selectedDate)
      .map((place) => [place.id, place.imageUrl as string]),
  );
  const selectedPhotos = Array.from(new Set([
    ...selectedPlaces.flatMap((place) => [
      ...(place.imageUrl && place.imageCapturedDate === selectedDate ? [place.imageUrl] : []),
      ...selectedMemoriesInRouteOrder.filter((memory) => memory.placeId === place.id).flatMap((memory) => memory.photos),
    ]),
    ...selectedMemoriesInRouteOrder.filter((memory) => !selectedPlaceIds.has(memory.placeId)).flatMap((memory) => memory.photos),
  ]));
  const selectedCount = selectedPlaces.length + selectedMemories.length;
  const selectedDateSummary = selectedPlaces.length > 1
    ? `${selectedPlaces.map((p) => p.category).join(" → ")} · 총 ${selectedPlaces.length}곳을 함께 다녀왔어요.`
    : selectedPlaces.length === 1
      ? `${selectedPlaces[0].name}에 함께 다녀왔어요.`
      : selectedMemories.length
        ? "그날의 추억을 다시 꺼내봤어요."
        : "이날은 아직 기록이 없어요.";
  const missingDetails = selectedPlaces.some((p) => !p.imageUrl || !p.description) || selectedMemories.length === 0;
  const canPrev = monthIndex(cursor) > startYear * 12;
  const canNext = monthIndex(cursor) < monthIndex(today);
  const years = Array.from({ length: today.getFullYear() - startYear + 1 }, (_, i) => startYear + i).reverse();
  const changeMonth = (date: Date) => {
    if (monthIndex(date) < startYear * 12 || monthIndex(date) > monthIndex(today)) return;
    setCursor(date); setSelectedDate(null); setSummaryOpen(false); setOrderEditing(false); setOrderMessage(null);
  };

  const moveSelectedPlace = async (index: number, direction: -1 | 1) => {
    if (!selectedDate || orderSaving) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= selectedPlaces.length) return;
    const reordered = [...selectedPlaces];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    const previous = places;
    const positions = new Map(reordered.map((place, i) => [place.id, i + 1]));
    setPlaces((current) => current.map((place) => positions.has(place.id)
      ? { ...place, visitOrder: positions.get(place.id)! }
      : place));
    if (preview) {
      setOrderMessage("방문 순서를 저장했어요.");
      return;
    }
    setOrderSaving(true); setOrderMessage(null);
    const { error: saveError } = await supabase.rpc("reorder_visit_places", {
      p_visit_date: selectedDate,
      p_place_ids: reordered.map((place) => place.id),
    });
    setOrderSaving(false);
    if (saveError) {
      setPlaces(previous);
      setOrderMessage(/reorder_visit_places/i.test(saveError.message)
        ? "순서 저장용 SQL을 먼저 적용해 주세요."
        : `순서를 저장하지 못했어요: ${saveError.message}`);
      return;
    }
    setOrderMessage("방문 순서를 저장했어요.");
  };

  return (
    <section className="overflow-hidden rounded-[20px] bg-card ring-1 ring-border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-soft text-xl text-accent">◷</span>
          <div>
            <h2 className="text-sm font-bold">날짜로 다시 보는 우리</h2>
            <p className="mt-0.5 text-[11px] text-muted-2">함께 다녀온 날을 눌러 그날의 이야기를 꺼내보세요.</p>
          </div>
        </div>
        <span className="rounded-full bg-accent-soft px-3 py-1.5 text-[11px] font-semibold text-accent">이번 달 {monthPlaces.length}곳</span>
      </div>

      <div className="p-4 sm:p-6">
        <button type="button" onClick={() => setSummaryOpen((v) => !v)} aria-expanded={summaryOpen} className="mb-3 flex w-full items-center justify-between rounded-2xl bg-accent-soft/55 px-4 py-3 text-left hover:bg-accent-soft">
          <span><b className="block text-xs text-accent">{month + 1}월 돌아보기</b><span className="mt-0.5 block text-[10px] text-muted-2">데이트한 날과 남긴 기록을 간단히 모았어요.</span></span>
          <span className={`text-xs text-accent transition ${summaryOpen ? "rotate-180" : ""}`}>⌄</span>
        </button>
        {summaryOpen && (
          <div className="mb-3 overflow-hidden rounded-2xl border border-border bg-[#fffcf7]">
            <div className="grid grid-cols-3 divide-x divide-border">
              {[["데이트한 날", `${dateDays}일`], ["방문한 장소", `${monthPlaces.length}곳`], ["남긴 추억", `${monthMemories.length}개`]].map(([label, value]) => (
                <div key={label} className="px-2 py-4 text-center"><p className="text-lg font-extrabold">{value}</p><p className="mt-1 text-[10px] text-muted-2">{label}</p></div>
              ))}
            </div>
            <div className="flex items-center gap-3 border-t border-border p-3">
              {representativePhoto && representativePlace ? (
                <Link href={`/places/${representativePlace.id}`} className="group w-20 shrink-0 text-center">
                  <img src={representativePhoto} alt={`${month + 1}월 대표 기록 · ${representativePlace.name}`} className="mx-auto h-16 w-16 rounded-xl object-cover ring-1 ring-border transition group-hover:brightness-95" />
                  <span className="mt-1 block truncate text-[9px] font-medium text-muted-2 transition group-hover:text-accent">{representativePlace.name}</span>
                </Link>
              ) : (
                <span className="photo-placeholder flex h-16 w-20 shrink-0 items-center justify-center rounded-xl">♡</span>
              )}
              <div><p className="text-xs font-semibold">지난달보다 {Math.abs(difference)}곳 {difference > 0 ? "더 많이" : difference < 0 ? "적게" : "같이"} 다녀왔어요.</p><p className="mt-1 text-[10px] text-muted-2">추억·답글·반응이 많은 사진을 우선해 골라요.</p></div>
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-[#fffcf7] p-3 ring-1 ring-border/70 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <button type="button" onClick={() => changeMonth(new Date(year, month - 1, 1))} disabled={!canPrev} aria-label="이전 달" className="h-8 w-8 rounded-full text-muted hover:bg-accent-soft disabled:opacity-20">‹</button>
            <div className="text-center">
              <div className="flex gap-1.5">
                <select aria-label="연도 선택" value={year} onChange={(e) => changeMonth(new Date(Number(e.target.value), month, 1))} className="rounded-full bg-white px-3 py-1 text-sm font-bold ring-1 ring-border">{years.map((y) => <option key={y}>{y}</option>)}</select>
                <select aria-label="월 선택" value={month} onChange={(e) => changeMonth(new Date(year, Number(e.target.value), 1))} className="rounded-full bg-white px-3 py-1 text-sm font-bold ring-1 ring-border">{Array.from({ length: 12 }, (_, m) => <option key={m} value={m} disabled={year === today.getFullYear() && m > today.getMonth()}>{m + 1}월</option>)}</select>
              </div>
              <button type="button" onClick={() => changeMonth(new Date(today.getFullYear(), today.getMonth(), 1))} className="mt-1 text-[10px] text-muted">오늘로 돌아가기</button>
            </div>
            <button type="button" onClick={() => changeMonth(new Date(year, month + 1, 1))} disabled={!canNext} aria-label="다음 달" className="h-8 w-8 rounded-full text-muted hover:bg-accent-soft disabled:opacity-20">›</button>
          </div>
          <div className="grid grid-cols-7 text-center text-[10px] text-muted-3">{WEEKDAYS.map((w, i) => <span key={w} className={i === 0 ? "text-[#bd7562]" : ""}>{w}</span>)}</div>
          <div className="mt-2 grid grid-cols-7 gap-y-1">
            {cells.map((day, i) => {
              if (!day) return <span key={`blank-${i}`} className="h-10 sm:h-11" />;
              const key = keyOf(year, month, day);
              const count = (placesByDate.get(key)?.length ?? 0) + (memoriesByDate.get(key)?.length ?? 0);
              const eventCount = eventsByDate.get(key)?.length ?? 0;
              const selected = key === selectedDate;
              const isToday = key === keyOf(today.getFullYear(), today.getMonth(), today.getDate());
              return <button type="button" key={key} onClick={() => { setSelectedDate(selected ? null : key); setOrderEditing(false); setOrderMessage(null); }} aria-label={`${month + 1}월 ${day}일, 기록 ${count}개${eventCount ? `, 기념일 ${eventCount}개` : ""}`} className={`mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-xl text-xs ${selected ? "bg-accent text-white" : count ? "bg-accent-soft/80 font-semibold text-accent" : eventCount ? "bg-[#fff2ed] font-semibold text-[#b96f5e]" : isToday ? "font-bold text-accent ring-1 ring-inset ring-accent/30" : "hover:bg-white"}`}><span>{day}</span><span className="mt-1 flex h-1.5 items-center gap-0.5">{count > 0 && <span className={`block h-1.5 w-1.5 rounded-full ${selected ? "bg-white" : "bg-accent"}`} />}{eventCount > 0 && <span className={`block h-1.5 w-1.5 rounded-full ${selected ? "bg-[#ffd5c9]" : "bg-[#d98772]"}`} />}</span></button>;
            })}
          </div>
        </div>

        {loading && <p className="mt-3 text-xs text-muted">기록을 불러오는 중…</p>}
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
        {selectedDate && !loading && (
          <div className="mt-3 space-y-3 rounded-2xl bg-accent-soft/55 p-4 ring-1 ring-accent/10">
            <div className="flex justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-accent">{Number(selectedDate.slice(5, 7))}월 {Number(selectedDate.slice(8, 10))}일</p>
                  {selectedPlaces.length > 1 && <span className="rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-semibold text-accent ring-1 ring-accent/10">하루 데이트</span>}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-2">{selectedDateSummary}</p>
              </div>
              {selectedCount > 0 && <span className="shrink-0 text-[10px] text-muted-2">기록 {selectedCount}개</span>}
            </div>
            {selectedEvents.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedEvents.map((event) => (
                  <span key={`${event.kind}-${event.label}`} className="inline-flex items-center gap-1.5 rounded-full bg-[#fff7f3] px-3 py-1.5 text-[10px] font-semibold text-[#a85f50] ring-1 ring-[#e7b9ad]/60">
                    <span aria-hidden>{event.icon}</span>{event.label}
                  </span>
                ))}
              </div>
            )}
            {selectedPlaces.length > 1 && (
              <div className="rounded-2xl bg-white/75 px-3 py-3 ring-1 ring-border/70">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold text-muted-2">그날의 방문 루트</p>
                  <button type="button" onClick={() => { setOrderEditing((value) => !value); setOrderMessage(null); }} className="rounded-full px-2 py-1 text-[9px] font-semibold text-accent transition hover:bg-accent-soft">
                    {orderEditing ? "편집 완료" : "순서 편집"}
                  </button>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {selectedPlaces.map((place, index) => (
                    <div key={place.id} className="flex shrink-0 items-center gap-1.5">
                      {index > 0 && <span className="text-[11px] text-accent/55">→</span>}
                      <Link href={`/places/${place.id}`} className="flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1.5 text-[10px] font-semibold text-accent transition hover:bg-accent hover:text-white">
                        {selectedRoutePhotoByPlace.get(place.id) && (
                          <img
                            src={selectedRoutePhotoByPlace.get(place.id)}
                            alt={`${place.name}에서 찍은 사진`}
                            className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-white/80"
                          />
                        )}
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/80 text-[8px] text-accent">{index + 1}</span>
                        <span className="max-w-28 truncate">{place.name}</span>
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {orderMessage && <p className={`text-[10px] font-medium ${orderMessage.includes("저장했어요") ? "text-accent" : "text-red-600"}`}>{orderMessage}</p>}
            {selectedPlaces.length > 0 && <div className="space-y-1.5"><p className="text-[10px] font-semibold text-muted-2">방문한 장소</p>{selectedPlaces.map((p, index) => <div key={p.id} className="flex items-center gap-2"><Link href={`/places/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-white/85 p-3"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[9px] font-bold text-accent">{index + 1}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><b className="truncate text-xs">{p.name}</b><span className={`rounded-full px-2 py-0.5 text-[9px] ${categoryStyle(p.category)}`}>{p.category}</span></span><span className="block truncate text-[10px] text-muted-2">{p.address}</span></span><span>›</span></Link>{orderEditing && <div className="flex shrink-0 flex-col gap-1"><button type="button" aria-label={`${p.name} 앞으로 이동`} disabled={index === 0 || orderSaving} onClick={() => moveSelectedPlace(index, -1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs text-accent ring-1 ring-border disabled:opacity-25">↑</button><button type="button" aria-label={`${p.name} 뒤로 이동`} disabled={index === selectedPlaces.length - 1 || orderSaving} onClick={() => moveSelectedPlace(index, 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs text-accent ring-1 ring-border disabled:opacity-25">↓</button></div>}</div>)}</div>}
            {selectedMemoriesInRouteOrder.length > 0 && <div><p className="mb-1.5 text-[10px] font-semibold text-muted-2">남긴 추억과 감정</p>{selectedMemoriesInRouteOrder.map((m) => <Link key={m.id} href={`/places/${m.placeId}`} className="mb-1.5 block rounded-xl bg-white/75 px-3 py-2.5"><span className="flex justify-between text-[11px]"><b className="text-accent">{m.mood || "그날의 추억"}</b><span className="text-muted-3">{m.author}</span></span>{m.content?.trim() && <p className="mt-1 line-clamp-2 text-[11px]">{m.content}</p>}</Link>)}</div>}
            {selectedPhotos.length > 0 && <div><p className="mb-1.5 text-[10px] font-semibold text-muted-2">그날의 사진 {selectedPhotos.length}장</p><div className="flex gap-2 overflow-x-auto">{selectedPhotos.slice(0, 8).map((url) => <img key={url} src={url} alt="그날의 기록" className="h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-border" />)}</div></div>}
            {selectedCount > 0 && missingDetails && <p className="rounded-xl bg-white/55 px-3 py-2 text-[10px] text-muted-2">사진이나 한마디가 비어 있는 기록이 있어요. 장소를 눌러 가볍게 채워볼까요?</p>}
          </div>
        )}
      </div>
    </section>
  );
}
