"use client";

import PhotoImage from "@/components/PhotoImage";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

type Recall = {
  id: number;
  name: string;
  image_url: string | null;
  subtitle: string | null;
  date: string;
  exactAnniversary: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");
const snippet = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > 90 ? `${t.slice(0, 90).trimEnd()}…` : t;
};

/**
 * 작년 회상 배너/카드.
 * 정확히 1년 전 오늘 기록을 최우선으로, 없으면 작년 전체 방문·추억 중
 * 오늘의 월/일과 날짜 차이가 가장 작은 기록을 선택한다.
 *
 * variant "home"  = 홈 상단 가로 배너 (짙은 녹회색)
 * variant "recap" = 우리의 기록 카드 (티일 채움, 큰 문장 + CTA — 핸드오프 §7)
 */
export function OnThisMonthBanner({
  variant = "home",
}: {
  variant?: "home" | "recap";
}) {
  const [recall, setRecall] = useState<Recall | null>(null);

  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear() - 1;
    const m = now.getMonth(); // 0-11
    // 2월 29일처럼 작년에 같은 날짜가 없으면 그 달의 마지막 날을 기준점으로 삼는다.
    const targetDay = Math.min(now.getDate(), new Date(y, m + 1, 0).getDate());
    const target = `${y}-${pad(m + 1)}-${pad(targetDay)}`;
    const first = `${y}-01-01`;
    const last = `${y}-12-31`;

    let cancelled = false;
    (async () => {
      const [visitRes, memRes] = await Promise.all([
        supabase
          .from("places")
          .select("id, name, description, image_url, first_visit_date")
          .eq("status", "visited")
          .gte("first_visit_date", first)
          .lte("first_visit_date", last),
        supabase
          .from("memories")
          .select("date, content, places(id, name, description, image_url)")
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
        date: string;
      };
      const byPlaceAndDate = new Map<string, Cand>();

      for (const p of (visitRes.data ?? []) as {
        id: number;
        name: string;
        description: string | null;
        image_url: string | null;
        first_visit_date: string;
      }[]) {
        const key = `${p.id}:${p.first_visit_date}`;
        if (!byPlaceAndDate.has(key))
          byPlaceAndDate.set(key, {
            id: p.id,
            name: p.name,
            description: p.description,
            image_url: p.image_url,
            memoryContent: null,
            date: p.first_visit_date,
          });
      }
      for (const row of (memRes.data ?? []) as unknown as {
        date: string;
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
        const key = `${pl.id}:${row.date}`;
        const cur = byPlaceAndDate.get(key);
        if (!cur) {
          byPlaceAndDate.set(key, {
            id: pl.id,
            name: pl.name,
            description: pl.description,
            image_url: pl.image_url,
            memoryContent: row.content?.trim() || null,
            date: row.date,
          });
        } else if (!cur.memoryContent && row.content?.trim()) {
          cur.memoryContent = row.content.trim();
        }
      }

      const targetTime = Date.parse(`${target}T00:00:00Z`);
      const list = [...byPlaceAndDate.values()].sort((a, b) => {
        const distanceA = Math.abs(Date.parse(`${a.date}T00:00:00Z`) - targetTime);
        const distanceB = Math.abs(Date.parse(`${b.date}T00:00:00Z`) - targetTime);
        if (distanceA !== distanceB) return distanceA - distanceB;
        // 같은 거리라면 회상 카드가 풍부한 기록을 우선한다.
        const richnessA =
          Number(!!a.image_url) * 2 +
          Number(!!a.memoryContent) * 2 +
          Number(!!a.description);
        const richnessB =
          Number(!!b.image_url) * 2 +
          Number(!!b.memoryContent) * 2 +
          Number(!!b.description);
        if (richnessA !== richnessB) return richnessB - richnessA;
        return a.id - b.id;
      });
      if (list.length === 0) {
        setRecall(null);
        return;
      }

      const chosen = list[0];

      setRecall({
        id: chosen.id,
        name: chosen.name,
        image_url: chosen.image_url,
        date: chosen.date,
        exactAnniversary: chosen.date === target,
        subtitle: chosen.memoryContent
          ? snippet(chosen.memoryContent)
          : chosen.description?.trim()
            ? snippet(chosen.description)
            : null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!recall) return null;

  const recap = variant === "recap";
  const solid = recap ? "#36585a" : "#2f3d3d"; // 티일 채움 vs 짙은 녹회색
  const [, month, day] = recall.date.split("-").map(Number);
  const dateLabel = `작년 ${month}월 ${day}일`;
  const headlineLabel = recall.exactAnniversary ? "작년 이날" : "작년 이맘때";

  return (
    <Link
      href={`/places/${recall.id}`}
      className={`group relative block overflow-hidden rounded-[20px] text-[#eff4f1] ring-1 ring-black/10 ${
        recap ? "h-full" : "mb-5"
      }`}
      style={{ background: solid }}
    >
      {recall.image_url && (
        <>

          <PhotoImage
            src={recall.image_url}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover opacity-35"
          />
          <div
            className="absolute inset-0"
            style={{ background: `${solid}bf` }}
          />
        </>
      )}
      <div
        className={`relative flex flex-col ${
          recap ? "h-full gap-2 px-7 py-7" : "gap-1.5 px-6 py-5 sm:px-8 sm:py-6"
        }`}
      >
        <span className="text-[11px] font-bold tracking-[0.08em] text-white/60">
          {dateLabel}
        </span>
        <p
          className={
            recap
              ? "text-[28px] font-extrabold leading-[1.35]"
              : "text-lg font-extrabold leading-snug sm:text-xl"
          }
        >
          {headlineLabel}, 둘은 {recall.name}에 있었어요.
        </p>
        {recall.subtitle && (
          <p
            className={`line-clamp-2 leading-relaxed text-white/75 ${
              recap ? "text-sm" : "text-[13px]"
            }`}
          >
            {recall.subtitle}
          </p>
        )}
        <span
          className={`inline-flex w-fit items-center gap-1 rounded-full bg-[#fffcf5] px-3.5 py-1.5 text-xs font-bold transition-transform group-hover:translate-x-0.5 ${
            recap ? "mt-4 text-[#36585a]" : "mt-1.5 text-[#2f3d3d]"
          }`}
        >
          그날 보러 가기 →
        </span>
      </div>
    </Link>
  );
}
