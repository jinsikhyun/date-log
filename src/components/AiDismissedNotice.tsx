"use client";

import {
  DISMISS_REASONS,
  DISMISS_REASON_LABEL,
  type DismissReason,
} from "@/lib/recommendationDismissal";
import type { DismissedEntry } from "@/lib/useAiDismiss";

/**
 * "관심 없어요"를 누른 뒤 카드 자리에 남는 한 줄.
 * 사유는 선택 사항(안 골라도 이미 숨겨졌다). 취소하면 카드가 원래 자리로 돌아온다.
 */
export function AiDismissedNotice({
  name,
  entry,
  onReason,
  onUndo,
  compact,
}: {
  name: string;
  entry: DismissedEntry;
  onReason: (reason: DismissReason) => void;
  onUndo: () => void;
  compact?: boolean;
}) {
  const ready = entry.id != null && !entry.busy;
  return (
    <div
      role="status"
      className={`flex flex-col gap-2 rounded-2xl border border-dashed border-border bg-[#faf8f4] text-[11px] text-muted-2 ${compact ? "px-3 py-2.5" : "px-4 py-3"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate">
          <span className="font-semibold text-foreground/80">{name}</span>
          {entry.reason ? (
            <>
              {" "}
              숨김 · {DISMISS_REASON_LABEL[entry.reason]}
            </>
          ) : (
            <> 을(를) 숨겼어요</>
          )}
        </p>
        <button
          type="button"
          onClick={onUndo}
          disabled={!ready}
          className="shrink-0 rounded-full px-2.5 py-1 font-semibold text-accent underline-offset-2 hover:underline disabled:opacity-50"
        >
          취소
        </button>
      </div>
      {!entry.reason && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-3">이유가 있다면(선택):</span>
          {DISMISS_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onReason(r)}
              disabled={!ready}
              className="rounded-full bg-white px-2.5 py-1 font-medium text-muted-2 ring-1 ring-border transition hover:text-foreground hover:ring-accent-border disabled:opacity-50"
            >
              {DISMISS_REASON_LABEL[r]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
