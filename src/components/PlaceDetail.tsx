"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { type Place, categoryStyle } from "@/lib/places";
import { type Memory, MEMORY_COLUMNS, byDateAsc } from "@/lib/memories";
import { StarRating } from "@/components/StarRating";
import { AddMemoryForm, type NewMemoryInput } from "@/components/AddMemoryForm";

const PLACE_COLUMNS =
  "id, name, category, address, naver_map_link, rating, first_visit_date, description, memory_count, created_at";

const dot = (d: string | null) => (d ? d.split("-").join(".") : "날짜 미정");

export function PlaceDetail({ id }: { id: number }) {
  const [place, setPlace] = useState<Place | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setError("장소를 찾을 수 없어요.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const [placeRes, memRes] = await Promise.all([
        supabase.from("places").select(PLACE_COLUMNS).eq("id", id).single(),
        supabase.from("memories").select(MEMORY_COLUMNS).eq("place_id", id),
      ]);
      if (cancelled) return;

      if (placeRes.error || !placeRes.data) {
        setError(
          placeRes.error?.code === "PGRST116"
            ? "장소를 찾을 수 없어요."
            : `장소를 불러오지 못했어요: ${placeRes.error?.message ?? "알 수 없는 오류"}`,
        );
        setLoading(false);
        return;
      }

      setPlace(placeRes.data as Place);
      if (memRes.error) {
        console.error("[memories] 조회 실패:", memRes.error);
      } else {
        setMemories(((memRes.data ?? []) as Memory[]).slice().sort(byDateAsc));
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleAddMemory = useCallback(
    async (input: NewMemoryInput) => {
      const row = {
        place_id: id,
        date: input.date || null,
        content: input.content.trim(),
        mood_tag: input.mood_tag.trim() || null,
      };

      const { data, error: insErr } = await supabase
        .from("memories")
        .insert(row)
        .select(MEMORY_COLUMNS)
        .single();

      if (insErr) {
        console.error("[memories] 추가 실패:", insErr);
        throw new Error(insErr.message);
      }

      setMemories((prev) => [...prev, data as Memory].sort(byDateAsc));
      setShowForm(false);
    },
    [id],
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-56 animate-pulse rounded-3xl bg-stone-200/70" />
        <div className="h-24 animate-pulse rounded-3xl bg-stone-200/70" />
      </div>
    );
  }

  if (error || !place) {
    return (
      <div className="rounded-3xl bg-card p-10 text-center ring-1 ring-border/70">
        <p className="text-sm text-muted">{error ?? "장소를 찾을 수 없어요."}</p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white"
        >
          홈으로
        </Link>
      </div>
    );
  }

  const visited = place.first_visit_date
    ? place.first_visit_date.split("-").join(".")
    : null;

  return (
    <div className="space-y-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-accent"
      >
        ← 홈으로
      </Link>

      {/* 장소 헤더 */}
      <header className="overflow-hidden rounded-3xl bg-card ring-1 ring-border/70">
        <div className="relative aspect-[16/7] bg-gradient-to-br from-stone-200 to-stone-300">
          <span
            className={`absolute left-5 top-5 rounded-full px-3 py-1 text-xs font-semibold ${categoryStyle(
              place.category,
            )}`}
          >
            {place.category}
          </span>
        </div>
        <div className="flex flex-col gap-3 p-6 sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-2xl font-bold">{place.name}</h1>
            {visited && (
              <span className="text-sm text-muted">첫 방문 {visited}</span>
            )}
          </div>
          <p className="text-sm text-muted">{place.address}</p>
          {place.description && (
            <p className="text-sm leading-relaxed text-foreground/80">
              {place.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <StarRating rating={place.rating} />
            {place.naver_map_link && (
              <a
                href={place.naver_map_link}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-200"
              >
                네이버지도에서 보기
              </a>
            )}
          </div>
        </div>
      </header>

      {/* 우리의 추억 */}
      <section className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">
            우리의 추억 <span className="text-muted">{memories.length}</span>
          </h2>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="shrink-0 rounded-full bg-foreground px-4 py-1.5 text-sm font-semibold text-background"
          >
            {showForm ? "닫기" : "추억 추가"}
          </button>
        </div>

        {showForm && (
          <AddMemoryForm
            onSubmit={handleAddMemory}
            onCancel={() => setShowForm(false)}
          />
        )}

        {memories.length === 0 && !showForm ? (
          <p className="rounded-3xl bg-card p-10 text-center text-sm text-muted ring-1 ring-border/70">
            아직 추억이 없어요, 첫 이야기를 남겨보세요.
          </p>
        ) : memories.length > 0 ? (
          <ol className="relative space-y-4 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-border">
            {memories.map((m) => (
              <li key={m.id} className="relative pl-7">
                <span className="absolute left-0 top-[18px] h-3.5 w-3.5 rounded-full border-2 border-accent bg-background" />
                <article className="rounded-3xl bg-card p-5 ring-1 ring-border/70">
                  <div className="flex flex-wrap items-center gap-2">
                    <time className="text-sm font-semibold text-accent">
                      {dot(m.date)}
                    </time>
                    {m.mood_tag && (
                      <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
                        {m.mood_tag}
                      </span>
                    )}
                  </div>
                  {m.content && (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                      {m.content}
                    </p>
                  )}
                </article>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    </div>
  );
}
