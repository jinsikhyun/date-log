"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { categoryStyle } from "@/lib/places";
import { PhotoThumbnails } from "@/components/PhotoThumbnails";
import { Reactions } from "@/components/Reactions";
import { type Reaction, REACTION_COLUMNS } from "@/lib/reactions";
import {
  type MemoryWithPlace,
  MEMORY_WITH_PLACE_COLUMNS,
  byDateDesc,
} from "@/lib/memories";

const dot = (d: string | null) => (d ? d.split("-").join(".") : "날짜 미정");

export function MemoriesFeed() {
  const [memories, setMemories] = useState<MemoryWithPlace[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error: qErr } = await supabase
        .from("memories")
        .select(MEMORY_WITH_PLACE_COLUMNS)
        .order("date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (qErr) {
        console.error("[memories] 모아보기 조회 실패:", qErr);
        setError(`추억을 불러오지 못했어요: ${qErr.message}`);
      } else {
        const list = ((data ?? []) as unknown as MemoryWithPlace[])
          .slice()
          .sort(byDateDesc);
        setMemories(list);

        // 추억 카드에 달린 이모지 반응
        const memIds = list.map((m) => m.id);
        if (memIds.length > 0) {
          const { data: rx } = await supabase
            .from("reactions")
            .select(REACTION_COLUMNS)
            .eq("target_type", "memory")
            .in("target_id", memIds);
          if (!cancelled) setReactions((rx ?? []) as Reaction[]);
        }
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">추억 모아보기</h1>
          <p className="mt-1.5 text-sm text-muted">
            {loading
              ? "불러오는 중…"
              : `우리가 남긴 이야기 ${memories.length}개`}
          </p>
        </div>
        <Link
          href="/"
          className="shrink-0 text-sm text-muted transition-colors hover:text-accent"
        >
          ← 홈으로
        </Link>
      </div>

      {loading ? (
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-3xl bg-stone-200/70"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      ) : memories.length === 0 ? (
        <p className="rounded-3xl bg-card p-12 text-center text-sm text-muted ring-1 ring-border/70">
          아직 기록된 추억이 없어요.
        </p>
      ) : (
        <ol className="space-y-6">
          {memories.map((m) => {
            const replyCount = m.memory_replies?.[0]?.count ?? 0;
            const card = (
              <figure className="relative h-full overflow-hidden rounded-3xl bg-card px-7 py-8 ring-1 ring-border/70 sm:px-10 sm:py-10">
                {/* 배경 장식 따옴표 (본문 폰트와 무관한 그래픽 요소) */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -left-1 -top-6 select-none font-serif text-[7rem] leading-none text-accent/10 sm:text-[9rem]"
                >
                  &ldquo;
                </span>

                <blockquote className="relative">
                  <p className="text-xl font-semibold leading-relaxed text-foreground/90 sm:text-2xl">
                    {m.content?.trim() || "(내용 없음)"}
                  </p>
                </blockquote>

                <figcaption className="relative mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                  <span aria-hidden>—</span>
                  {m.places ? (
                    <span className="font-medium text-foreground/80 transition-colors group-hover:text-accent">
                      {m.places.name}
                    </span>
                  ) : (
                    <span className="text-foreground/60">삭제된 장소</span>
                  )}
                  {m.places && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${categoryStyle(
                        m.places.category,
                      )}`}
                    >
                      {m.places.category}
                    </span>
                  )}
                  <span aria-hidden>·</span>
                  <time>{dot(m.date)}</time>
                  {m.mood_tag && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                        {m.mood_tag}
                      </span>
                    </>
                  )}
                  {m.author && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="font-medium text-foreground/70">
                        {m.author}
                      </span>
                    </>
                  )}
                </figcaption>

                {/* 인용구/출처 아래에 보조적으로 붙는 사진 행 */}
                <PhotoThumbnails urls={m.photo_urls} className="relative mt-4" />

                {replyCount > 0 && (
                  <p className="relative mt-3 text-xs font-medium text-accent">
                    💬 답글 {replyCount}개
                  </p>
                )}

                <div className="relative">
                  <Reactions
                    targetType="memory"
                    targetId={m.id}
                    initial={reactions.filter((r) => r.target_id === m.id)}
                  />
                </div>
              </figure>
            );

            return (
              <li key={m.id}>
                {m.places ? (
                  <Link
                    href={`/places/${m.places.id}`}
                    className="group block rounded-3xl transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent/10"
                  >
                    {card}
                  </Link>
                ) : (
                  card
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
