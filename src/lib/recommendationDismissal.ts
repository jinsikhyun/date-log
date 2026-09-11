import { haversineKm } from "@/lib/courses";

/**
 * AI 추천 "관심 없어요"(6단계) 정책 — 순수 함수만. DB·네트워크 없음.
 *
 * 2026-09-11 사용자 확정:
 *  - 개인 귀속: 누른 사람에게만 숨긴다(파트너 행은 RLS 로 애초에 안 읽힘 — 여기선 받은
 *    목록이 전부 "내 것"이라고 가정한다).
 *  - 사유는 선택 사항. 사유별로 재노출 제한 기간이 다르다(아래 DISMISS_DURATION_DAYS).
 *  - "너무 멀어요"는 그 요청 조건(출발지)에 대한 판단이지 영구 불호가 아니다 → 거절했을 때의
 *    출발지에서 TOO_FAR_ORIGIN_RADIUS_KM 안에서 다시 추천받을 때만 숨긴다. 다른 동네에서
 *    시작하면 같은 후보가 다시 나올 수 있다(의도).
 *  - "이미 알아요"는 불호가 아니다 → 재노출만 줄이고, AI 프롬프트에 부정 신호로 넣지 않는다
 *    (이 모듈은 후보 필터링에만 쓰이고 ai-recommend 프롬프트에는 전달되지 않는다).
 *  - 미저장·미클릭은 거절이 아니다 → 이 모듈은 명시적으로 기록된 행만 다룬다.
 *
 * 아래 숫자는 표본 없이 정한 초기값이다 — 실사용을 보고 조정한다.
 */

export const DISMISS_REASONS = ["too_far", "not_my_taste", "already_know"] as const;
export type DismissReason = (typeof DISMISS_REASONS)[number];

export const DISMISS_REASON_LABEL: Record<DismissReason, string> = {
  too_far: "너무 멀어요",
  not_my_taste: "취향이 아니에요",
  already_know: "이미 알아요",
};

/** 사유별 재노출 제한 기간(일). null = 사유 없이 눌렀을 때. */
export const DISMISS_DURATION_DAYS: Record<DismissReason | "none", number> = {
  not_my_taste: 180,
  already_know: 90,
  none: 90,
  too_far: 30,
};

/** "너무 멀어요"가 적용되는 출발지 반경(km). 이 안에서 시작한 요청에서만 그 후보를 숨긴다. */
export const TOO_FAR_ORIGIN_RADIUS_KM = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

export function dismissalExpiresAt(reason: DismissReason | null, now: Date = new Date()): Date {
  const days = DISMISS_DURATION_DAYS[reason ?? "none"];
  return new Date(now.getTime() + days * DAY_MS);
}

export function isDismissReason(value: unknown): value is DismissReason {
  return typeof value === "string" && (DISMISS_REASONS as readonly string[]).includes(value);
}

export interface DismissalRecord {
  candidateId: string;
  reason: DismissReason | null;
  /** 거절 당시의 기준점. too_far 판정에만 쓰인다. */
  originLat: number | null;
  originLng: number | null;
  expiresAt: Date | string;
}

export interface DismissalContext {
  now?: Date;
  /** 지금 추천을 요청하는 기준점(장소 상세 = 그 장소, 코스 = 마지막 정거장). */
  originLat: number;
  originLng: number;
}

/** 이 거절 기록이 지금 요청에서 후보를 숨겨야 하는지. */
export function isDismissalActive(d: DismissalRecord, ctx: DismissalContext): boolean {
  const now = ctx.now ?? new Date();
  const expires = d.expiresAt instanceof Date ? d.expiresAt : new Date(d.expiresAt);
  if (!(expires.getTime() > now.getTime())) return false;
  if (d.reason !== "too_far") return true;
  // too_far: 거절 당시 출발지 근처에서만. 출발지가 기록되지 않았으면(구버전 행 등) 보수적으로
  // "그 요청 조건"을 알 수 없으니 숨기지 않는다 — 영구 불호로 굳히지 않는다는 원칙 쪽으로.
  if (d.originLat == null || d.originLng == null) return false;
  const km = haversineKm(
    { lat: d.originLat, lng: d.originLng },
    { lat: ctx.originLat, lng: ctx.originLng },
  );
  return km <= TOO_FAR_ORIGIN_RADIUS_KM;
}

/** 지금 요청에서 숨겨야 할 후보 id 집합. */
export function activeDismissedIds(dismissals: DismissalRecord[], ctx: DismissalContext): Set<string> {
  const ids = new Set<string>();
  for (const d of dismissals) if (isDismissalActive(d, ctx)) ids.add(d.candidateId);
  return ids;
}

export function filterDismissed<T extends { id: string }>(
  candidates: T[],
  dismissals: DismissalRecord[],
  ctx: DismissalContext,
): { kept: T[]; hiddenCount: number } {
  const hidden = activeDismissedIds(dismissals, ctx);
  if (hidden.size === 0) return { kept: candidates, hiddenCount: 0 };
  const kept = candidates.filter((c) => !hidden.has(c.id));
  return { kept, hiddenCount: candidates.length - kept.length };
}
