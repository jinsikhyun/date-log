"use client";

import PhotoImage from "@/components/PhotoImage";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { extractPhotoTakenDate, uploadPhoto } from "@/lib/photos";
import type { WeatherState } from "@/lib/weather";
import {
  WEATHER_ICON,
  WEATHER_LABEL,
  pastWeatherChoices,
  pastWeatherFields,
  todayWeatherFields,
} from "@/lib/weatherDisplay";

export interface NewMemoryInput {
  date: string;
  content: string;
  mood_tag: string;
  author: string; // 저장 시 현재 선택된 사용자로 자동 주입 (폼 필드 아님)
  photo_urls: string[]; // 첨부 사진 URL (선택, 최대 6장)
  weather_state: WeatherState | null; // 그날의 날씨 각인. 각인 안 하면 null.
  weather_temp: number | null; // 오늘 자동 각인만 값 있음, 과거 수동 각인은 항상 null.
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
  weather_state: null,
  weather_temp: null,
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
  const [photoDateMsg, setPhotoDateMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dateManuallyEditedRef = useRef(false);

  // ── 그날의 날씨 ──────────────────────────────────────────────
  const isEdit = !!initial;
  const todayStr = today();
  const isToday = form.date === todayStr;

  // 오늘 날짜에 자동으로 확인한 현재 날씨(있으면). 과거 날짜에서는 null.
  const [weatherAuto, setWeatherAuto] = useState<{ state: WeatherState; tempC: number } | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  // 사용자가 4개(맑음/흐림/비/눈) 중 직접 고른 값. 오늘은 자동값 위의 수정, 과거는 유일한 입력.
  const [weatherManual, setWeatherManual] = useState<WeatherState | null>(
    isEdit ? (initial!.weather_state ?? null) : null,
  );
  // 수정 화면에서 날짜만 바꿔서 기존 날씨와 안 맞을 수 있을 때만 true — 사용자가 직접 다시
  // 고르기 전까지는 저장된 값을 그대로 유지한다(조용히 덮어쓰지 않기).
  const [weatherTouched, setWeatherTouched] = useState(!isEdit);
  const prevDateRef = useRef(form.date);

  useEffect(() => {
    const prevDate = prevDateRef.current;
    const isFirstRun = prevDate === form.date;
    const wasToday = prevDate === todayStr;
    prevDateRef.current = form.date;

    if (!isToday) {
      setWeatherAuto(null);
      if (!isFirstRun && wasToday) setWeatherManual(null); // 오늘→과거: 자동 날씨 지우고 수동 선택으로
      return;
    }
    if (!isFirstRun && !wasToday) setWeatherManual(null); // 과거→오늘: 새 제안으로 초기화
    setWeatherLoading(true);
    let cancelled = false;
    fetch("/api/weather", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setWeatherAuto(data ? { state: data.state, tempC: data.tempC } : null);
      })
      .catch(() => {
        if (!cancelled) setWeatherAuto(null); // 실패해도 폼 저장 자체는 막지 않음 — 각인만 생략
      })
      .finally(() => {
        if (!cancelled) setWeatherLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // form.date 가 바뀔 때만(오늘/과거 전환 포함) 재실행 — 매 렌더 재조회 아님.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.date]);

  const dateChangedFromSaved = isEdit && initial!.date !== form.date;
  const showWeatherNotice = isEdit && dateChangedFromSaved && !weatherTouched;

  const pickWeather = (state: WeatherState) => {
    setWeatherManual(state);
    setWeatherTouched(true);
  };

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
    setPhotoDateMsg(null);

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
      let takenDate: string | null = null;
      if (!initial && !dateManuallyEditedRef.current) {
        for (const file of files) {
          takenDate = await extractPhotoTakenDate(file);
          if (takenDate) break;
        }
      }
      const urls: string[] = [];
      for (const file of files) {
        urls.push(await uploadPhoto(file));
      }
      setForm((f) => ({
        ...f,
        date: takenDate ?? f.date,
        photo_urls: [...f.photo_urls, ...urls],
      }));
      if (takenDate) {
        setPhotoDateMsg(
          `사진 촬영일 ${takenDate.replaceAll("-", ".")}을 날짜로 입력했어요.`,
        );
      }
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
      // 수정 화면에서 날짜도 안 바꾸고 날씨 버튼도 안 눌렀으면 저장된 값을 그대로 유지
      // (조용히 덮어쓰지 않기). 그 외(신규 작성, 또는 날짜/날씨를 직접 바꾼 경우)엔
      // 현재 화면 상태로 다시 계산한다.
      const weatherFields =
        isEdit && !dateChangedFromSaved && !weatherTouched
          ? { weather_state: initial!.weather_state, weather_temp: initial!.weather_temp }
          : isToday
            ? weatherAuto
              ? todayWeatherFields(weatherAuto, true, weatherManual)
              : // 오늘인데 자동 조회 실패 — 사용자가 고른 상태만 저장, 기온은 확인 못 했으니 null.
                { weather_state: weatherManual, weather_temp: null }
            : pastWeatherFields(weatherManual);

      // 새 추억은 로그인한 사용자로. 기존 추억 수정 시엔 원 작성자 유지.
      await onSubmit({ ...form, author, ...weatherFields });
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
            onChange={(e) => {
              dateManuallyEditedRef.current = true;
              set("date", e.target.value);
              setPhotoDateMsg(null);
            }}
          />
          {photoDateMsg && (
            <span className="text-[11px] font-medium text-accent">{photoDateMsg}</span>
          )}
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

      {/* 그날의 날씨 — 오늘은 자동 제안+수정, 과거는 수동 선택만(선택 사항) */}
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>그날의 날씨 (선택)</span>

        {isToday ? (
          weatherLoading && !weatherAuto ? (
            <p className="text-xs text-muted-3">날씨를 확인하는 중…</p>
          ) : weatherAuto ? (
            <>
              <div className="flex min-h-10 items-center justify-between gap-2 rounded-xl border border-accent-border bg-accent-soft/45 px-3 py-2">
                <span className="text-sm font-semibold text-accent">
                  {WEATHER_ICON[weatherManual ?? weatherAuto.state]}{" "}
                  {WEATHER_LABEL[weatherManual ?? weatherAuto.state]}
                  {` · ${Math.round(weatherAuto.tempC)}°`}
                </span>
                <span className="shrink-0 text-[10px] font-medium text-muted-2">
                  서울 · 자동 확인
                </span>
              </div>
              <p className="text-[11px] leading-5 text-muted-2">
                오늘 날씨를 자동으로 가져왔어요. 다르게 기억한다면 바꿔주세요.
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-3">
              오늘 날씨를 확인하지 못했어요. 저장은 그대로 진행할 수 있어요.
            </p>
          )
        ) : (
          <p className="text-[11px] leading-5 text-muted-2">
            지난 날짜의 날씨는 확인할 수 없어요. 기억나면 아래에서 골라주세요.
          </p>
        )}

        {(isToday ? weatherAuto != null : true) && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="날씨 선택">
            {pastWeatherChoices().map((opt) => {
              const pressed = isToday
                ? (weatherManual ?? weatherAuto?.state) === opt.state
                : weatherManual === opt.state;
              return (
                <button
                  key={opt.state}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => pickWeather(opt.state)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    pressed
                      ? "bg-accent text-white"
                      : "bg-background text-muted-2 ring-1 ring-border hover:text-accent"
                  }`}
                >
                  {opt.icon} {opt.label}
                </button>
              );
            })}
          </div>
        )}

        {showWeatherNotice && (
          <p className="text-[11px] font-medium text-accent">
            날짜를 바꾸면 날씨가 그날과 다를 수 있어요. 필요하면 다시 골라주세요.
          </p>
        )}
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

                  <PhotoImage src={u} alt="" className="h-full w-full object-cover" />
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
              <span className="text-[11px] text-muted-3">
                촬영일 정보가 있으면 추억 날짜도 자동으로 입력해요.
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
