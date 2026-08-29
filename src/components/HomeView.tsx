"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { PlaceCard } from "@/components/PlaceCard";
import { AddPlaceForm, type NewPlaceInput } from "@/components/AddPlaceForm";
import { supabase } from "@/lib/supabase";
import type { Place } from "@/lib/places";

// 카카오맵은 window 에 의존 → 클라이언트에서만 렌더 (SSR 비활성화)
const KakaoMap = dynamic(
  () => import("@/components/KakaoMap").then((m) => m.KakaoMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] w-full items-center justify-center rounded-3xl bg-stone-200 text-sm text-muted sm:h-[520px]">
        지도 준비 중…
      </div>
    ),
  },
);

type ViewMode = "feed" | "map";

const PLACE_COLUMNS =
  "id, name, category, address, naver_map_link, rating, first_visit_date, description, memory_count, created_at";

export function HomeView() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("feed");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("places")
        .select(PLACE_COLUMNS)
        .order("first_visit_date", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error("[places] 조회 실패:", error);
        const missingTable =
          error.code === "PGRST205" || /does not exist/i.test(error.message);
        setLoadError(
          missingTable
            ? "places 테이블이 아직 없어요. supabase/schema.sql 을 Supabase SQL Editor에서 실행하세요."
            : `장소를 불러오지 못했어요: ${error.message}`,
        );
      } else {
        setPlaces((data ?? []) as Place[]);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAdd = useCallback(async (input: NewPlaceInput) => {
    const row = {
      name: input.name.trim(),
      category: input.category,
      address: input.address.trim(),
      naver_map_link: input.naver_map_link.trim() || null,
      rating: input.rating ? Number(input.rating) : null,
      first_visit_date: input.first_visit_date || null,
      description: input.description.trim() || null,
    };

    const { data, error } = await supabase
      .from("places")
      .insert(row)
      .select(PLACE_COLUMNS)
      .single();

    if (error) {
      console.error("[places] 추가 실패:", error);
      throw new Error(error.message);
    }

    // 새로고침 없이 카드/지도에 즉시 반영
    setPlaces((prev) => [data as Place, ...prev]);
    setShowForm(false);
    setView("feed");
  }, []);

  const totalMemories = useMemo(
    () => places.reduce((sum, p) => sum + (p.memory_count ?? 0), 0),
    [places],
  );

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">우리가 다녀온 곳</h1>
          <p className="mt-1.5 text-sm text-muted">
            {loading
              ? "불러오는 중…"
              : `지금까지 ${places.length}곳 · 함께 만든 추억 ${totalMemories}개`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-card p-1 ring-1 ring-border">
            {(
              [
                ["feed", "피드"],
                ["map", "지도로 보기"],
              ] as const
            ).map(([mode, labelText]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                aria-pressed={view === mode}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  view === mode
                    ? "bg-accent text-white shadow-sm"
                    : "text-muted hover:text-accent"
                }`}
              >
                {labelText}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-full bg-foreground px-4 py-1.5 text-sm font-semibold text-background"
          >
            {showForm ? "폼 닫기" : "장소 추가"}
          </button>
        </div>
      </div>

      {showForm && (
        <AddPlaceForm onSubmit={handleAdd} onCancel={() => setShowForm(false)} />
      )}

      {loadError && (
        <div className="mb-6 rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-72 animate-pulse rounded-3xl bg-stone-200/70"
            />
          ))}
        </div>
      ) : view === "feed" ? (
        places.length === 0 && !loadError ? (
          <p className="py-16 text-center text-sm text-muted">
            아직 장소가 없어요. “장소 추가”로 첫 장소를 남겨보세요.
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {places.map((place) => (
              <PlaceCard key={place.id} place={place} />
            ))}
          </div>
        )
      ) : (
        <section aria-label="지도로 보기">
          <KakaoMap places={places} />
          <p className="mt-3 text-xs text-muted">
            마커를 누르면 장소 이름과 카테고리가 표시돼요. 좌표는 주소를 카카오
            지오코더로 변환해 표시합니다.
          </p>
        </section>
      )}
    </>
  );
}
