"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

type Recall = {
  id: number;
  name: string;
  image_url: string | null;
  subtitle: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const snippet = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > 90 ? `${t.slice(0, 90).trimEnd()}…` : t;
};

/**
 * 홈 상단 "1년 전 오늘" 회상 배너.
 * 기준 = "작년의 이번 달"(정확한 같은 날짜가 아니라 그 달 전체) 에 방문 기록
 * (places.first_visit_date) 또는 추억(memories.date) 이 있는 장소.
 * 후보 중 하루 단위 시드로 하나 선택. 후보가 없으면 아무것도 렌더하지 않음.
 */
export function OnThisMonthBanner() {
  const [recall, setRecall] = useState<Recall | null>(null);

  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear() - 1;
    const m = now.getMonth(); // 0-11
    const first = `${y}-${pad(m + 1)}-01`;
    const last = `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`;

    let cancelled = false;
    (async () => {
      const [visitRes, memRes] = await Promise.all([
        supabase
          .from("places")
          .select("id, name, description, image_url")
          .eq("status", "visited")
          .gte("first_visit_date", first)
          .lte("first_visit_date", last),
        supabase
          .from("memories")
          .select("content, places(id, name, description, image_url)")
          .gte("date", first)
          .lte("date", last),
      ]);
      if (cancelled) return;

      type Cand = {
        id: number;
        name: string;
        description: string | null;
        image_url: string | null;
        memoryContent: string | null;
      };
      const byId = new Map<number, Cand>();

      for (const p of (visitRes.data ?? []) as {
        id: number;
        name: string;
        description: string | null;
        image_url: string | null;
      }[]) {
        if (!byId.has(p.id))
          byId.set(p.id, { ...p, memoryContent: null });
      }
      for (const row of (memRes.data ?? []) as unknown as {
        content: string | null;
        places: {
          id: number;
          name: string;
          description: string | null;
          image_url: string | null;
        } | null;
      }[]) {
        const pl = row.places;
        if (!pl) continue;
        const cur = byId.get(pl.id);
        if (!cur) {
          byId.set(pl.id, {
            id: pl.id,
            name: pl.name,
            description: pl.description,
            image_url: pl.image_url,
            memoryContent: row.content?.trim() || null,
          });
        } else if (!cur.memoryContent && row.content?.trim()) {
          cur.memoryContent = row.content.trim();
        }
      }

      const list = [...byId.values()];
      if (list.length === 0) {
        setRecall(null);
        return;
      }

      // 하루 동안은 같은 후보가 뜨도록 날짜 시드
      const seed =
        now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
      const chosen = list[seed % list.length];

      setRecall({
        id: chosen.id,
        name: chosen.name,
        image_url: chosen.image_url,
        subtitle: chosen.description?.trim()
          ? snippet(chosen.description)
          : chosen.memoryContent
            ? snippet(chosen.memoryContent)
            : null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!recall) return null;

  return (
    <Link
      href={`/places/${recall.id}`}
      className="group relative mb-5 block overflow-hidden rounded-[20px] bg-[#2f3d3d] text-[#eff4f1] ring-1 ring-black/10"
    >
      {recall.image_url && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={recall.image_url}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover opacity-35"
          />
          <div className="absolute inset-0 bg-[#2f3d3d]/75" />
        </>
      )}
      <div className="relative flex flex-col gap-1.5 px-6 py-5 sm:px-8 sm:py-6">
        <span className="text-[11px] font-bold tracking-[0.08em] text-white/60">
          1년 전 오늘
        </span>
        <p className="text-lg font-extrabold leading-snug sm:text-xl">
          작년 오늘, 둘은 {recall.name}에 있었어요.
        </p>
        {recall.subtitle && (
          <p className="line-clamp-2 text-[13px] leading-relaxed text-white/75">
            {recall.subtitle}
          </p>
        )}
        <span className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-[#fffcf5] px-3.5 py-1.5 text-xs font-bold text-[#2f3d3d] transition-transform group-hover:translate-x-0.5">
          그날 보러 가기 →
        </span>
      </div>
    </Link>
  );
}
