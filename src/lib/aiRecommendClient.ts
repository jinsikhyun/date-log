// AI 추천 클라이언트 공통 로직 — 장소 상세(AiRecommendationSection)와 코스 만들기(CourseForm)가 같이 쓴다.
//
// 추천은 두 번의 순차 호출로 만들어진다:
//   1) /api/kakao-candidates — 주변 장소 후보 수집(카카오 로컬)
//   2) /api/ai-recommend     — 우리 기록(tasteProfile) 기준으로 OpenAI 가 고름
// 예전에는 둘을 하나의 loading 불리언으로 묶어 15초 넘게 "만드는 중…"만 보였고,
// 타임아웃도 없어서 서버가 늦으면 무한 대기였다. 여기서 단계·타임아웃·오류 분류를 한 곳에 둔다.

export type AiLoadStage = "idle" | "candidates" | "ranking";

export const AI_STAGE_LABEL: Record<Exclude<AiLoadStage, "idle">, string> = {
  candidates: "주변 장소를 찾는 중",
  ranking: "우리 기록을 바탕으로 고르는 중",
};

/** 단계별 타임아웃. 카카오 후보는 보통 1~3초, OpenAI 는 5~20초 — 리뷰 권고(20~30초) 안쪽. */
export const AI_TIMEOUT_MS: Record<Exclude<AiLoadStage, "idle">, number> = {
  candidates: 12_000,
  ranking: 25_000,
};

export type AiErrorKind =
  | "timeout"
  | "network"
  | "rate_limit"
  | "auth"
  | "server"
  | "client"
  | "aborted";

export class AiRecommendError extends Error {
  readonly kind: AiErrorKind;
  readonly stage: Exclude<AiLoadStage, "idle">;
  readonly status: number | null;

  constructor(
    kind: AiErrorKind,
    stage: Exclude<AiLoadStage, "idle">,
    message: string,
    status: number | null = null,
  ) {
    super(message);
    this.name = "AiRecommendError";
    this.kind = kind;
    this.stage = stage;
    this.status = status;
  }
}

/**
 * JSON POST + 단계별 타임아웃. 서버가 4xx 로 돌려준 `error` 문구는 이미 사용자용 한국어라
 * 그대로 살리고, 5xx·타임아웃·네트워크는 kind 로 분류해 describeAiError 가 문구를 정한다.
 */
export async function postAiStage<T>(
  stage: Exclude<AiLoadStage, "idle">,
  url: string,
  body: unknown,
  outerSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), AI_TIMEOUT_MS[stage]);
  const onOuterAbort = () => controller.abort("outer");
  outerSignal?.addEventListener("abort", onOuterAbort, { once: true });

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) {
      if (controller.signal.reason === "timeout") {
        throw new AiRecommendError("timeout", stage, "timeout");
      }
      throw new AiRecommendError("aborted", stage, "aborted");
    }
    throw new AiRecommendError(
      "network",
      stage,
      e instanceof Error ? e.message : "network",
    );
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener("abort", onOuterAbort);
  }

  let json: (T & { error?: string }) | null = null;
  try {
    json = (await res.json()) as T & { error?: string };
  } catch {
    json = null;
  }

  if (!res.ok) {
    const serverMsg = typeof json?.error === "string" ? json.error : "";
    const kind: AiErrorKind =
      res.status === 429
        ? "rate_limit"
        : res.status === 401 || res.status === 403
          ? "auth"
          : res.status >= 500
            ? "server"
            : "client";
    throw new AiRecommendError(kind, stage, serverMsg, res.status);
  }
  if (json == null) {
    throw new AiRecommendError("server", stage, "empty", res.status);
  }
  return json;
}

export type AiErrorView = {
  title: string;
  hint: string | null;
  /** 재시도 버튼을 보여줄지 — 좌표 없음·권한 없음처럼 다시 눌러도 같은 결과면 숨긴다. */
  retryable: boolean;
};

/** 오류 → 화면 문구. 서버 원문(스택·영문 메시지)을 그대로 노출하지 않는다. */
export function describeAiError(err: unknown): AiErrorView {
  if (err instanceof AiRecommendError) {
    const stageLabel = AI_STAGE_LABEL[err.stage];
    switch (err.kind) {
      case "timeout":
        return {
          title:
            err.stage === "candidates"
              ? "주변 장소를 찾는 데 시간이 너무 걸려요."
              : "추천을 고르는 데 시간이 너무 걸려요.",
          hint: "잠시 후 다시 시도해 주세요.",
          retryable: true,
        };
      case "network":
        return {
          title: "네트워크 연결이 불안정해요.",
          hint: "연결을 확인하고 다시 시도해 주세요.",
          retryable: true,
        };
      case "rate_limit":
        return {
          title: "추천 요청이 너무 잦아요.",
          hint: err.message || "잠시 후 다시 시도해 주세요.",
          retryable: true,
        };
      case "auth":
        return {
          title: err.message || "로그인이 필요해요.",
          hint: null,
          retryable: false,
        };
      case "server":
        return {
          title: `${stageLabel}에 잠시 문제가 있어요.`,
          hint: "우리 쪽 문제예요. 잠시 후 다시 시도해 주세요.",
          retryable: true,
        };
      case "client":
        return {
          title: err.message || "요청을 처리하지 못했어요.",
          hint: null,
          retryable: true,
        };
      case "aborted":
        return { title: "추천을 취소했어요.", hint: null, retryable: true };
    }
  }
  if (err instanceof Error && err.message) {
    // 좌표 없음 등 클라이언트가 직접 만든 안내 문구
    return { title: err.message, hint: null, retryable: false };
  }
  return {
    title: "추천을 가져오지 못했어요.",
    hint: "잠시 후 다시 시도해 주세요.",
    retryable: true,
  };
}

// ── 데이터 사용 안내 ─────────────────────────────────────────
// 실제 전송 payload(api/ai-recommend/route.ts userPayload) 와 tasteProfile.ts 의 예산 정책을
// 그대로 문장으로 옮긴 것. 정책이 바뀌면 이 문구도 같이 바꿔야 한다.
//  - place: 이름·카테고리·주소·설명
//  - tasteProfile: 장소 이름·카테고리·별점·확정 태그·단골/pick 사실 + 추억 한줄평 발췌
//    (장소당 1개, 요청당 최대 QUOTE_BUDGET_TOTAL=10곳, 각 QUOTE_MAX_CHARS=80자)
//  - 두 사람의 이름은 member_1/2 로 치환되어 나가지 않음. 사진·좌표 기록 전체는 보내지 않음.
export const AI_DATA_NOTICE = {
  /** 토글 헤더 부제 — 모델명 대신 "무엇을 바탕으로" 추천하는지 */
  short: "이 장소 정보와 우리 기록에서 고른 추억 일부를 바탕으로 추천해요",
  /** 펼친 영역 하단 각주 */
  long:
    "추천을 만들 때 이 장소의 이름·카테고리·주소와, 우리 기록에서 고른 장소 정보(이름·카테고리·별점·태그)와 추억 한줄평 발췌(최대 10곳, 각 80자)가 OpenAI(GPT-5.6 Luna)로 전송돼요. 두 사람의 이름, 사진, 추억 전문은 보내지 않아요.",
} as const;

// ── 추천 카드 근거 표시 ─────────────────────────────────────
export type AiRecommendationOrigin = "wishlist" | "new";

/**
 * "음식점 > 일식 > 일본식라면" → "일식 · 일본식라면". 대분류(음식점/카페 등)는 이미 카테고리
 * 배지로 보이므로 빼고, 우리 카테고리와 같은 조각 하나만 남으면 null(중복 표시 방지).
 */
export function kakaoCategoryDetail(
  categoryName: string | null | undefined,
  category: string,
): string | null {
  if (!categoryName) return null;
  const parts = categoryName
    .split(">")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return parts[0] && parts[0] !== category ? parts[0] : null;
  const detail = parts.slice(1).filter((p) => p !== category);
  if (detail.length === 0) return null;
  return detail.slice(-2).join(" · ");
}

export const ORIGIN_LABEL: Record<AiRecommendationOrigin, string> = {
  wishlist: "우리 위시리스트",
  new: "새로 발견",
};
