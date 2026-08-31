"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import {
  type Place,
  categoryStyle,
  placeInputToRow,
  wantedByLabel,
} from "@/lib/places";
import {
  AddPlaceForm,
  placeFormInput,
  type NewPlaceInput,
} from "@/components/AddPlaceForm";
import { CategoryIconTile } from "@/components/CategoryIconTile";

const PLACE_COLUMNS =
  "id, name, category, address, naver_map_link, kakao_map_link, rating, first_visit_date, description, image_url, lat, lng, status, wanted_by, added_by, via_course, memory_count, created_at";

const POLICY_HINT =
  "저장 권한이 없거나 세션이 만료됐어요. 다시 로그인하거나 커플 연결 상태를 확인해 주세요.";

export function WishlistView() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // "다녀왔어요" 전환용. 세부 수정·삭제는 장소 상세(/places/[id])에서.
  const [visiting, setVisiting] = useState<Place | null>(null);

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
        const missingCol = /column .*status.* does not exist/i.test(
          error.message,
        );
        setLoadError(
          missingCol
            ? "status 컬럼이 아직 없어요. supabase/add-wishlist-columns.sql 을 Supabase SQL Editor 에서 실행하세요."
            : `가고 싶은 곳을 불러오지 못했어요: ${error.message}`,
        );
      } else {
        setPlaces((data ?? []) as Place[]);
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

    const saved = data as Place;
    setAdding(false);
    if (saved.status === "wishlist") {
      setPlaces((prev) => [saved, ...prev]);
    }
  }, []);

  // "다녀왔어요" — 같은 행을 visited 로 전환
  const handleVisited = useCallback(
    async (input: NewPlaceInput) => {
      if (!visiting) return;
      const { data, error } = await supabase
        .from("places")
        .update(placeInputToRow(input))
        .eq("id", visiting.id)
        .select(PLACE_COLUMNS);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        throw new Error(`저장이 반영되지 않았어요. ${POLICY_HINT}`);
      }

      const saved = data[0] as Place;
      setPlaces((prev) =>
        saved.status === "wishlist"
          ? prev.map((p) => (p.id === saved.id ? saved : p))
          : prev.filter((p) => p.id !== saved.id),
      );
      setVisiting(null);
    },
    [visiting],
  );

  if (visiting) {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setVisiting(null)}
          className="text-sm text-muted transition-colors hover:text-accent"
        >
          ← 가고 싶은 곳으로 돌아가기
        </button>
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">
            ‘{visiting.name}’ 다녀왔어요
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            별점·방문일·한줄평·사진을 채우고 저장하면 “다녀온 곳”으로 옮겨져요.
          </p>
        </div>
        <AddPlaceForm
          initial={placeFormInput({ ...visiting, status: "visited" })}
          submitLabel="다녀온 곳으로 저장"
          onSubmit={handleVisited}
          onCancel={() => setVisiting(null)}
        />
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">가고 싶은 곳</h1>
          <p className="mt-1.5 text-sm text-muted">
            {loading ? "불러오는 중…" : `위시리스트 ${places.length}곳`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="rounded-full bg-foreground px-4 py-1.5 text-sm font-semibold text-background"
        >
          {adding ? "폼 닫기" : "가고 싶은 곳 추가"}
        </button>
      </div>

      {adding && (
        <AddPlaceForm
          initialStatus="wishlist"
          submitLabel="위시리스트에 저장"
          onSubmit={handleAdd}
          onCancel={() => setAdding(false)}
        />
      )}

      {loadError && (
        <div className="mb-6 rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-3xl bg-stone-200/70"
            />
          ))}
        </div>
      ) : places.length === 0 && !loadError ? (
        <p className="rounded-3xl bg-card p-12 text-center text-sm text-muted ring-1 ring-border/70">
          아직 가고 싶은 곳이 없어요. “장소 추가”에서 <b>가고 싶은 곳</b>으로
          담아보세요.
        </p>
      ) : (
        <div className="grid items-start gap-3 sm:grid-cols-2">
          {places.map((place) => {
            const label = wantedByLabel(place.wanted_by);
            return (
              <article
                key={place.id}
                className="flex items-start gap-3 rounded-2xl bg-card p-3 ring-1 ring-border/70"
              >
                <CategoryIconTile
                  category={place.category}
                  name={place.name}
                  address={place.address}
                />

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span
                    className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${categoryStyle(
                      place.category,
                    )}`}
                  >
                    {place.category}
                  </span>
                  <Link
                    href={`/places/${place.id}`}
                    className="truncate text-base font-bold leading-snug transition-colors hover:text-accent"
                  >
                    {place.name}
                  </Link>
                  <p className="truncate text-xs text-muted">{place.address}</p>
                  {label && (
                    <span className="w-fit rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                      {label}
                    </span>
                  )}
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setVisiting(place)}
                      className="rounded-full bg-foreground px-3.5 py-1 text-xs font-semibold text-background"
                    >
                      다녀왔어요
                    </button>
                    <Link
                      href={`/places/${place.id}`}
                      className="text-xs font-medium text-muted transition-colors hover:text-accent"
                    >
                      수정·삭제 →
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-xs text-muted">
        전환한 장소는{" "}
        <Link href="/" className="underline hover:text-accent">
          홈 “다녀온 곳”
        </Link>{" "}
        목록에서 볼 수 있어요.
      </p>
    </>
  );
}
