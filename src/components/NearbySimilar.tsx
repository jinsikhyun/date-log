"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { ensureKakaoLoaded, geocode } from "@/lib/kakao";
import { haversineKm } from "@/lib/courses";
import type { Place } from "@/lib/places";
import { useCategories } from "@/components/CategoriesProvider";

type Coord = { lat: number; lng: number };
type OurRow = { id: number; name: string; category: string; km: number | null };

const OUR_MAX = 3; // "우리 리스트에서" 는 2~3개만
const OUR_WITHIN_KM = 2; // 2km 이내만
const KAKAO_MAX = 5; // "아직 안 가본 곳 발견" 은 5개
const KAKAO_RADIUS = 2000; // 카카오 주변 검색 반경 (m) — 1km → 2km 로 넓힘

// 우리 카테고리 → 카카오 category_group_code (딱 맞는 코드가 있는 것만).
// 나머지(술집/바/사진/전시/기타)는 코드가 없어 keywordSearch 로 fallback.
const KAKAO_CATEGORY_CODE: Record<string, string> = {
  맛집: "FD6", // 음식점
  카페: "CE7", // 카페
};

/** 미터 → "350m" / "1.2km" */
function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/**
 * 장소 상세 하단의 "근처 다른 곳 보기" — 기본 접힘.
 * 처음 펼칠 때 딱 한 번: 우리 DB 같은 카테고리 거리순 + 카카오 주변 검색 실행.
 */
export function NearbySimilar({ place }: { place: Place }) {
  const { styleOf } = useCategories();
  const [open, setOpen] = useState(false);
  const loadedRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ourNearby, setOurNearby] = useState<OurRow[] | null>(null);
  const [discovered, setDiscovered] = useState<
    kakao.maps.services.PlacesSearchResultItem[] | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base: Coord | null =
        place.lat != null && place.lng != null
          ? { lat: place.lat, lng: place.lng }
          : await geocode(place.address).catch(() => null);

      // ── 1) 우리 리스트에서 — 같은 카테고리, 본인 제외, 거리순 ──
      const { data: sameCat } = await supabase
        .from("places")
        .select("id, name, category, address, lat, lng")
        .eq("category", place.category)
        .neq("id", place.id);

      const rows: OurRow[] = [];
      for (const p of sameCat ?? []) {
        let km: number | null = null;
        if (base) {
          const c =
            p.lat != null && p.lng != null
              ? { lat: p.lat, lng: p.lng }
              : await geocode(p.address).catch(() => null);
          if (c) km = haversineKm(base, c);
        }
        rows.push({ id: p.id, name: p.name, category: p.category, km });
      }
      rows.sort((a, b) => {
        if (a.km == null && b.km == null) return 0;
        if (a.km == null) return 1;
        if (b.km == null) return -1;
        return a.km - b.km;
      });
      // 이 장소 좌표가 있으면 2km 이내만, 없으면 거리 필터 불가라 그냥 상위 몇 개
      const near = base
        ? rows.filter((r) => r.km != null && r.km <= OUR_WITHIN_KM)
        : rows;
      setOurNearby(near.slice(0, OUR_MAX));

      // ── 2) 아직 안 가본 곳 발견 — 카카오 주변 2km 검색 (좌표 있을 때만) ──
      const basePos = base;
      const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
      if (!basePos || !appKey) {
        setDiscovered([]);
      } else {
        await ensureKakaoLoaded(appKey);
        const { kakao } = window;

        // 우리 DB 에 이미 있는 곳(이름+주소)은 제외
        const { data: mine } = await supabase
          .from("places")
          .select("name, address");
        const ourNames = new Set((mine ?? []).map((x) => norm(x.name)));
        const ourNameAddr = new Set(
          (mine ?? []).map((x) => `${norm(x.name)}|${norm(x.address ?? "")}`),
        );
        const isOurs = (r: kakao.maps.services.PlacesSearchResultItem) => {
          const n = norm(r.place_name);
          if (ourNames.has(n)) return true;
          const addr = norm(r.road_address_name || r.address_name || "");
          return ourNameAddr.has(`${n}|${addr}`);
        };

        const svc = new kakao.maps.services.Places();
        const opts = {
          location: new kakao.maps.LatLng(basePos.lat, basePos.lng),
          radius: KAKAO_RADIUS,
          sort: kakao.maps.services.SortBy.DISTANCE, // 현재 장소에서 가까운 순
          size: 15,
        } as const;

        const code = KAKAO_CATEGORY_CODE[place.category];
        const results = await new Promise<
          kakao.maps.services.PlacesSearchResultItem[]
        >((resolve) => {
          const cb = (
            data: kakao.maps.services.PlacesSearchResultItem[],
            status: string,
          ) => resolve(status === kakao.maps.services.Status.OK ? data : []);
          if (code) {
            // 맛집(FD6)/카페(CE7): 정확한 카테고리 코드로
            svc.categorySearch(code, cb, opts);
          } else {
            // 그 외: 기존 키워드 방식 유지
            svc.keywordSearch(place.category, cb, opts);
          }
        });

        setDiscovered(results.filter((r) => !isOurs(r)).slice(0, KAKAO_MAX));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "추천을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [place]);

  const toggle = () => {
    setOpen((o) => !o);
    if (!loadedRef.current) {
      loadedRef.current = true;
      void load();
    }
  };

  return (
    <section>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-2xl bg-card px-5 py-3 text-sm font-medium text-muted ring-1 ring-border/70 transition-colors hover:text-accent"
      >
        <span>근처 다른 곳 보기</span>
        <span
          aria-hidden
          className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-6 rounded-2xl bg-card p-5 ring-1 ring-border/70">
          {loading && (
            <p className="text-xs text-muted">근처 장소 찾는 중…</p>
          )}
          {error && (
            <p className="text-sm font-medium text-red-600">{error}</p>
          )}

          {/* 우리 리스트에서 */}
          <div>
            <h3 className="mb-2 text-sm font-bold">우리 리스트에서</h3>
            {ourNearby && ourNearby.length === 0 ? (
              <p className="text-xs text-muted">
                2km 안에 같은 카테고리의 다른 장소가 없어요.
              </p>
            ) : (
              ourNearby && (
                <ul className="space-y-1">
                  {ourNearby.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/places/${p.id}`}
                        className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm transition-colors hover:bg-stone-50"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {p.name}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${styleOf(
                            p.category,
                          )}`}
                        >
                          {p.category}
                        </span>
                        {p.km != null && (
                          <span className="shrink-0 text-xs text-muted">
                            {fmtDist(p.km * 1000)}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>

          {/* 아직 안 가본 곳 발견 */}
          <div>
            <h3 className="mb-2 text-sm font-bold">아직 안 가본 곳 발견</h3>
            {discovered && discovered.length === 0 ? (
              <p className="text-xs text-muted">
                주변 1km 안에서 새로 찾은 곳이 없어요.
              </p>
            ) : (
              discovered && (
                <ul className="space-y-1">
                  {discovered.map((r) => (
                    <li key={r.id}>
                      <a
                        href={r.place_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm transition-colors hover:bg-stone-50"
                      >
                        <span className="shrink-0 truncate font-medium">
                          {r.place_name}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-muted">
                          {r.road_address_name || r.address_name}
                        </span>
                        {r.distance && (
                          <span className="shrink-0 text-xs text-muted">
                            {fmtDist(Number(r.distance))}
                          </span>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
        </div>
      )}
    </section>
  );
}
