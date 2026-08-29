"use client";

import { type FormEvent, useState } from "react";
import { CATEGORY_OPTIONS } from "@/lib/places";

export interface NewPlaceInput {
  name: string;
  category: string;
  address: string;
  naver_map_link: string;
  rating: string; // 폼 값(문자열). 실제 변환은 부모(handleAdd)에서.
  first_visit_date: string;
  description: string;
}

const EMPTY: NewPlaceInput = {
  name: "",
  category: "",
  address: "",
  naver_map_link: "",
  rating: "",
  first_visit_date: "",
  description: "",
};

const RATING_CHOICES = ["5", "4.5", "4", "3.5", "3", "2.5", "2", "1.5", "1", "0.5"];

const fieldClass =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-accent";
const labelClass = "text-xs font-medium text-muted";

export function AddPlaceForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: NewPlaceInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<NewPlaceInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof NewPlaceInput>(key: K, value: NewPlaceInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim() || !form.category || !form.address.trim()) {
      setError("장소명, 카테고리, 주소는 필수예요.");
      return;
    }

    setSaving(true);
    try {
      await onSubmit(form);
      setForm(EMPTY);
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
      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="pf-name">
          장소명 *
        </label>
        <input
          id="pf-name"
          className={fieldClass}
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="예: 카멜커피 서촌점"
        />
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
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
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
          onChange={(e) => set("address", e.target.value)}
          placeholder="서울 종로구 ..."
        />
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
          {RATING_CHOICES.map((r) => (
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

      {error && (
        <p className="text-sm font-medium text-red-600 sm:col-span-2">{error}</p>
      )}

      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
        >
          {saving ? "저장 중…" : "저장"}
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
