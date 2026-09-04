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
}

/**
 * 장소 상세 상단 정보 바로 아래에 붙는 실제 AI 추천 UI.
 * 기본 접힘 — 처음 펼칠 때만 카카오 후보 수집 + OpenAI 호출(유료)을 실행한다.
 */
export function AiRecommendationSection({ place }: { place: Place }) {
  const { user, authorName } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState<AiRecommendation[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (place.lat == null || place.lng == null) {
      setError("이 장소의 좌표가 없어서 추천을 만들 수 없어요.");
      return;
    }
    setLoading(true);
    setError(null);
    setShowAll(false);
    try {
      const candRes = await fetch("/api/kakao-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: place.category,
          tags: place.tags,
          lat: place.lat,
          lng: place.lng,
          excludeAddress: place.address,
          limit: 20,
        }),
      });
      const candJson = await candRes.json();
      if (!candRes.ok) {
        throw new Error(candJson?.error || "근처 후보를 가져오지 못했어요.");
      }
      const candidates = candJson.candidates ?? [];
      if (candidates.length === 0) {
        setAll([]);
        return;
      }

      const recRes = await fetch("/api/ai-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      const recJson = await recRes.json();
      if (!recRes.ok) {
        throw new Error(recJson?.error || "추천을 가져오지 못했어요.");
      }
      setAll(recJson.recommendations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "추천을 가져오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [place]);

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

  const visible = (all ?? []).slice(0, showAll ? MAX_COUNT : INITIAL_COUNT);
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
              우리의 취향을 담은 추천 · GPT-5.6 Luna
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
          {loading && <p className="text-xs font-medium text-[#39816f]">✦ 취향을 살펴보고 추천을 만드는 중…</p>}
          {error && (
            <p className="text-sm font-medium text-red-600">{error}</p>
          )}
          {!loading && !error && all && all.length === 0 && (
            <p className="text-xs text-muted">
              주변에서 추천할 만한 새 장소를 찾지 못했어요.
            </p>
          )}

          {visible.length > 0 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((r) => (
                  <AiRecommendationCard
                    key={r.kakaoPlaceId}
                    place={toCardPlace(r)}
                    onAddToWishlist={() => void addToWishlist(r)}
                    adding={addingId === r.kakaoPlaceId}
                    added={addedIds.has(r.kakaoPlaceId)}
                  />
                ))}
              </div>
              <div className="mt-4 flex items-center justify-center gap-3">
                {!showAll && (all?.length ?? 0) > INITIAL_COUNT && (
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
        </div>
      )}
    </section>
  );
}
