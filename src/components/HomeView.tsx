"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PlaceCard } from "@/components/PlaceCard";
import { useCourseSelection } from "@/components/CourseSelection";
import { AddPlaceForm, blankPlaceInput, type NewPlaceInput } from "@/components/AddPlaceForm";
import { useAuth } from "@/components/AuthProvider";
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
import { PlaceSearchBox } from "@/components/PlaceSearchBox";
import { MapSearchPanel } from "@/components/MapSearchPanel";
import { matchesQuery, matchRank } from "@/lib/placeSearch";
import {
  type KakaoCandidate,
  searchKeyword,
  searchNearby,
  splitCandidates,
} from "@/lib/kakaoSearch";
import { normalizeVisitedCategory } from "@/lib/categories";
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

type MapSelection =
  | { kind: "place"; place: Place }
  | { kind: "candidate"; candidate: KakaoCandidate };

/** 미터 → "350m" / "1.2km" */
function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

/** bounds 의 기하학적 중심(두 꼭짓점 평균) — 카카오 LatLngBounds 엔 getCenter() 가 없다. */
function boundsCenter(bounds: kakao.maps.LatLngBounds): { lat: number; lng: number } {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return { lat: (sw.getLat() + ne.getLat()) / 2, lng: (sw.getLng() + ne.getLng()) / 2 };
}

/** 오늘 날짜(로컬 타임존) — YYYY-MM-DD */
function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

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
  const courseSelection = useCourseSelection();
  const anniversaries = useAnniversaries();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { orderNames, categories: officialCategories } = useCategories();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  // 검색 결과 없음 → "이 이름으로 장소 추가" 진입 시에만 채워짐. 일반 "장소 추가"는 빈 폼.
  const [prefillName, setPrefillName] = useState("");
  // 카테고리(주 필터)와 AND 로 결합되는 보조 필터. URL 이 아닌 로컬 상태.
  const [favFilter, setFavFilter] = useState<FavoriteFilter>(EMPTY_FAVORITE_FILTER);
  const [query, setQuery] = useState("");
  const { authorName, user } = useAuth();
  const myId = user?.id ?? null;

  // 지도 검색 (지도 뷰 전용) — 엔터/"다시 검색"에만 카카오를 부른다.
  const [mapQuery, setMapQuery] = useState(""); // 지도 전용 검색어
  const [searching, setSearching] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<KakaoCandidate[]>([]);
  const [mapBounds, setMapBounds] = useState<kakao.maps.LatLngBounds | null>(null);
  const [staleBounds, setStaleBounds] = useState(false);
  const [outOfBounds, setOutOfBounds] = useState(false);
  // 마커/목록 클릭으로 선택된 항목 — 지도 아래 카드에 표시.
  const [selected, setSelected] = useState<MapSelection | null>(null);
  const [cardSaving, setCardSaving] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

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
      )
        .filter((p) => matchesFavoriteFilter(p, favFilter))
        .filter((p) => matchesQuery(p, query)),
    [places, effectiveCategory, favFilter, query],
  );

  const filtered =
    effectiveCategory != null || favoriteFilterActive(favFilter) || query.trim() !== "";

  // 지도 검색 — 우리 장소 매칭/흐림은 카카오 응답과 무관하게 로컬 텍스트 검색(matchesQuery)으로
  // 즉시(타이핑마다) 갈라진다. 카카오는 candidates(새 후보)를 찾는 데만 쓰인다.
  const matched = useMemo(() => {
    const q = mapQuery.trim();
    if (!q) return visiblePlaces;
    return places
      .filter((p) => matchesQuery(p, q))
      .sort((a, b) => matchRank(a, q) - matchRank(b, q))
      .slice(0, 8); // 리스트가 화면을 다 먹지 않게
  }, [places, visiblePlaces, mapQuery]);
  const dimmed = useMemo(
    () => (mapQuery.trim() ? places.filter((p) => !matchesQuery(p, mapQuery)) : []),
    [places, mapQuery],
  );
  // 검색 결과(후보)가 있거나 검색어가 있으면 "검색 모드"(마커 클릭 → 상세 이동, NearbyPanel 숨김)를 켠다.
  const mapSearchOn = mapQuery.trim() !== "" || candidates.length > 0;

  // 지도 bounds 변경(최초 로드 포함) 때마다 최신 값을 받아둔다.
  // 이미 한 번이라도 bounds 를 받은 뒤의 변경은 "사용자가 팬·줌했다"는 뜻이라 다시 검색 버튼을 보여준다.
  // — 검색을 한 번도 안 했어도(예: "내 위치" 눌러서 지도만 움직인 경우) 뜬다: 이게 새 UI 없이
  //   "주변 둘러보기"로 들어가는 유일한 통로다. focusLat/Lng 로 인한 panTo 는 KakaoMap 이 자체적으로 무시한다.
  const handleBoundsChanged = useCallback((bounds: kakao.maps.LatLngBounds) => {
    setMapBounds((prev) => {
      if (prev) setStaleBounds(true);
      return bounds;
    });
  }, []);

  // 검색창 제출("Enter") 전용 — 키워드 검색만 하고, 2자 미만이면 아무것도 안 한다.
  const runMapSearch = useCallback(async () => {
    const q = mapQuery.trim();
    if (q.length < 2 || !mapBounds) return;
    setSearching(true);
    setMapError(null);
    try {
      const center = userPos ?? boundsCenter(mapBounds);
      const { items, outOfBounds: oob } = await searchKeyword(q, { bounds: mapBounds, center });
      // 카테고리/취향/텍스트 필터로 지도에 안 보이는 장소여도 "이미 저장됨"은
      // 우리 전체 목록(places) 기준으로 판단한다 — 필터 때문에 중복으로 뜨면 안 되니까.
      setCandidates(splitCandidates(items, places).fresh);
      setOutOfBounds(oob);
      setStaleBounds(false);
    } catch (e) {
      setMapError(e instanceof Error ? e.message : "검색에 실패했어요.");
    } finally {
      setSearching(false);
    }
  }, [mapQuery, mapBounds, userPos, places]);

  // "이 지역에서 다시 검색"/"이 근처 둘러보기" 버튼 전용 — 검색어가 있으면 키워드,
  // 없으면 주변 맛집·카페(searchNearby)를 부른다. "주변 검색" 기능은 이 경로로만 들어간다.
  const searchThisArea = useCallback(async () => {
    if (!mapBounds) return;
    setSearching(true);
    setMapError(null);
    try {
      const center = userPos ?? boundsCenter(mapBounds);
      const q = mapQuery.trim();
      if (q.length >= 2) {
        const { items, outOfBounds: oob } = await searchKeyword(q, { bounds: mapBounds, center });
        setCandidates(splitCandidates(items, places).fresh);
        setOutOfBounds(oob);
      } else {
        const items = await searchNearby(center);
        setCandidates(splitCandidates(items, places).fresh);
        setOutOfBounds(false);
      }
      setStaleBounds(false);
    } catch (e) {
      setMapError(e instanceof Error ? e.message : "검색에 실패했어요.");
    } finally {
      setSearching(false);
    }
  }, [mapQuery, mapBounds, userPos, places]);

  const handleSelectPlace = useCallback(
    (place: Place) => setSelected({ kind: "place", place }),
    [],
  );
  const handleSelectCandidate = useCallback(
    (candidate: KakaoCandidate) => setSelected({ kind: "candidate", candidate }),
    [],
  );

  // 카카오 후보 저장 — 지도 검색 패널의 인라인 "추가"와 지도 아래 선택 카드가 공유한다.
  // 실패하면 던진다: 패널은 행을 펼친 채로 오류를 보여주고, 카드는 자체 에러 상태로 보여준다.
  const addCandidate = useCallback(
    async (c: KakaoCandidate, status: "visited" | "wishlist") => {
      if (!authorName || !myId) {
        throw new Error("프로필 이름이 없어요. 설정에서 이름을 먼저 정해 주세요.");
      }
      const row = {
        name: c.name,
        category: normalizeVisitedCategory(c.category, officialCategories.map((cat) => cat.name)),
        address: c.address,
        kakao_map_link: c.kakaoMapUrl,
        naver_map_link: null,
        lat: c.lat,
        lng: c.lng,
        status,
        first_visit_date: status === "visited" ? today() : null,
        wanted_by_ids: status === "wishlist" ? [myId] : [],
        added_by: authorName,
        tags: [],
      };
      const { data, error } = await supabase
        .from("places")
        .insert(row)
        .select(PLACE_COLUMNS)
        .single();
      if (error) {
        throw new Error(
          error.code === "23505"
            ? "이미 같은 이름·주소의 장소가 우리 목록에 있어요."
            : "저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
        );
      }
      const saved = withPreferences(data as unknown as Place);
      if (status === "visited") setPlaces((prev) => [saved, ...prev]);
      // 후보 목록에서 즉시 제거 → 중복 클릭 방지
      setCandidates((prev) => prev.filter((x) => x.kakaoId !== c.kakaoId));
    },
    [authorName, myId, officialCategories],
  );

  // 지도 아래 선택 카드 전용 추가 핸들러 — 패널의 handleAdd 와 동일한 패턴(자체 로딩/에러).
  const handleCardAdd = async (status: "visited" | "wishlist") => {
    if (!selected || selected.kind !== "candidate") return;
    setCardSaving(true);
    setCardError(null);
    try {
      await addCandidate(selected.candidate, status);
      setSelected(null);
    } catch (e) {
      setCardError(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      setCardSaving(false);
    }
  };

  const focusLat =
    selected?.kind === "place" ? selected.place.lat ?? null
    : selected?.kind === "candidate" ? selected.candidate.lat
    : null;
  const focusLng =
    selected?.kind === "place" ? selected.place.lng ?? null
    : selected?.kind === "candidate" ? selected.candidate.lng
    : null;
  const focusedPlaceId = selected?.kind === "place" ? selected.place.id : null;
  const focusedCandidateId = selected?.kind === "candidate" ? selected.candidate.kakaoId : null;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-stretch justify-between gap-4 sm:items-end">
        <div className="w-full sm:w-auto">
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
            우리가 다녀온 곳
          </h1>
          <p className="mt-1 text-sm text-muted-2">
            {loading
              ? "불러오는 중…"
              : filtered
                ? `${visiblePlaces.length}곳 · 전체 ${places.length}곳`
                : `지금까지 ${places.length}곳 · 함께 만든 추억 ${totalMemories}개`}
          </p>
        </div>

        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 sm:flex sm:w-auto">
          <div className="grid min-w-0 grid-cols-2 rounded-full bg-card p-1 ring-1 ring-border">
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
                className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium transition-colors sm:px-4 sm:py-1.5 sm:text-sm ${
                  view === mode
                    ? "bg-accent text-white shadow-sm"
                    : "text-muted hover:text-accent"
                }`}
              >
                {labelText}
              </button>
            ))}
          </div>

          <span className="shrink-0"><PlaceSearchBox value={query} onChange={setQuery} /></span>
          <span className="shrink-0" onClick={() => { if (!courseSelection.active) setParams({ view: "feed" }); }}>{courseSelection.trigger}</span>
          <button
            type="button"
            onClick={() => { setPrefillName(""); setShowForm((v) => !v); }}
            className="shrink-0 whitespace-nowrap rounded-full bg-foreground px-4 py-2.5 text-xs font-semibold text-background transition-colors hover:bg-ink-hover sm:px-5 sm:py-[11px] sm:text-sm"
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
        <AddPlaceForm
          key={prefillName}
          initial={prefillName ? blankPlaceInput(prefillName) : undefined}
          onSubmit={handleAdd}
          onCancel={() => setShowForm(false)}
        />
      )}

      {courseSelection.toolbar}

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
          <div className="py-16 text-center">
            <p className="text-sm text-muted">
              {query.trim()
                ? `‘${query.trim()}’ 와 맞는 곳이 없어요.`
                : favoriteFilterActive(favFilter)
                  ? "이 조건에 맞는 장소가 없어요."
                  : `‘${effectiveCategory}’ 카테고리에 아직 장소가 없어요.`}
            </p>
            {query.trim() && (
              <button
                type="button"
                onClick={() => { setPrefillName(query.trim()); setShowForm(true); }}
                className="mt-3 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-ink-hover"
              >
                이 이름으로 장소 추가
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visiblePlaces.map((place) => (
              <div key={place.id} className="relative h-full">
              {courseSelection.selector(place.id, place.name)}
              <div inert={courseSelection.active} className="h-full">
              <PlaceCard
                place={place}
                visitAnniversaries={anniversariesOn(anniversaries, place.first_visit_date)}
              />
              </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <section aria-label="지도로 보기">
          <MapSearchPanel
            query={mapQuery}
            onQueryChange={setMapQuery}
            onSubmit={() => void runMapSearch()}
            loading={searching}
            savedResults={matched}
            candidates={candidates}
            outOfBounds={outOfBounds}
            staleArea={staleBounds}
            onSearchArea={() => void searchThisArea()}
            onSelectPlace={handleSelectPlace}
            onSelectCandidate={handleSelectCandidate}
            onAddCandidate={addCandidate}
          />

          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background disabled:opacity-60"
            >
              {locating ? "위치 찾는 중…" : userPos ? "📍 내 위치 새로고침" : "📍 내 위치"}
            </button>
            {geoError && (
              <span className="text-xs font-medium text-red-600">
                {geoError}
              </span>
            )}
          </div>

          {mapError && (
            <p className="mb-2 text-xs font-medium text-red-600">{mapError}</p>
          )}

          <KakaoMap
            places={matched}
            dimmedPlaces={dimmed}
            candidates={candidates}
            userPos={userPos}
            onSelectPlace={mapSearchOn ? handleSelectPlace : undefined}
            onSelectCandidate={handleSelectCandidate}
            onBoundsChanged={handleBoundsChanged}
            fitBounds={mapQuery.trim() === "" && !selected}
            focusLat={focusLat}
            focusLng={focusLng}
            focusedPlaceId={focusedPlaceId}
            focusedCandidateId={focusedCandidateId}
          />

          {selected && (
            <div className="relative mt-3 rounded-2xl bg-card p-4 pr-9 ring-1 ring-border">
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="카드 닫기"
                className="absolute right-3 top-3 text-muted-2 transition-colors hover:text-accent"
              >
                ✕
              </button>
              {selected.kind === "place" ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{selected.place.name}</p>
                    <p className="truncate text-xs text-muted-2">
                      {selected.place.category} · {selected.place.address}
                    </p>
                  </div>
                  <Link
                    href={`/places/${selected.place.id}`}
                    className="shrink-0 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-colors hover:bg-ink-hover"
                  >
                    자세히 보기
                  </Link>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-bold">{selected.candidate.name}</p>
                  <p className="mt-0.5 text-xs text-muted-2">
                    {selected.candidate.category} · {selected.candidate.address}
                    {selected.candidate.distanceMeters != null &&
                      ` · ${fmtDist(selected.candidate.distanceMeters)}`}
                  </p>
                  {cardError && (
                    <p role="alert" className="mt-2 text-xs font-medium text-red-600">
                      {cardError}
                    </p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={cardSaving}
                      onClick={() => void handleCardAdd("visited")}
                      className="flex-1 rounded-full bg-accent px-3 py-2 text-xs font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
                    >
                      {cardSaving ? "추가 중…" : "다녀온 곳"}
                    </button>
                    <button
                      type="button"
                      disabled={cardSaving}
                      onClick={() => void handleCardAdd("wishlist")}
                      className="flex-1 rounded-full bg-background px-3 py-2 text-xs font-semibold text-muted-2 ring-1 ring-border transition hover:bg-accent-soft hover:text-accent disabled:opacity-50"
                    >
                      가고 싶은 곳
                    </button>
                  </div>
                  <a
                    href={selected.candidate.kakaoMapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs text-muted underline underline-offset-4 hover:text-accent"
                  >
                    카카오맵에서 보기 ↗
                  </a>
                </div>
              )}
            </div>
          )}

          {!mapSearchOn && (
            userPos ? (
              <NearbyPanel
                key={locateSeq}
                places={visiblePlaces}
                userPos={userPos}
                dismissed={popupDismissed}
                onDismiss={() => setPopupDismissed(true)}
              />
            ) : (
              <p className="mt-3 text-xs text-muted">
                위 검색창에서 새로 가보고 싶은 곳을 찾아 바로 추가해보세요. 마커를
                누르면 장소 이름과 카테고리가 표시돼요. “내 위치”를 누르면 가까운
                순으로 정렬하고 1km 이내에 장소가 있으면 추천 팝업을 띄워요.
              </p>
            )
          )}
        </section>
      )}
      {courseSelection.active && <div aria-hidden="true" className="h-20 lg:hidden" />}
    </>
  );
}
