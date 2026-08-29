"use client";

import { type FormEvent, useState } from "react";

export interface NewMemoryInput {
  date: string;
  content: string;
  mood_tag: string;
}

function today(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const fieldClass =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-accent";
const labelClass = "text-xs font-medium text-muted";

export function AddMemoryForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: NewMemoryInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<NewMemoryInput>({
    date: today(),
    content: "",
    mood_tag: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof NewMemoryInput>(key: K, value: NewMemoryInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!form.content.trim()) {
      setError("내용을 입력해 주세요.");
      return;
    }

    setSaving(true);
    try {
      await onSubmit(form);
      setForm({ date: today(), content: "", mood_tag: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했어요.");
    } finally {
      setSaving(false);
    }
  };

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

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      <div className="flex gap-2">
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
