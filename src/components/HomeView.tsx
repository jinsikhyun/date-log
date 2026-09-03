"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PlaceCard } from "@/components/PlaceCard";
import { AddPlaceForm, type NewPlaceInput } from "@/components/AddPlaceForm";
import { supabase } from "@/lib/supabase/client";
import {
  type Place,
  type FavoriteFilter,
  EMPTY_FAVORITE_FILTER,
  favoriteFilterActive,
  matchesFavoriteFilter,
  placeInputToRow,
} from "@/lib/places";
import { useCategories } from "@/components/CategoriesProvider";
import { CategoryChips } from "@/components/CategoryChips";
import { FavoriteFilterChips } from "@/components/FavoriteFilterChips";
import { NearbyPanel } from "@/components/NearbyPanel";
import { useAnniversaries } from "@/hooks/useAnniversaries";
import { anniversariesOn } from "@/lib/anniversaries";


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

import { withPreferences } from "@/lib/preferences";

const PLACE_COLUMNS =
  "id, name, category, address, naver_map_link, kakao_map_link, rating, first_visit_date, description, image_url, image_captured_date, lat, lng, status, wanted_by, wanted_by_ids, added_by, place_preferences(user_id, kind), is_regular, via_course, memory_count, created_at, tags";

// 목록 조회 시엔 memories(count) 를 임베딩해서 장소별 실제 추억 개수를 가져온다.
const PLACE_LIST_SELECT = `${PLACE_COLUMNS}, memories(count)`;

type PlaceListRow = Place & { memories?: { count: number }[] };

function withMemoryCount(row: PlaceListRow): Place {
  const { memories, ...rest } = row;
  return withPreferences({ ...rest, memory_count: memories?.[0]?.count ?? 0 });
}

export function HomeView() {
  const anniversaries = useAnniversaries();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { orderNames } = useCategories();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  // 카테고리(주 필터)와 AND 로 결합되는 보조 필터. URL 이 아닌 로컬 상태.
  const [favFilter, setFavFilter] = useState<FavoriteFilter>(EMPTY_FAVORITE_FILTER);

  // 뷰(피드/지도) + 카테고리 필터는 URL 쿼리에 둔다 → 로고(href="/") 클릭이 확실히 초기화됨
  const view: ViewMode = searchParams.get("view") === "map" ? "map" : "feed";
  const activeCategory = searchParams.get("cat"); // null = 전체

  const setParams = useCallback(
    (next: { view?: ViewMode | null; cat?: string | null }) => {
      const params = new URLSearchParams(searchParams.toString());
      if ("view" in next) {
        if (next.view === "map") params.set("view", "map");
        else params.delete("view");
      }
      if ("cat" in next) {
        if (next.cat) params.set("cat", next.cat);
        else params.delete("cat");
      }
      const qs = params.toString();
      router.push(qs ? `/?${qs}` : "/");
    },
    [router, searchParams],
  );

  // "내 위치" — 지도뷰 전용
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [popupDismissed, setPopupDismissed] = useState(false);
  const [locateSeq, setLocateSeq] = useState(0);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGeoError("이 브라우저는 위치를 지원하지 않아요.");
      return;
    }
    setGeoError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setPopupDismissed(false); // 다시 켜면 새로 판단
        setLocateSeq((n) => n + 1);
        setUserPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "위치 권한이 거부됐어요. 브라우저 설정에서 허용해 주세요."
            : "위치를 가져오지 못했어요.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, [setGeoError, setLocating, setPopupDismissed, setLocateSeq, setUserPos]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("places")
        .select(PLACE_LIST_SELECT)
        .eq("status", "visited") // 위시리스트는 홈에서 제외 (/wishlist 에서만)
        .order("first_visit_date", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error("[places] 조회 실패:", error);
        const missingTable =
          error.code === "PGRST205" || /does not exist/i.test(error.message);
        const missingTagsCol = /column .*tags.* does not exist/i.test(error.message);
        setLoadError(
          missingTagsCol
            ? "tags 컬럼이 아직 없어요. supabase/add-place-tags.sql 을 Supabase SQL Editor에서 실행하세요."
            : missingTable
              ? "places 테이블이 아직 없어요. supabase/schema.sql 을 Supabase SQL Editor에서 실행하세요."
              : `장소를 불러오지 못했어요: ${error.message}`,
        );
      } else {
        setPlaces(
          ((data ?? []) as unknown as PlaceListRow[]).map(withMemoryCount),
        );
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAdd = useCallback(
    async (input: NewPlaceInput) => {
      const { data, error } = await supabase
        .from("places")
        .insert(placeInputToRow(input))
        .select(PLACE_COLUMNS)
        .single();

      if (error) {
        console.error("[places] 추가 실패:", error);
        throw new Error(
          error.code === "23505"
            ? "이미 같은 이름·주소의 장소가 우리 목록에 있어요."
            : error.message,
        );
      }

      const saved = withPreferences(data as unknown as Place);
      setShowForm(false);

      if (saved.status === "wishlist") {
        // 홈 목록엔 안 들어가고 위시리스트로 이동
        router.push("/wishlist");
        return;
      }

      // 새로고침 없이 카드/지도에 즉시 반영
      setPlaces((prev) => [saved, ...prev]);
      router.push("/"); // 피드 + 전체 탭으로
    },
    [router],
  );

  const totalMemories = useMemo(
    () => places.reduce((sum, p) => sum + (p.memory_count ?? 0), 0),
    [places],
  );

  // 데이터에 실제로 존재하는 카테고리로만 탭을 만든다 (하드코딩 X)
  const categories = useMemo(
    () => orderNames(places.map((p) => p.category)),
    [places, orderNames],
  );

  // 활성 카테고리가 더 이상 데이터에 없으면 전체로 되돌린다
  const effectiveCategory =
    activeCategory && categories.includes(activeCategory) ? activeCategory : null;

  const visiblePlaces = useMemo(
    () =>
      (effectiveCategory
        ? places.filter((p) => p.category === effectiveCategory)
        : places
      ).filter((p) => matchesFavoriteFilter(p, favFilter)),
    [places, effectiveCategory, favFilter],
  );

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
            우리가 다녀온 곳
          </h1>
          <p className="mt-1 text-sm text-muted-2">
            {loading
              ? "불러오는 중…"
              : effectiveCategory || favoriteFilterActive(favFilter)
                ? `${visiblePlaces.length}곳 · 전체 ${places.length}곳`
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
                onClick={() => setParams({ view: mode })}
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
            className="rounded-full bg-foreground px-5 py-[11px] text-sm font-semibold text-background transition-colors hover:bg-ink-hover"
          >
            {showForm ? "폼 닫기" : "장소 추가"}
          </button>
        </div>
      </div>

      {!loading && places.length > 0 && (
        <CategoryChips
          className="mb-4"
          categories={categories}
          active={effectiveCategory}
          onSelect={(c) => setParams({ cat: c })}
        >
          <Link
            href="/categories"
            className="ml-1 shrink-0 self-center whitespace-nowrap text-xs font-medium text-muted transition-colors hover:text-accent"
          >
            카테고리 관리
          </Link>
        </CategoryChips>
      )}

      {!loading && places.length > 0 && (
        <FavoriteFilterChips value={favFilter} onChange={setFavFilter} />
      )}

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
        ) : visiblePlaces.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">
            {favoriteFilterActive(favFilter)
              ? "이 조건에 맞는 장소가 없어요."
              : `‘${effectiveCategory}’ 카테고리에 아직 장소가 없어요.`}
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visiblePlaces.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                visitAnniversaries={anniversariesOn(anniversaries, place.first_visit_date)}
              />
            ))}
          </div>
        )
      ) : (
        <section aria-label="지도로 보기">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="rounded-full bg-foreground px-4 py-1.5 text-sm font-semibold text-background disabled:opacity-60"
            >
              {locating ? "위치 찾는 중…" : userPos ? "📍 내 위치 새로고침" : "📍 내 위치"}
            </button>
            {geoError && (
              <span className="text-xs font-medium text-red-600">
                {geoError}
              </span>
            )}
          </div>

          <KakaoMap places={visiblePlaces} userPos={userPos} />

          {userPos ? (
            <NearbyPanel
              key={locateSeq}
              places={visiblePlaces}
              userPos={userPos}
              dismissed={popupDismissed}
              onDismiss={() => setPopupDismissed(true)}
            />
          ) : (
            <p className="mt-3 text-xs text-muted">
              마커를 누르면 장소 이름과 카테고리가 표시돼요. “내 위치”를 누르면
              가까운 순으로 정렬하고 1km 이내에 장소가 있으면 추천 팝업을 띄워요.
            </p>
          )}
        </section>
      )}
    </>
  );
}
