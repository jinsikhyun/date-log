"use client";

import Link from "next/link";

const MOODS = ["❤️ 좋았어요", "🙂 괜찮았어요", "😐 아쉬웠어요"];

export function VisitMoodPrompt({
  placeId,
  placeName,
  busy = false,
  onMood,
  onClose,
  preview = false,
}: {
  placeId: number;
  placeName: string;
  busy?: boolean;
  onMood: (mood: string) => void;
  onClose: () => void;
  preview?: boolean;
}) {
  return (
    <div className="rounded-[22px] bg-card p-5 ring-1 ring-accent/25 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-foreground">
            오늘의 기록으로 옮겼어요 · {placeName}
          </p>
          <p className="mt-1 text-xs text-muted-2">
            오늘 어땠어요? 선택하지 않아도 기록은 이미 저장됐어요.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-xs text-muted-3 hover:text-accent"
        >
          닫기
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {MOODS.map((mood) => (
          <button
            key={mood}
            type="button"
            onClick={() => onMood(mood)}
            disabled={busy}
            className="rounded-full bg-accent-soft px-3.5 py-2 text-xs font-semibold text-accent transition hover:bg-accent hover:text-white disabled:opacity-50"
          >
            {mood}
          </button>
        ))}
      </div>
      <Link
        href={preview ? "#" : `/places/${placeId}`}
        className="mt-3 inline-block text-xs font-medium text-muted-2 underline decoration-border underline-offset-4 hover:text-accent"
      >
        사진이나 한줄평 더 남기기
      </Link>
    </div>
  );
}
