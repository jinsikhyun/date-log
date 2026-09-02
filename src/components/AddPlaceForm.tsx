"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { type PlaceStatus } from "@/lib/places";
import { uploadPhoto } from "@/lib/photos";
import { ensureKakaoLoaded, geocode, keywordSearchFirst } from "@/lib/kakao";
import { useAuth } from "@/components/AuthProvider";
import { useCategories } from "@/components/CategoriesProvider";
import { TagSelector } from "@/components/TagSelector";
import { normalizeVisitedCategory } from "@/lib/categories";

export interface NewPlaceInput {
  name: string;
  category: string;
  address: string;
  naver_map_link: string;
  kakao_map_link: string; // 자동완성 선택 시 카카오 place_url 로 채워짐 (폼 필드 아님)
  rating: string; // 폼 값(문자열). 실제 변환은 부모(handleAdd)에서.
  first_visit_date: string;
  description: string;
  tags: string[]; // 취향 태그 (선택 사항, 방문/위시 상태와 무관하게 저장)
  image_url: string; // 업로드 완료된 대표 사진 URL. 빈 문자열이면 사진 없음(선택 항목).
  lat: string; // 카카오 장소검색으로 채워지는 위도/경도. 빈 문자열이면 지도가 주소를 지오코딩.
  lng: string;
  status: PlaceStatus; // '다녀온 곳' | '가고 싶은 곳'
  wanted_by_ids: string[]; // wishlist 일 때 이 위시를 원하는 커플 구성원 id (독립 토글)
  added_by: string; // 저장 시 현재 선택된 사용자로 자동 주입 (폼 필드 아님)
}

const EMPTY: NewPlaceInput = {
  name: "",
  category: "",
  address: "",
  naver_map_link: "",
  kakao_map_link: "",
  rating: "",
  first_visit_date: "",
  description: "",
  tags: [],
  image_url: "",
  lat: "",
  lng: "",
  status: "visited",
  wanted_by_ids: [],
  added_by: "",
};

const RATING_CHOICES = ["5", "4.5", "4", "3.5", "3", "2.5", "2", "1.5", "1", "0.5"];

const fieldClass =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-accent";
const labelClass = "text-xs font-medium text-muted";

/** places 행 → 폼 초기값 (수정 시 사용) */
export function placeFormInput(p: {
  name: string;
  category: string;
  address: string;
  naver_map_link: string | null;
  kakao_map_link: string | null;
  rating: number | null;
  first_visit_date: string | null;
  description: string | null;
  tags?: string[] | null;
  image_url: string | null;
  lat: number | null;
  lng: number | null;
  status?: string | null;
  wanted_by_ids?: string[] | null;
}): NewPlaceInput {
  return {
    name: p.name,
    category: p.category,
    address: p.address,
    naver_map_link: p.naver_map_link ?? "",
    kakao_map_link: p.kakao_map_link ?? "",
    rating: p.rating != null ? String(p.rating) : "",
    first_visit_date: p.first_visit_date ?? "",
    description: p.description ?? "",
    tags: p.tags ?? [],
    image_url: p.image_url ?? "",
    lat: p.lat != null ? String(p.lat) : "",
    lng: p.lng != null ? String(p.lng) : "",
    status: p.status === "wishlist" ? "wishlist" : "visited",
    wanted_by_ids: p.wanted_by_ids ?? [],
    added_by: "", // 저장 시 현재 사용자로 덮어씀
  };
}

export function AddPlaceForm({
  onSubmit,
  onCancel,
  initial,
  initialStatus,
  submitLabel = "저장",
}: {
  onSubmit: (input: NewPlaceInput) => Promise<void>;
  onCancel: () => void;
  initial?: NewPlaceInput;
  initialStatus?: PlaceStatus; // initial 이 없을 때 토글 기본값
  submitLabel?: string;
}) {
  const { authorName, coupleMembers } = useAuth();
  const { categories } = useCategories();
  const wishMembers = coupleMembers.filter((m) => m.display_name?.trim());
  const base = initial ?? { ...EMPTY, status: initialStatus ?? "visited" };
  const [form, setForm] = useState<NewPlaceInput>(base);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // ── 카카오 장소 검색 자동완성 ──────────────────────────────
  const placesSvcRef = useRef<kakao.maps.services.Places | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameBoxRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<
    kakao.maps.services.PlacesSearchResultItem[]
  >([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [searching, setSearching] = useState(false);

  // SDK 로드 (실패해도 폼은 수동 입력으로 계속 동작)
  useEffect(() => {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
    if (!appKey) return;
    let cancelled = false;
    ensureKakaoLoaded(appKey)
      .then(() => {
        if (!cancelled) {
          placesSvcRef.current = new window.kakao.maps.services.Places();
        }
      })
      .catch((err: unknown) => {
        console.warn(
          "[AddPlaceForm] 카카오 장소검색을 못 불러왔어요 — 수동 입력만 가능:",
          err,
        );
      });
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // 드롭다운 바깥 클릭 시 닫기
  useEffect(() => {
    if (!showSuggest) return;
    const onDown = (e: MouseEvent) => {
      if (nameBoxRef.current && !nameBoxRef.current.contains(e.target as Node)) {
        setShowSuggest(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showSuggest]);

  const runPlaceSearch = (keyword: string) => {
    const svc = placesSvcRef.current;
    const q = keyword.trim();
    if (!svc || q.length < 2) {
      setSuggestions([]);
      setShowSuggest(false);
      return;
    }
    setSearching(true);
    svc.keywordSearch(
      q,
      (data, status) => {
        setSearching(false);
        if (status === window.kakao.maps.services.Status.OK && data.length > 0) {
          setSuggestions(data.slice(0, 6));
          setShowSuggest(true);
        } else {
          setSuggestions([]);
          setShowSuggest(false);
        }
      },
      { size: 6 },
    );
  };

  const handleNameChange = (value: string) => {
    set("name", value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runPlaceSearch(value), 300);
  };

  const selectSuggestion = (
    item: kakao.maps.services.PlacesSearchResultItem,
  ) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setForm((f) => ({
      ...f,
      name: item.place_name,
      address: item.road_address_name || item.address_name,
      lat: item.y,
      lng: item.x,
      // 카카오 장소 상세 URL — 검색 결과에 들어있는 값을 그대로 저장
      kakao_map_link: item.place_url || "",
      // 비어 있을 때만 네이버지도 검색 링크를 자동으로 채운다 (기존 값은 유지)
      naver_map_link:
        f.naver_map_link.trim() ||
        `https://map.naver.com/p/search/${encodeURIComponent(item.place_name)}`,
    }));
    setShowSuggest(false);
    setSuggestions([]);
  };

  // 저장된 별점이 선택지에 없는 값이면(예: 3.7) 맨 앞에 끼워 넣어 유실 방지
  const ratingChoices =
    form.rating && !RATING_CHOICES.includes(form.rating)
      ? [form.rating, ...RATING_CHOICES]
      : RATING_CHOICES;

  const set = <K extends keyof NewPlaceInput>(key: K, value: NewPlaceInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setStatus = (status: PlaceStatus) => {
    setForm((current) => ({
      ...current,
      status,
      category:
        status === "visited"
          ? normalizeVisitedCategory(
              current.category,
              categories.map((category) => category.name),
            )
          : current.category,
    }));
  };

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    setPhotoError(null);
    setUploading(true);
    try {
      const url = await uploadPhoto(file);
      set("image_url", url);
    } catch (err) {
      setPhotoError(
        err instanceof Error ? err.message : "사진 업로드에 실패했어요.",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim() || !form.category || !form.address.trim()) {
      setError("장소명, 카테고리, 주소는 필수예요.");
      return;
    }
    if (uploading) {
      setError("사진 업로드가 끝난 뒤에 저장해 주세요.");
      return;
    }
    if (!authorName) {
      setError("프로필 이름이 없어요. 설정에서 이름을 먼저 정해 주세요.");
      return;
    }

    setSaving(true);
    try {
      // 좌표가 비어 있으면 저장 시점에 채운다 (주소 → 지오코딩, 실패 시 장소명 검색).
      // 이게 있어야 코스 동선 지도가 이 장소를 나중에 못 그리는 일이 없다.
      let { lat, lng } = form;
      if ((!lat || !lng) && form.address.trim()) {
        const hit =
          (await geocode(form.address).catch(() => null)) ??
          (await keywordSearchFirst(form.name).catch(() => null));
        if (hit) {
          lat = String(hit.lat);
          lng = String(hit.lng);
        }
      }
      // added_by 는 폼 입력이 아니라 현재 로그인한 사용자의 이름으로 자동
      await onSubmit({ ...form, lat, lng, added_by: authorName });
      setForm(base);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했어요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-8 grid gap-4 rounded-3xl bg-card p-6 ring-1 ring-border/70 sm:grid-cols-2"
    >
      <div className="flex gap-2 sm:col-span-2">
        {(
          [
            ["visited", "다녀온 곳"],
            ["wishlist", "가고 싶은 곳"],
          ] as const
        ).map(([value, text]) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            aria-pressed={form.status === value}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              form.status === value
                ? "bg-accent text-white shadow-sm"
                : "bg-white text-muted ring-1 ring-border hover:text-accent"
            }`}
          >
            {text}
          </button>
        ))}
      </div>

      <div className="relative flex flex-col gap-1" ref={nameBoxRef}>
        <label className={labelClass} htmlFor="pf-name">
          장소명 *
        </label>
        <input
          id="pf-name"
          className={fieldClass}
          value={form.name}
          onChange={(e) => handleNameChange(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setShowSuggest(true);
          }}
          placeholder="예: 카멜커피 서촌점"
          autoComplete="off"
        />
        {searching && (
          <span className="absolute right-3 top-[2.1rem] text-xs text-muted">
            검색 중…
          </span>
        )}
        {showSuggest && suggestions.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-40 mt-1 max-h-64 overflow-auto rounded-xl border border-border bg-white py-1 shadow-lg">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => selectSuggestion(s)}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-stone-50"
                >
                  <span className="text-sm font-medium">{s.place_name}</span>
                  <span className="text-xs text-muted">
                    {s.road_address_name || s.address_name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="pf-category">
          카테고리 *
        </label>
        <select
          id="pf-category"
          className={fieldClass}
          value={form.category}
          onChange={(e) => set("category", e.target.value)}
        >
          <option value="">선택</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
          {/* 저장돼 있던 카테고리가 목록에서 사라졌어도 값 유지 */}
          {form.category &&
            form.status === "wishlist" &&
            !categories.some((c) => c.name === form.category) && (
              <option value={form.category}>{form.category}</option>
            )}
        </select>
      </div>

      <div className="flex flex-col gap-1 sm:col-span-2">
        <label className={labelClass} htmlFor="pf-address">
          주소 *
        </label>
        <input
          id="pf-address"
          className={fieldClass}
          value={form.address}
          onChange={(e) => {
            set("address", e.target.value);
            // 주소를 손으로 고치면 자동완성으로 잡은 좌표는 폐기 (지도가 다시 지오코딩)
            if (form.lat || form.lng) {
              setForm((f) => ({ ...f, lat: "", lng: "" }));
            }
          }}
          placeholder="서울 종로구 ..."
        />
        {form.lat && form.lng && (
          <span className="text-xs text-emerald-600">
            좌표 자동 입력됨 ({Number(form.lat).toFixed(5)},{" "}
            {Number(form.lng).toFixed(5)})
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1 sm:col-span-2">
        <label className={labelClass} htmlFor="pf-link">
          네이버지도 링크
        </label>
        <input
          id="pf-link"
          className={fieldClass}
          value={form.naver_map_link}
          onChange={(e) => set("naver_map_link", e.target.value)}
          placeholder="https://naver.me/..."
        />
      </div>

      <div className="sm:col-span-2">
        <TagSelector
          category={form.category}
          selected={form.tags}
          onChange={(tags) => set("tags", tags)}
        />
      </div>

      {form.status === "wishlist" && (
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelClass}>누가 원해요?</span>
          <div className="flex flex-wrap gap-2">
            {wishMembers.map((m) => {
              const on = form.wanted_by_ids.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    set(
                      "wanted_by_ids",
                      on
                        ? form.wanted_by_ids.filter((x) => x !== m.id)
                        : [...form.wanted_by_ids, m.id],
                    )
                  }
                  className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 transition-colors ${
                    on
                      ? "bg-accent/10 text-accent ring-accent/50"
                      : "bg-white text-stone-500 ring-border hover:text-accent"
                  }`}
                >
                  {m.display_name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {form.status === "visited" && (
        <>
      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="pf-rating">
          별점
        </label>
        <select
          id="pf-rating"
          className={fieldClass}
          value={form.rating}
          onChange={(e) => set("rating", e.target.value)}
        >
          <option value="">없음</option>
          {ratingChoices.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="pf-date">
          방문일
        </label>
        <input
          id="pf-date"
          type="date"
          className={fieldClass}
          value={form.first_visit_date}
          onChange={(e) => set("first_visit_date", e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1 sm:col-span-2">
        <label className={labelClass} htmlFor="pf-desc">
          한줄평
        </label>
        <input
          id="pf-desc"
          className={fieldClass}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="이 곳을 한마디로"
        />
      </div>

      <div className="flex flex-col gap-1 sm:col-span-2">
        <span className={labelClass}>대표 사진</span>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void handleFile(e.dataTransfer.files?.[0]);
          }}
          className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-6 text-center transition-colors ${
            dragOver ? "border-accent bg-accent/5" : "border-border bg-white"
          }`}
        >
          {form.image_url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.image_url}
                alt="대표 사진 미리보기"
                className="max-h-44 rounded-lg object-cover"
              />
              <div className="flex gap-2">
                <label className="cursor-pointer rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-200">
                  다른 사진으로 교체
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => void handleFile(e.target.files?.[0])}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => set("image_url", "")}
                  disabled={uploading}
                  className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-200"
                >
                  사진 제거
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="text-sm text-muted">
                사진을 끌어다 놓거나 아래에서 선택하세요
              </span>
              <label className="cursor-pointer rounded-full bg-stone-100 px-4 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-200">
                파일 선택
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => void handleFile(e.target.files?.[0])}
                />
              </label>
              <span className="text-xs text-muted">
                JPG · PNG · HEIC — 자동으로 가로 1600px JPEG 로 변환돼요 (선택 항목)
              </span>
            </>
          )}

          {uploading && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-white/70 text-sm font-medium text-accent">
              사진 업로드 중…
            </span>
          )}
        </div>
        {photoError && (
          <p className="text-sm font-medium text-red-600">{photoError}</p>
        )}
      </div>
        </>
      )}

      {error && (
        <p className="text-sm font-medium text-red-600 sm:col-span-2">{error}</p>
      )}

      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={saving || uploading}
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
