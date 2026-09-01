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
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
            추억 모아보기
          </h1>
          <p className="mt-1 text-sm text-muted-2">
            {loading
              ? "불러오는 중…"
              : `우리가 남긴 이야기 ${memories.length}개`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-[18px]">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-[20px] bg-[#efe7d6]"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      ) : memories.length === 0 ? (
        <p className="rounded-[20px] bg-card p-12 text-center text-sm text-muted-2 ring-1 ring-border">
          아직 기록된 추억이 없어요.
        </p>
      ) : (
        <ol className="space-y-[18px]">
          {memories.map((m) => {
            const replyCount = m.memory_replies?.[0]?.count ?? 0;
            const photoCount = m.photo_urls?.length ?? 0;
            const authorInitial =
              m.author?.trim().charAt(0).toUpperCase() || "·";
            const card = (
              <figure className="relative overflow-hidden rounded-[20px] bg-card px-[30px] py-[26px] ring-1 ring-border transition-shadow group-hover:shadow-[0_16px_32px_-22px_rgba(40,70,70,0.5)]">
                {/* 상단: 작성자 + 날짜 + 장소 */}
                <div className="flex items-center gap-3">
                  <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-foreground/60">
                    {authorInitial}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-tight">
                      {m.author || "누군가"}
                    </p>
                    <p className="text-[11px] text-muted-3">{dot(m.date)}</p>
                  </div>
                  {m.places ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${categoryStyle(
                          m.places.category,
                        )}`}
                      >
                        {m.places.category}
                      </span>
                      <span className="max-w-[9rem] truncate text-xs font-medium text-muted-2 transition-colors group-hover:text-accent">
                        {m.places.name}
                      </span>
                    </div>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-3">
                      삭제된 장소
                    </span>
                  )}
                </div>

                {/* 본문 인용구 — 이 화면의 주인공.
                    따옴표는 텍스트 뒤 은은한 배경 장식(투명도 낮춤) + 본문은 살짝 들여쓰기. */}
                <blockquote className="relative mt-6 pl-6">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -left-1 -top-8 select-none font-serif text-[4.5rem] leading-none text-accent/[0.07]"
                  >
                    &ldquo;
                  </span>
                  <p className="relative text-[19px] leading-[1.75] text-foreground/90">
                    {m.content?.trim() || "(내용 없음)"}
                  </p>
                </blockquote>

                {/* 하단 메타 */}
                {(m.mood_tag || photoCount > 0 || replyCount > 0) && (
                  <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-2">
                    {m.mood_tag && (
                      <span className="rounded-full bg-[#f1eadc] px-2 py-0.5 font-medium text-[#7a5f31]">
                        {m.mood_tag}
                      </span>
                    )}
                    {photoCount > 0 && <span>사진 {photoCount}</span>}
                    {replyCount > 0 && <span>답글 {replyCount}</span>}
                  </div>
                )}

                <PhotoThumbnails urls={m.photo_urls} className="relative mt-4" />

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
                    className="group block rounded-[20px]"
                  >
                    {card}
                  </Link>
                ) : (
                  <div className="group">{card}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
