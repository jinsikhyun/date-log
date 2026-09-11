"use client";

import { useCallback, useState } from "react";
import {
  AiRecommendationCard,
  type AiRecommendedPlace,
} from "@/components/AiRecommendationCard";
import { placeInputToRow, type Place } from "@/lib/places";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { GptMark } from "@/components/GptMark";
import { AiDismissedNotice } from "@/components/AiDismissedNotice";
import { useAiDismiss } from "@/lib/useAiDismiss";
import {
  AiDataNotice,
  AiErrorNotice,
  AiLoadingSteps,
} from "@/components/AiRecommendationStatus";
import {
  AI_DATA_NOTICE,
  describeAiError,
  postAiStage,
  type AiErrorView,
  type AiLoadStage,
} from "@/lib/aiRecommendClient";

// AI_RECOMMENDATION_HANDOFF.md §2·§3: 기본 3개, "더보기"로 최대 5개까지.
// "더보기"는 새 API 호출 없이 이미 받아둔 결과 중 숨겨둔 2개를 더 보여주기만 한다.
const INITIAL_COUNT = 3;
const MAX_COUNT = 5;

function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

interface AiRecommendation {
  kakaoPlaceId: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  distanceMeters: number | null;
  reason: string;
  matchedTags: string[];
  kakaoMapUrl: string | null;
  alreadyOnWishlist?: boolean;
  wishPlaceId?: number | null;
  kakaoCategoryName?: string | null;
}

/**
 * 장소 상세 상단 정보 바로 아래에 붙는 실제 AI 추천 UI.
 * 기본 접힘 — 처음 펼칠 때만 카카오 후보 수집 + OpenAI 호출(유료)을 실행한다.
 */
export function AiRecommendationSection({ place }: { place: Place }) {
  const { user, authorName } = useAuth();
  const [open, setOpen] = useState(false);
  // 로딩을 단계로 나눈다: 후보 수집(카카오) → 취향 기준 선별(OpenAI). 이전엔 둘을 하나의
  // 불리언으로 묶어 15초 넘게 같은 문구만 보였다. loading 은 파생값.
  const [stage, setStage] = useState<AiLoadStage>("idle");
  const loading = stage !== "idle";
  // 추천 요청 실패(분류된 문구 + 재시도)와 카드 액션 실패(위시 추가·숨김)는 성격이 달라 분리한다.
  const [loadError, setLoadError] = useState<AiErrorView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState<AiRecommendation[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  // §6단계 "관심 없어요": 누른 사람에게만 숨김. 서버 기록은 다음 후보 수집에서 제외되고,
  // 이 화면에서는 카드 자리에 한 줄(사유 선택·취소)로 남는다.
  const { dismissed, dismiss, setReason, undo, reset: resetDismissed } = useAiDismiss("place_detail");

  const load = useCallback(async () => {
    if (place.lat == null || place.lng == null) {
      setLoadError({
        title: "이 장소의 좌표가 없어서 추천을 만들 수 없어요.",
        hint: "장소 정보를 수정해 주소를 다시 저장하면 좌표가 채워져요.",
        retryable: false,
      });
      return;
    }
    setLoadError(null);
    setError(null);
    setShowAll(false);
    resetDismissed(); // 새 목록이 오면 이전 "숨김" 줄은 지운다(서버 기록은 유지).
    try {
      setStage("candidates");
      const candJson = await postAiStage<{ candidates?: unknown[] }>(
        "candidates",
        "/api/kakao-candidates",
        {
          category: place.category,
          tags: place.tags,
          name: place.name,
          kakaoMapLink: place.kakao_map_link,
          lat: place.lat,
          lng: place.lng,
          excludeAddress: place.address,
          limit: 20,
        },
      );
      const candidates = candJson.candidates ?? [];
      if (candidates.length === 0) {
        setAll([]);
        return;
      }

      setStage("ranking");
      const recJson = await postAiStage<{ recommendations?: AiRecommendation[] }>(
        "ranking",
        "/api/ai-recommend",
        {
          place: {
            name: place.name,
            category: place.category,
            address: place.address,
            description: place.description,
            tags: place.tags,
            lat: place.lat,
            lng: place.lng,
          },
          candidates,
          count: MAX_COUNT,
        },
      );
      setAll(recJson.recommendations ?? []);
    } catch (e) {
      setLoadError(describeAiError(e));
    } finally {
      setStage("idle");
    }
  }, [place, resetDismissed]);

  const toggle = () => {
    setOpen((o) => !o);
    if (!open && all === null && !loading) void load();
  };

  /** 카드의 "+ 위시리스트" — 새로 발견한 곳을 date.log 위시리스트에 저장한다. */
  const addToWishlist = async (r: AiRecommendation) => {
    if (!user || !authorName) {
      setError("프로필 이름이 없어요. 설정에서 이름을 먼저 정해 주세요.");
      return;
    }
    setAddingId(r.kakaoPlaceId);
    try {
      const { error: insErr } = await supabase.from("places").insert({
        ...placeInputToRow({
          name: r.name,
          category: r.category,
          address: r.address,
          naver_map_link: "",
          kakao_map_link: r.kakaoMapUrl ?? "",
          rating: "",
          first_visit_date: "",
          description: "",
          image_url: "",
          image_captured_date: "",
          lat: String(r.lat),
          lng: String(r.lng),
          status: "wishlist",
          // 추천을 저장한 본인이 우선 가고 싶은 사람. 상세/위시 화면에서
          // 파트너도 독립적으로 추가할 수 있다.
          wanted_by_ids: [user.id],
          added_by: authorName,
          // AI가 이 후보를 고른 근거(matchedTags)를 그대로 저장 — 다음 추천 때
          // "커플이 선호해온 태그"로 다시 프롬프트에 들어가 취향을 좁혀준다.
          tags: [], // 추천 근거는 사용자 확인 태그가 아니다.
        }),
        ai_suggested_tags: r.matchedTags,
      });
      if (insErr) {
        throw new Error(
          insErr.code === "23505"
            ? "이미 같은 이름·주소의 장소가 우리 목록에 있어요."
            : insErr.message,
        );
      }
      setAddedIds((prev) => new Set(prev).add(r.kakaoPlaceId));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "위시리스트 추가에 실패했어요.",
      );
    } finally {
      setAddingId(null);
    }
  };

  const onDismiss = async (r: AiRecommendation) => {
    const msg = await dismiss(
      r.kakaoPlaceId,
      place.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng } : null,
    );
    if (msg) setError(msg);
  };

  // 숨긴 후보는 카드 목록에서 빠지고(뒤에 있던 후보가 자연스럽게 앞으로 올라옴),
  // 그리드 아래에 "숨김" 줄로 남는다.
  const notDismissed = (all ?? []).filter((r) => !dismissed.has(r.kakaoPlaceId));
  const visible = notDismissed.slice(0, showAll ? MAX_COUNT : INITIAL_COUNT);
  const dismissedList = (all ?? []).filter((r) => dismissed.has(r.kakaoPlaceId));
  const toCardPlace = (r: AiRecommendation): AiRecommendedPlace => ({
    id: r.kakaoPlaceId,
    name: r.name,
    category: r.category,
    address: r.address,
    reason: r.reason,
    tags: r.matchedTags,
    distanceLabel: r.distanceMeters != null ? fmtDist(r.distanceMeters) : null,
    imageUrl: null, // 새로 발견한 곳이라 date.log 사진이 없음 — 카드가 이모지로 대체
    kakaoMapUrl: r.kakaoMapUrl,
    // 장소 상세 모드는 위시 후보를 주입하지 않아 모든 카드가 "새로 발견"이 된다 — 전부에
    // 같은 배지가 붙으면 정보가 아니라 장식이라 생략한다. (위시 후보가 섞이는 코스 모드에서만
    // 출처 배지를 보여준다.) 혹시 서버가 위시 후보를 돌려주면 그때만 표시.
    origin: r.alreadyOnWishlist ? "wishlist" : undefined,
    kakaoCategoryName: r.kakaoCategoryName ?? null,
  });

  return (
    <section id="ai-recommendations" aria-label="AI 장소 추천" className="scroll-mt-5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="group flex w-full items-center justify-between rounded-[22px] border border-[#10a37f]/25 bg-[linear-gradient(110deg,#f0faf6_0%,#fffaf2_72%)] px-5 py-4 text-left shadow-[0_10px_28px_-24px_rgba(16,163,127,0.75)] transition duration-200 hover:-translate-y-0.5 hover:border-[#10a37f]/45 hover:shadow-[0_16px_34px_-24px_rgba(16,163,127,0.85)]"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#10a37f] text-white shadow-sm">
            <GptMark className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-foreground sm:text-[15px]">
              AI 추천 · 이런 곳은 어때요?
            </span>
            <span className="mt-0.5 block text-[11px] font-medium text-[#39816f]">
              {AI_DATA_NOTICE.short}
            </span>
          </span>
        </span>
        <span
          aria-hidden
          className={`ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/80 text-xs text-[#0d8065] ring-1 ring-[#10a37f]/15 transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="mt-3 rounded-[22px] border border-[#10a37f]/20 bg-[linear-gradient(180deg,#fbfffd_0%,#ffffff_24%)] p-5 shadow-[0_14px_34px_-30px_rgba(16,163,127,0.7)]">
          <AiLoadingSteps stage={stage} />
          {!loading && loadError && (
            <AiErrorNotice error={loadError} onRetry={() => void load()} />
          )}
          {error && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {error}
            </p>
          )}
          {!loading && !loadError && all && all.length === 0 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted">
                주변에서 추천할 만한 새 장소를 찾지 못했어요.
              </p>
              <button
                type="button"
                onClick={() => void load()}
                className="self-start rounded-full bg-stone-100 px-3.5 py-1.5 text-[11px] font-semibold text-stone-600 hover:bg-stone-200 sm:self-auto"
              >
                다시 찾아보기
              </button>
            </div>
          )}
          {!loading && !loadError && all && all.length > 0 && notDismissed.length === 0 && (
            <p className="text-xs text-muted">
              추천을 모두 숨겼어요. 아래에서 취소하거나 다시 추천받을 수 있어요.
            </p>
          )}

          {visible.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((r) => (
                  <AiRecommendationCard
                    key={r.kakaoPlaceId}
                    place={toCardPlace(r)}
                    onAddToWishlist={() => void addToWishlist(r)}
                    adding={addingId === r.kakaoPlaceId}
                    added={addedIds.has(r.kakaoPlaceId)}
                    onDismiss={() => void onDismiss(r)}
                  />
                ))}
              </div>
          )}

          {dismissedList.length > 0 && (
            <div className={`flex flex-col gap-2 ${visible.length > 0 ? "mt-4" : ""}`}>
              {dismissedList.map((r) => (
                <AiDismissedNotice
                  key={`dismissed-${r.kakaoPlaceId}`}
                  name={r.name}
                  entry={dismissed.get(r.kakaoPlaceId)!}
                  onReason={(reason) => void setReason(r.kakaoPlaceId, reason).then((m) => m && setError(m))}
                  onUndo={() => void undo(r.kakaoPlaceId).then((m) => m && setError(m))}
                />
              ))}
            </div>
          )}

          {(visible.length > 0 || dismissedList.length > 0) && (
            <>
              <div className="mt-4 flex items-center justify-center gap-3">
                {!showAll && notDismissed.length > INITIAL_COUNT && (
                  <button
                    type="button"
                    onClick={() => setShowAll(true)}
                    className="rounded-full bg-stone-100 px-4 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-200"
                  >
                    더보기
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={loading}
                  className="rounded-full bg-foreground px-4 py-1.5 text-xs font-semibold text-background disabled:opacity-60"
                >
                  다시 추천받기
                </button>
              </div>
            </>
          )}

          {/* 데이터 사용 안내 — 실제로 무엇이 외부 AI 로 나가는지(tasteProfile 예산 정책 그대로). */}
          <div className="mt-4 border-t border-border/60 pt-3">
            <AiDataNotice />
          </div>
        </div>
      )}
    </section>
  );
}
