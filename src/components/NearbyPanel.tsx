"use client";

import PhotoImage from "@/components/PhotoImage";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { geocode } from "@/lib/kakao";
import { haversineKm, walkMinutes } from "@/lib/courses";
import type { Place } from "@/lib/places";
import { useCategories } from "@/components/CategoriesProvider";

type Coord = { lat: number; lng: number };
type Row = { place: Place; km: number };

const RECOMMEND_WITHIN_KM = 1;

/** 직선거리(km) → "350m" / "1.2km" */
function fmtDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

function Thumb({ place, size }: { place: Place; size: number }) {
  const { styleOf, iconOf } = useCategories();
  if (place.image_url) {
    return (

      <PhotoImage
        src={place.image_url}
        displayWidth={160}
        alt=""
        className="shrink-0 rounded-xl object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl ${styleOf(
        place.category,
      )}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
      aria-hidden
    >
      {iconOf(place.category)}
    </span>
  );
}

/** 다녀옴(실선) / 위시리스트(점선) 뱃지 — 지도 마커와 같은 시각 언어 */
function StatusPill({ status }: { status: string }) {
  const wishlist = status === "wishlist";
  return (
    <span
      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
        wishlist ? "border-accent text-accent" : "border-stone-400 text-stone-500"
      }`}
      style={{ borderStyle: wishlist ? "dashed" : "solid" }}
    >
      {wishlist ? "위시리스트" : "다녀옴"}
    </span>
  );
}

function CategoryTag({ category }: { category: string }) {
  const { styleOf } = useCategories();
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${styleOf(
        category,
      )}`}
    >
      {category}
    </span>
  );
}

export function NearbyPanel({
  places,
  userPos,
  dismissed,
  onDismiss,
}: {
  places: Place[];
  userPos: Coord;
  dismissed: boolean;
  onDismiss: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const coordCache = useRef<Map<number, Coord | null>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRows(null);
      const out: Row[] = [];
      for (const p of places) {
        let c = coordCache.current.get(p.id);
        if (c === undefined) {
          if (p.lat != null && p.lng != null) {
            c = { lat: p.lat, lng: p.lng };
          } else {
            try {
              c = await geocode(p.address);
            } catch {
              c = null;
            }
          }
          coordCache.current.set(p.id, c ?? null);
        }
        if (c) out.push({ place: p, km: haversineKm(userPos, c) });
      }
      if (!cancelled) setRows(out.sort((a, b) => a.km - b.km));
    })();
    return () => {
      cancelled = true;
    };
  }, [places, userPos]);

  const nearest = rows && rows.length > 0 ? rows[0] : null;
  const showPopup =
    !dismissed && nearest != null && nearest.km <= RECOMMEND_WITHIN_KM;

  return (
    <>
      {/* 추천 팝업 (화면 하단 토스트) */}
      {showPopup && nearest && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl bg-card p-3 shadow-xl ring-1 ring-border/70">
            <Thumb place={nearest.place} size={56} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-bold">
                  {nearest.place.name}
                </span>
                <CategoryTag category={nearest.place.category} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <StatusPill status={nearest.place.status} />
                <span>
                  {fmtDist(nearest.km)} · 도보 약 {walkMinutes(nearest.km)}분
                </span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <button
                type="button"
                onClick={onDismiss}
                aria-label="닫기"
                className="rounded-full px-1.5 text-sm font-bold text-stone-400 hover:text-stone-600"
              >
                ✕
              </button>
              <Link
                href={`/places/${nearest.place.id}`}
                className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white"
              >
                장소 보기
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 거리순 리스트 */}
      <div className="mt-3">
        {rows === null ? (
          <p className="py-6 text-center text-xs text-muted">
            내 위치에서 거리 계산 중…
          </p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">
            좌표를 찾은 장소가 없어요.
          </p>
        ) : (
          <ol className="space-y-2">
            {rows.map(({ place, km }) => (
              <li key={place.id}>
                <Link
                  href={`/places/${place.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-card p-3 ring-1 ring-border/70 transition-colors hover:ring-accent/40"
                >
                  <Thumb place={place} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">
                        {place.name}
                      </span>
                      <CategoryTag category={place.category} />
                      <StatusPill status={place.status} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {fmtDist(km)} · 도보 약 {walkMinutes(km)}분
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
