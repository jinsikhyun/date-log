"use client";

import {
  AI_DATA_NOTICE,
  AI_STAGE_LABEL,
  type AiErrorView,
  type AiLoadStage,
} from "@/lib/aiRecommendClient";

/**
 * AI 추천 영역의 상태 표시 묶음 — 장소 상세·코스 만들기 공용.
 *  - AiLoadingSteps: 2단계(후보 수집 → 취향 기준 선별) 진행 표시. aria-live 로 스크린리더에도 단계 전환을 알린다.
 *  - AiErrorNotice: 분류된 오류 문구 + "다시 시도".
 *  - AiDataNotice: 어떤 데이터가 외부 AI 로 나가는지 한 줄 안내.
 */

const STAGES: Exclude<AiLoadStage, "idle">[] = ["candidates", "ranking"];

export function AiLoadingSteps({
  stage,
  compact = false,
}: {
  stage: AiLoadStage;
  compact?: boolean;
}) {
  if (stage === "idle") return null;
  const currentIdx = STAGES.indexOf(stage);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`flex flex-col gap-1.5 ${compact ? "text-[11px]" : "text-xs"}`}
    >
      {STAGES.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div
            key={s}
            className={`flex items-center gap-2 font-medium ${
              active ? "text-[#0d8065]" : done ? "text-muted-2" : "text-muted-3"
            }`}
          >
            <span
              aria-hidden
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] ${
                done
                  ? "bg-[#10a37f] text-white"
                  : active
                    ? "bg-[#10a37f]/15 text-[#0d8065] ring-1 ring-[#10a37f]/40"
                    : "bg-stone-100 text-muted-3"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span>
              {AI_STAGE_LABEL[s]}
              {active ? "…" : ""}
            </span>
            {active && (
              <span
                aria-hidden
                className="ml-0.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#10a37f]"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AiErrorNotice({
  error,
  onRetry,
  retrying = false,
  compact = false,
}: {
  error: AiErrorView;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col gap-2 rounded-xl bg-red-50/70 px-3 py-2.5 ring-1 ring-red-100 sm:flex-row sm:items-center sm:justify-between ${
        compact ? "text-[11px]" : "text-xs"
      }`}
    >
      <div className="min-w-0">
        <p className="font-semibold text-red-700">{error.title}</p>
        {error.hint && <p className="mt-0.5 text-red-700/80">{error.hint}</p>}
      </div>
      {error.retryable && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="shrink-0 self-start rounded-full bg-foreground px-3.5 py-1.5 text-[11px] font-semibold text-background transition hover:opacity-90 disabled:opacity-60 sm:self-auto"
        >
          다시 시도
        </button>
      )}
    </div>
  );
}

export function AiDataNotice({ compact = false }: { compact?: boolean }) {
  return (
    <p
      className={`leading-relaxed text-muted-2 ${compact ? "text-[10px]" : "text-[11px]"}`}
    >
      <span aria-hidden className="mr-1">
        🔒
      </span>
      {AI_DATA_NOTICE.long}
    </p>
  );
}
