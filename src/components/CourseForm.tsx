"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  categoryStyle,
  placeInputToRow,
  type PlaceRowInput,
  statusBadgeClass,
  statusLabel,
} from "@/lib/places";
import { PlaceAutocompleteInput } from "@/components/PlaceAutocompleteInput";
import { useAuth } from "@/components/AuthProvider";
import { useCategories } from "@/components/CategoriesProvider";

export interface CourseFormInput {
  title: string;
  concept: string;
  placeIds: number[]; // 코스 내 순서대로
}

interface PickPlace {
  id: number;
  name: string;
  category: string;
  status: string; // 'visited' | 'wishlist'
}

const EMPTY: CourseFormInput = { title: "", concept: "", placeIds: [] };

const fieldClass =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-accent";
const labelClass = "text-xs font-medium text-muted";

const blankRow = (over: Partial<PlaceRowInput>): PlaceRowInput => ({
  name: "",
  category: "",
  address: "",
  naver_map_link: "",
  kakao_map_link: "",
  rating: "",
  first_visit_date: "",
  description: "",
  image_url: "",
  lat: "",
  lng: "",
  status: "visited",
  wanted_by: "",
  added_by: "",
  ...over,
});

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(
        status,
      )}`}
    >
      {statusLabel(status)}
    </span>
  );
}

export function CourseForm({
  onSubmit,
  onCancel,
  initial,
  submitLabel = "저장",
}: {
  onSubmit: (input: CourseFormInput) => Promise<void>;
  onCancel: () => void;
  initial?: CourseFormInput;
  submitLabel?: string;
}) {
  const { authorName } = useAuth();
  const { categories } = useCategories();
  const base = initial ?? EMPTY;
  const [title, setTitle] = useState(base.title);
  const [concept, setConcept] = useState(base.concept);
  const [placeIds, setPlaceIds] = useState<number[]>(base.placeIds);
  const [allPlaces, setAllPlaces] = useState<PickPlace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // "+ 새 장소 추가" 미니 폼
  const [addingNew, setAddingNew] = useState(false);
  const [nName, setNName] = useState("");
  const [nCategory, setNCategory] = useState("");
  const [nAddress, setNAddress] = useState("");
  const [nLat, setNLat] = useState("");
  const [nLng, setNLng] = useState("");
  const [nKakao, setNKakao] = useState("");
  const [nSaving, setNSaving] = useState(false);
  const [nError, setNError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // status 무관 — 다녀온 곳 + 위시리스트 전부 후보
      const { data, error: qErr } = await supabase
        .from("places")
        .select("id, name, category, status")
        .order("name");
      if (cancelled) return;
      if (qErr) {
        setError(`장소 목록을 불러오지 못했어요: ${qErr.message}`);
      } else {
        setAllPlaces((data ?? []) as PickPlace[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const byId = useMemo(() => {
    const m = new Map<number, PickPlace>();
    allPlaces.forEach((p) => m.set(p.id, p));
    return m;
  }, [allPlaces]);

  const selected = placeIds
    .map((id) => byId.get(id))
    .filter((p): p is PickPlace => p != null);
  const available = allPlaces.filter((p) => !placeIds.includes(p.id));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= placeIds.length) return;
    setPlaceIds((ids) => {
      const next = [...ids];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return next;
    });
  };

  const resetNewForm = () => {
    setAddingNew(false);
    setNName("");
    setNCategory("");
    setNAddress("");
    setNLat("");
    setNLng("");
    setNKakao("");
    setNError(null);
  };

  const saveNewPlace = async () => {
    setNError(null);
    if (!nName.trim() || !nCategory || !nAddress.trim()) {
      setNError("장소명, 카테고리, 주소를 입력해 주세요.");
      return;
    }
    if (!authorName) {
      setNError("프로필 이름이 없어요. 설정에서 이름을 먼저 정해 주세요.");
      return;
    }
    setNSaving(true);
    try {
      const { data, error: insErr } = await supabase
        .from("places")
        .insert({
          ...placeInputToRow(
            blankRow({
              name: nName,
              category: nCategory,
              address: nAddress,
              lat: nLat,
              lng: nLng,
              kakao_map_link: nKakao,
              // 코스 짜면서 새로 넣는 곳 = 아직 안 가본 곳 → 위시리스트로 분류
              status: "wishlist",
              added_by: authorName,
            }),
          ),
          // 단, 큐레이션한 "가고 싶은 곳"이 아니므로 /wishlist 페이지에는 숨긴다
          via_course: true,
        })
        .select("id, name, category, status")
        .single();
      if (insErr) throw new Error(insErr.message);

      const created = data as PickPlace;
      setAllPlaces((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setPlaceIds((ids) => [...ids, created.id]); // 코스에 바로 추가
      resetNewForm();
    } catch (err) {
      setNError(
        err instanceof Error ? err.message : "새 장소 저장에 실패했어요.",
      );
    } finally {
      setNSaving(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("코스 이름은 필수예요.");
      return;
    }
    if (placeIds.length === 0) {
      setError("장소를 하나 이상 추가해 주세요.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ title, concept, placeIds });
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했어요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-8 grid gap-4 rounded-3xl bg-card p-6 ring-1 ring-border/70"
    >
      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="cf-title">
          코스 이름 *
        </label>
        <input
          id="cf-title"
          className={fieldClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 서촌 골목 산책 코스"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="cf-concept">
          컨셉 / 설명
        </label>
        <textarea
          id="cf-concept"
          className={`${fieldClass} min-h-20 resize-y`}
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          placeholder="어떤 하루를 보내는 코스인지 한두 문장으로"
        />
      </div>

      {/* 선택된 장소 (순서대로) */}
      <div className="flex flex-col gap-2">
        <span className={labelClass}>코스 순서 ({selected.length})</span>
        {selected.length === 0 ? (
          <p className="rounded-xl bg-stone-50 px-3 py-4 text-center text-xs text-muted">
            아래에서 장소를 눌러 추가하세요.
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {selected.map((p, i) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {p.name}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${categoryStyle(
                    p.category,
                  )}`}
                >
                  {p.category}
                </span>
                <StatusBadge status={p.status} />
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, i - 1)}
                    disabled={i === 0}
                    aria-label="위로"
                    className="rounded-md px-1.5 py-0.5 text-sm text-stone-500 hover:bg-stone-100 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, i + 1)}
                    disabled={i === selected.length - 1}
                    aria-label="아래로"
                    className="rounded-md px-1.5 py-0.5 text-sm text-stone-500 hover:bg-stone-100 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPlaceIds((ids) => ids.filter((id) => id !== p.id))
                    }
                    aria-label="빼기"
                    className="rounded-md px-1.5 py-0.5 text-sm text-red-500 hover:bg-red-50"
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* 추가할 장소 (다녀온 곳 + 위시리스트 전부) */}
      <div className="flex flex-col gap-2">
        <span className={labelClass}>장소 추가</span>
        <div className="flex flex-wrap gap-1.5">
          {available.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlaceIds((ids) => [...ids, p.id])}
              className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600 transition-colors hover:bg-accent/10 hover:text-accent"
            >
              + {p.name}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${statusBadgeClass(
                  p.status,
                )}`}
              >
                {statusLabel(p.status)}
              </span>
            </button>
          ))}
          {!addingNew && (
            <button
              type="button"
              onClick={() => setAddingNew(true)}
              className="rounded-full border border-dashed border-accent/60 px-3 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent/10"
            >
              + 새 장소 추가
            </button>
          )}
        </div>

        {addingNew && (
          <div className="mt-1 flex flex-col gap-2 rounded-xl border border-border bg-stone-50 p-3">
            <p className="text-xs text-muted">
              새 장소가 목록에 등록되고 이 코스에 바로 담겨요. (가고 싶은 곳
              등록은 별도예요)
            </p>
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="cf-new-name">
                장소명 *
              </label>
              <PlaceAutocompleteInput
                id="cf-new-name"
                className={fieldClass}
                value={nName}
                placeholder="예: 런던 베이글 뮤지엄"
                onChange={setNName}
                onPick={(item) => {
                  setNName(item.place_name);
                  setNAddress(item.road_address_name || item.address_name);
                  setNLat(item.y);
                  setNLng(item.x);
                  setNKakao(item.place_url || "");
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="cf-new-cat">
                카테고리 *
              </label>
              <select
                id="cf-new-cat"
                className={fieldClass}
                value={nCategory}
                onChange={(e) => setNCategory(e.target.value)}
              >
                <option value="">선택</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="cf-new-addr">
                주소 *
              </label>
              <input
                id="cf-new-addr"
                className={fieldClass}
                value={nAddress}
                onChange={(e) => setNAddress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
                placeholder="서울 종로구 ..."
              />
            </div>
            {nError && (
              <p className="text-xs font-medium text-red-600">{nError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveNewPlace}
                disabled={nSaving}
                className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                {nSaving ? "저장 중…" : "장소 저장 + 코스에 추가"}
              </button>
              <button
                type="button"
                onClick={resetNewForm}
                disabled={nSaving}
                className="rounded-full bg-stone-200 px-4 py-1.5 text-xs font-medium text-stone-600"
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
        >
          {saving ? "저장 중…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-full bg-stone-100 px-5 py-2 text-sm font-medium text-stone-600"
        >
          취소
        </button>
      </div>
    </form>
  );
}
