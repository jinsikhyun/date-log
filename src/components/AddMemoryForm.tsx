"use client";

import { type FormEvent, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { uploadPhoto } from "@/lib/photos";

export interface NewMemoryInput {
  date: string;
  content: string;
  mood_tag: string;
  author: string; // 저장 시 현재 선택된 사용자로 자동 주입 (폼 필드 아님)
  photo_urls: string[]; // 첨부 사진 URL (선택, 최대 6장)
}

const MAX_PHOTOS = 6;

function today(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const empty = (): NewMemoryInput => ({
  date: today(),
  content: "",
  mood_tag: "",
  author: "",
  photo_urls: [],
});

const fieldClass =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-accent";
const labelClass = "text-xs font-medium text-muted";

export function AddMemoryForm({
  onSubmit,
  onCancel,
  initial,
  submitLabel = "저장",
}: {
  onSubmit: (input: NewMemoryInput) => Promise<void>;
  onCancel: () => void;
  initial?: NewMemoryInput;
  submitLabel?: string;
}) {
  const { authorName } = useAuth();
  const [form, setForm] = useState<NewMemoryInput>(initial ?? empty);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const set = <K extends keyof NewMemoryInput>(key: K, value: NewMemoryInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleFiles = async (fileList: FileList | null) => {
    const all = Array.from(fileList ?? []);
    const files = all.filter(
      (f) =>
        f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name),
    );
    if (all.length === 0) return;
    setPhotoError(null);

    if (files.length === 0) {
      setPhotoError("이미지 파일만 올릴 수 있어요.");
      return;
    }
    if (form.photo_urls.length + files.length > MAX_PHOTOS) {
      setPhotoError(
        `사진은 추억 하나당 최대 ${MAX_PHOTOS}장까지예요. (현재 ${form.photo_urls.length}장)`,
      );
      return;
    }

    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of files) {
        urls.push(await uploadPhoto(file));
      }
      setForm((f) => ({ ...f, photo_urls: [...f.photo_urls, ...urls] }));
    } catch (err) {
      setPhotoError(
        err instanceof Error ? err.message : "사진 업로드에 실패했어요.",
      );
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (idx: number) =>
    setForm((f) => ({
      ...f,
      photo_urls: f.photo_urls.filter((_, i) => i !== idx),
    }));

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!form.content.trim()) {
      setError("내용을 입력해 주세요.");
      return;
    }
    if (uploading) {
      setError("사진 업로드가 끝난 뒤에 저장해 주세요.");
      return;
    }
    const author = initial?.author || authorName;
    if (!author) {
      setError("프로필 이름이 없어요. 설정에서 이름을 먼저 정해 주세요.");
      return;
    }

    setSaving(true);
    try {
      // 새 추억은 로그인한 사용자로. 기존 추억 수정 시엔 원 작성자 유지.
      await onSubmit({ ...form, author });
      setForm(initial ?? empty());
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했어요.");
    } finally {
      setSaving(false);
    }
  };

  const atLimit = form.photo_urls.length >= MAX_PHOTOS;

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-4 rounded-3xl bg-card p-6 ring-1 ring-border/70"
    >
      <div className="grid gap-4 sm:grid-cols-[170px_1fr]">
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="mf-date">
            날짜
          </label>
          <input
            id="mf-date"
            type="date"
            className={fieldClass}
            value={form.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="mf-mood">
            무드 / 태그
          </label>
          <input
            id="mf-mood"
            className={fieldClass}
            value={form.mood_tag}
            onChange={(e) => set("mood_tag", e.target.value)}
            placeholder="예: 설렘, 비 오는 날, 기념일"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="mf-content">
          내용
        </label>
        <textarea
          id="mf-content"
          rows={4}
          className={`${fieldClass} resize-y`}
          value={form.content}
          onChange={(e) => set("content", e.target.value)}
          placeholder="그날의 이야기를 남겨보세요"
        />
      </div>

      {/* 사진 첨부 (선택, 최대 6장) */}
      <div className="flex flex-col gap-2">
        <span className={labelClass}>사진 (선택 · 최대 {MAX_PHOTOS}장)</span>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!atLimit && !uploading) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!atLimit && !uploading) void handleFiles(e.dataTransfer.files);
          }}
          className={`relative flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-5 text-center transition-colors ${
            dragOver ? "border-accent bg-accent/5" : "border-border bg-white"
          }`}
        >
          {form.photo_urls.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {form.photo_urls.map((u, i) => (
                <div
                  key={`${u}-${i}`}
                  className="relative h-16 w-16 overflow-hidden rounded-lg ring-1 ring-border/70"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    aria-label="사진 빼기"
                    className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-lg bg-black/55 text-xs font-bold text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {atLimit ? (
            <span className="text-xs text-muted">
              최대 {MAX_PHOTOS}장까지 첨부했어요.
            </span>
          ) : (
            <>
              <span className="text-sm text-muted">
                사진을 끌어다 놓거나 아래에서 선택하세요
              </span>
              <label className="cursor-pointer rounded-full bg-stone-100 px-4 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-200">
                {uploading ? "업로드 중…" : "파일 선택"}
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    void handleFiles(e.target.files);
                    e.target.value = ""; // 같은 파일 다시 선택 가능하게
                  }}
                />
              </label>
              <span className="text-xs text-muted">
                {form.photo_urls.length}/{MAX_PHOTOS} · 자동으로 가로 1600px JPEG
                변환
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

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      <div className="flex gap-2">
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
