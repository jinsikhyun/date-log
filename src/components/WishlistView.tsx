"use client";
import { useCourseSelection } from "@/components/CourseSelection";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import {
  type Place,
  categoryIcon,
  categoryStyle,
  naverImageSearchUrl,
  placeInputToRow,
  wantedByLabelFromIds,
} from "@/lib/places";
import { AddPlaceForm, blankPlaceInput, type NewPlaceInput } from "@/components/AddPlaceForm";
import { useAuth } from "@/components/AuthProvider";
import { useCategories } from "@/components/CategoriesProvider";
import { CategoryChips } from "@/components/CategoryChips";
import { PlaceSearchBox } from "@/components/PlaceSearchBox";
import { matchesQuery } from "@/lib/placeSearch";
import { normalizeVisitedCategory } from "@/lib/categories";
import { VisitMoodPrompt } from "@/components/VisitMoodPrompt";

import { withPreferences } from "@/lib/preferences";

const PLACE_COLUMNS =
  "id, name, category, address, naver_map_link, kakao_map_link, rating, first_visit_date, description, image_url, image_captured_date, lat, lng, status, wanted_by, wanted_by_ids, added_by, place_preferences(user_id, kind), is_regular, via_course, memory_count, created_at, tags";

const POLICY_HINT =
  "저장 권한이 없거나 세션이 만료됐어요. 다시 로그인하거나 커플 연결 상태를 확인해 주세요.";

export function WishlistView() {
  const courseSelection = useCourseSelection();
  const { coupleMembers, authorName } = useAuth();
  const { categories: officialCategories, orderNames } = useCategories();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // 검색 결과 없음 → "이 이름으로 추가" 진입 시에만 채워짐. 일반 "가고 싶은 곳 추가"는 빈 폼.
  const [prefillName, setPrefillName] = useState("");
  const [convertingId, setConvertingId] = useState<number | null>(null);
  const [converted, setConverted] = useState<Place | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [moodSaving, setMoodSaving] = useState(false);
  // 주 필터: 카테고리 탭 (null = 전체). 보조 필터: "{이름} wish" 칩 (여러 개 = OR).
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [wishFilterIds, setWishFilterIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const wishMembers = coupleMembers.filter((m) => m.display_name?.trim());

  const categories = useMemo(
    () => orderNames(places.map((p) => p.category)),
    [places, orderNames],
  );
  const effectiveCat =
    catFilter && categories.includes(catFilter) ? catFilter : null;

  const visible = useMemo(
    () =>
      places
        .filter((p) => !effectiveCat || p.category === effectiveCat)
        .filter(
          (p) =>
            wishFilterIds.length === 0 ||
            wishFilterIds.some((id) => (p.wanted_by_ids ?? []).includes(id)),
        )
        .filter((p) => matchesQuery(p, query)),
    [places, effectiveCat, wishFilterIds, query],
  );

  const filtered =
    effectiveCat !== null || wishFilterIds.length > 0 || query.trim() !== "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("places")
        .select(PLACE_COLUMNS)
        .eq("status", "wishlist")
        .eq("via_course", false) // 코스 미니폼으로 만든 곳은 여기 안 보임
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("[wishlist] 조회 실패:", error);
        const missingCol = /column .*(status|wanted_by_ids).* does not exist/i.test(
          error.message,
        );
        const missingTagsCol = /column .*tags.* does not exist/i.test(error.message);
        setLoadError(
          missingTagsCol
            ? "tags 컬럼이 아직 없어요. supabase/add-place-tags.sql 을 Supabase SQL Editor에서 실행하세요."
            : missingCol
              ? "필요한 컬럼이 아직 없어요. supabase/migrate-wanted-by-to-ids.sql 을 Supabase SQL Editor 에서 실행하세요."
              : `가고 싶은 곳을 불러오지 못했어요: ${error.message}`,
        );
      } else {
        setPlaces(((data ?? []) as unknown as Place[]).map(withPreferences));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // "+ 가고 싶은 곳 추가"
  const handleAdd = useCallback(async (input: NewPlaceInput) => {
    const { data, error } = await supabase
      .from("places")
      .insert(placeInputToRow(input))
      .select(PLACE_COLUMNS)
      .single();
    if (error) {
      throw new Error(
        error.code === "23505"
          ? "이미 같은 이름·주소의 장소가 우리 목록에 있어요."
          : error.message,
      );
    }

    const saved = withPreferences(data as unknown as Place);
    setAdding(false);
    if (saved.status === "wishlist") {
      setPlaces((prev) => [saved, ...prev]);
    }
  }, []);

  // "다녀왔어요" — 입력 폼 없이 오늘 날짜의 공동 방문 기록으로 즉시 전환.
  const handleVisited = useCallback(
    async (place: Place) => {
      setConvertingId(place.id);
      setConvertError(null);
      const visitedCategory = normalizeVisitedCategory(
        place.category,
        officialCategories.map((category) => category.name),
      );
      const now = new Date();
      const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
      const visitDate = local.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from("places")
        .update({
          status: "visited",
          first_visit_date: visitDate,
          category: visitedCategory,
          wanted_by_ids: [],
        })
        .eq("id", place.id)
        .select(PLACE_COLUMNS);
      setConvertingId(null);
      if (error) {
        setConvertError(`전환하지 못했어요: ${error.message}`);
        return;
      }
      if (!data || data.length === 0) {
        setConvertError(`저장이 반영되지 않았어요. ${POLICY_HINT}`);
        return;
      }

      const saved = withPreferences(data[0] as unknown as Place);
      setPlaces((prev) => prev.filter((item) => item.id !== saved.id));
      setConverted(saved);
    },
    [officialCategories],
  );

  const saveMood = async (mood: string) => {
    if (!converted || !authorName) return;
    setMoodSaving(true);
    const { error } = await supabase.from("memories").insert({
      place_id: converted.id,
      date: converted.first_visit_date,
      content: "",
      mood_tag: mood,
      author: authorName,
      photo_urls: [],
    });
    setMoodSaving(false);
    if (error) {
      setConvertError(`느낌을 저장하지 못했어요: ${error.message}`);
      return;
    }
    setConverted(null);
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-stretch justify-between gap-4 sm:items-end">
        <div className="w-full sm:w-auto">
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
            가고 싶은 곳
          </h1>
          <p className="mt-1 text-sm text-muted-2">
            {loading
              ? "불러오는 중…"
              : filtered
                ? `${visible.length}곳 · 전체 ${places.length}곳`
                : `위시리스트 ${places.length}곳`}
          </p>
        </div>
        <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
        <PlaceSearchBox value={query} onChange={setQuery} />
        {courseSelection.trigger}
        <button
          type="button"
          onClick={() => { setPrefillName(""); setAdding((v) => !v); }}
          className="whitespace-nowrap rounded-full bg-foreground px-4 py-2.5 text-xs font-semibold text-background transition-colors hover:bg-ink-hover sm:px-5 sm:py-[11px] sm:text-sm"
        >
          {adding ? "폼 닫기" : "가고 싶은 곳 추가"}
        </button>
        </div>
      </div>

      {adding && (
        <AddPlaceForm
          key={prefillName}
          initialStatus="wishlist"
          initial={prefillName ? blankPlaceInput(prefillName, "wishlist") : undefined}
          submitLabel="위시리스트에 저장"
          onSubmit={handleAdd}
          onCancel={() => setAdding(false)}
        />
      )}

      {converted && (
        <div className="mb-6">
          <VisitMoodPrompt
            placeId={converted.id}
            placeName={converted.name}
            busy={moodSaving}
            onMood={(mood) => void saveMood(mood)}
            onClose={() => setConverted(null)}
          />
        </div>
      )}

      {convertError && (
        <div className="mb-6 rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
          {convertError}
        </div>
      )}

      {loadError && (
        <div className="mb-6 rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
          {loadError}
        </div>
      )}

      {!loading && places.length > 0 && (
        <>
          {/* 주 필터: 카테고리 칩 (홈과 동일) */}
          <CategoryChips
            className="mb-3"
            categories={categories}
            active={effectiveCat}
            onSelect={setCatFilter}
          />

          {/* 보조 필터: "누가" wish 작은 칩 (여러 개 = OR, 카테고리와는 AND) */}
          {wishMembers.length > 0 && (
            <div className="mb-5 -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pt-1 pb-1">
              <span className="shrink-0 pr-0.5 text-[11px] font-medium text-muted-3">
                누가
              </span>
              {wishMembers.map((m) => {
                const on = wishFilterIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setWishFilterIds((cur) =>
                        on ? cur.filter((x) => x !== m.id) : [...cur, m.id],
                      )
                    }
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 transition-colors ${
                      on
                        ? "bg-accent-soft text-accent ring-accent/30"
                        : "bg-transparent text-muted-2 ring-border hover:text-accent"
                    }`}
                  >
                    {m.display_name}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {courseSelection.toolbar}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-[20px] bg-[#efe7d6]"
            />
          ))}
        </div>
      ) : places.length === 0 && !loadError ? (
        <p className="rounded-[20px] bg-card p-12 text-center text-sm text-muted-2 ring-1 ring-border">
          아직 가고 싶은 곳이 없어요. “장소 추가”에서 <b>가고 싶은 곳</b>으로
          담아보세요.
        </p>
      ) : visible.length === 0 ? (
        <div className="rounded-[20px] bg-card p-12 text-center ring-1 ring-border">
          <p className="text-sm text-muted-2">
            {query.trim()
              ? `‘${query.trim()}’ 와 맞는 곳이 없어요.`
              : "이 조건에 맞는 장소가 없어요."}
          </p>
          {query.trim() && (
            <button
              type="button"
              onClick={() => { setPrefillName(query.trim()); setAdding(true); }}
              className="mt-3 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-ink-hover"
            >
              이 이름으로 위시에 추가
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((place) => {
            const wishLabel = wantedByLabelFromIds(
              place.wanted_by_ids,
              coupleMembers,
            );
            return (
              <article
                key={place.id}
                className="relative flex h-full flex-col overflow-hidden rounded-[20px] border border-dashed border-border-dashed bg-card transition-colors hover:border-accent"
              >
                {/* 미방문 placeholder — 클릭 시 네이버 이미지 검색 (새 탭) */}
                {courseSelection.selector(place.id, place.name)}
                <div inert={courseSelection.active} className="flex h-full flex-col">
                <a
                  href={naverImageSearchUrl(place.name, place.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`${place.name} 네이버 이미지 검색`}
                  title="네이버 이미지 검색"
                  className="photo-placeholder relative flex h-36 cursor-pointer items-center justify-center transition hover:brightness-[0.98]"
                >
                  <span className="text-5xl opacity-70" aria-hidden>
                    {categoryIcon(place.category)}
                  </span>
                  <span
                    className={`absolute left-3.5 top-3.5 rounded-full px-3 py-1 text-[11px] font-semibold ${categoryStyle(
                      place.category,
                    )}`}
                  >
                    {place.category}
                  </span>
                </a>

                <div className="flex flex-1 flex-col gap-1.5 px-[18px] pb-[18px] pt-4">
                  <Link
                    href={`/places/${place.id}`}
                    className="text-[17px] font-bold leading-snug transition-colors hover:text-accent"
                  >
                    {place.name}
                  </Link>
                  <p className="truncate text-xs text-muted-2">{place.address}</p>
                  {wishLabel && (
                    <span className="mt-0.5 self-start rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent">
                      {wishLabel}
                    </span>
                  )}
                  <div className="mt-auto grid grid-cols-[1.25fr_0.75fr] gap-2 pt-3">
                    <button
                      type="button"
                      onClick={() => void handleVisited(place)}
                      disabled={convertingId != null}
                      className="flex h-9 items-center justify-center whitespace-nowrap rounded-full bg-accent px-3 text-[12px] font-bold text-white transition hover:brightness-95 disabled:opacity-50"
                    >
                      {convertingId === place.id ? "옮기는 중…" : "다녀왔어요 →"}
                    </button>
                    <Link
                      href={`/places/${place.id}`}
                      className="flex h-9 items-center justify-center whitespace-nowrap rounded-full bg-background px-3 text-[11px] font-semibold text-muted-2 transition hover:bg-accent-soft hover:text-accent"
                    >
                      수정·삭제
                    </Link>
                  </div>
                </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-xs text-muted-3">
        전환한 장소는{" "}
        <Link href="/" className="underline hover:text-accent">
          홈 “다녀온 곳”
        </Link>{" "}
        목록에서 볼 수 있어요.
      </p>
      {courseSelection.active && <div aria-hidden="true" className="h-20 lg:hidden" />}
    </>
  );
}
