"use client";

import { useCallback, useState } from "react";
import type { DismissReason } from "@/lib/recommendationDismissal";

/**
 * AI 추천 "관심 없어요"(6단계) 클라이언트 상태 — 장소 상세 섹션과 코스 작성 화면이 공유한다.
 *
 * - dismiss(candidateId): 즉시 숨김(낙관적) → /api/ai-dismiss POST. 실패하면 되돌리고 에러 반환.
 * - setReason(candidateId, reason): 사유 선택(선택 사항) → PATCH. 사유는 기록만 바꾸고 UI 숨김 상태는 그대로.
 * - undo(candidateId): 취소 → DELETE. 카드가 원래 자리로 돌아온다.
 * - reset(): "다시 추천받기"처럼 목록이 통째로 바뀔 때 로컬 상태만 비운다(서버 기록은 유지 —
 *   다음 후보 수집에서 서버가 알아서 제외한다).
 *
 * 화면에는 "숨긴 후보"를 카드 대신 한 줄(AiDismissedNotice)로 남겨 사유 선택·취소를 그 자리에서
 * 하게 한다(2026-09-11 확정: 설정 페이지 목록은 이번 범위 아님).
 */

export interface DismissedEntry {
  /** 서버 행 id. POST 응답 전에는 null(그동안 사유/취소 버튼은 비활성). */
  id: number | null;
  reason: DismissReason | null;
  busy: boolean;
}

export type DismissMode = "place_detail" | "course";

async function call(method: "POST" | "PATCH" | "DELETE", body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch("/api/ai-dismiss", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof json.error === "string" ? json.error : "요청에 실패했어요.");
  }
  return json;
}

export function useAiDismiss(mode: DismissMode) {
  const [dismissed, setDismissed] = useState<Map<string, DismissedEntry>>(new Map());

  const patch = useCallback((candidateId: string, upd: Partial<DismissedEntry> | null) => {
    setDismissed((prev) => {
      const next = new Map(prev);
      if (upd === null) next.delete(candidateId);
      else next.set(candidateId, { ...(next.get(candidateId) ?? { id: null, reason: null, busy: false }), ...upd });
      return next;
    });
  }, []);

  const dismiss = useCallback(
    async (candidateId: string, origin?: { lat: number; lng: number } | null): Promise<string | null> => {
      patch(candidateId, { id: null, reason: null, busy: true }); // 즉시 숨김
      try {
        const json = await call("POST", {
          candidateId,
          mode,
          originLat: origin?.lat,
          originLng: origin?.lng,
        });
        patch(candidateId, { id: typeof json.id === "number" ? json.id : null, busy: false });
        return null;
      } catch (e) {
        patch(candidateId, null); // 실패 → 카드 복구
        return e instanceof Error ? e.message : "숨기지 못했어요.";
      }
    },
    [mode, patch],
  );

  const setReason = useCallback(
    async (candidateId: string, reason: DismissReason): Promise<string | null> => {
      const entry = dismissed.get(candidateId);
      if (!entry || entry.id == null || entry.busy) return null;
      const prevReason = entry.reason;
      patch(candidateId, { reason, busy: true });
      try {
        await call("PATCH", { id: entry.id, reason });
        patch(candidateId, { busy: false });
        return null;
      } catch (e) {
        patch(candidateId, { reason: prevReason, busy: false });
        return e instanceof Error ? e.message : "사유를 저장하지 못했어요.";
      }
    },
    [dismissed, patch],
  );

  const undo = useCallback(
    async (candidateId: string): Promise<string | null> => {
      const entry = dismissed.get(candidateId);
      if (!entry || entry.id == null || entry.busy) return null;
      patch(candidateId, { busy: true });
      try {
        await call("DELETE", { id: entry.id });
        patch(candidateId, null); // 카드 복귀
        return null;
      } catch (e) {
        patch(candidateId, { busy: false });
        return e instanceof Error ? e.message : "취소하지 못했어요.";
      }
    },
    [dismissed, patch],
  );

  const reset = useCallback(() => setDismissed(new Map()), []);

  return { dismissed, dismiss, setReason, undo, reset };
}
