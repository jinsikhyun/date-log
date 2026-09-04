"use client";

import PhotoImage from "@/components/PhotoImage";
import { useCallback, useEffect, useRef, useState } from "react";
import { withPreferences } from "@/lib/preferences";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  type Place,
  addedByLabel,
  categoryStyle,
  placeInputToRow,
} from "@/lib/places";
import {
  type Memory,
  type MemoryReply,
  MEMORY_COLUMNS,
  MEMORY_REPLY_COLUMNS,
  byDateAsc,
} from "@/lib/memories";
import { StarRating } from "@/components/StarRating";
import { AddMemoryForm, type NewMemoryInput } from "@/components/AddMemoryForm";
import { PhotoThumbnails } from "@/components/PhotoThumbnails";
import { MemoryReplies } from "@/components/MemoryReplies";
import { Reactions } from "@/components/Reactions";
import { type Reaction, REACTION_COLUMNS } from "@/lib/reactions";
import { NearbySimilar } from "@/components/NearbySimilar";
import { AiRecommendationSection } from "@/components/AiRecommendationSection";
import { SharePlaceButton } from "@/components/SharePlaceButton";
import { DirectionsButton } from "@/components/DirectionsButton";
import {
  PlaceTagBadges,
  HeartMini,
  CrownMini,
} from "@/components/PlaceTagBadges";
import { Lightbox } from "@/components/Lightbox";
import { useAuth } from "@/components/AuthProvider";
import { useAnniversaries } from "@/hooks/useAnniversaries";
import { anniversariesOn } from "@/lib/anniversaries";
import {
  AddPlaceForm,
  placeFormInput,
  type NewPlaceInput,
} from "@/components/AddPlaceForm";

const PLACE_COLUMNS =
  "id, name, category, address, naver_map_link, kakao_map_link, rating, first_visit_date, description, image_url, image_captured_date, lat, lng, status, wanted_by, wanted_by_ids, added_by, place_preferences(user_id, kind), is_regular, via_course, memory_count, created_at, tags";

const POLICY_HINT =
  "저장 권한이 없거나 세션이 만료됐어요. 다시 로그인하거나 커플 연결 상태를 확인해 주세요.";

const dot = (d: string | null) => (d ? d.split("-").join(".") : "날짜 미정");

/** memories 행 → 추억 폼 초기값 (수정 시) */
function memoryToInput(m: Memory): NewMemoryInput {
  return {
    date: m.date ?? "",
    content: m.content ?? "",
    mood_tag: m.mood_tag ?? "",
    author: m.author ?? "", // 원 작성자 유지 (AddMemoryForm 이 비었을 때만 현재 사용자로 채움)
    photo_urls: m.photo_urls ?? [],
  };
}

export function PlaceDetail({ id }: { id: number }) {
  const router = useRouter();
  const { user } = useAuth();
  const anniversaries = useAnniversaries();
  const favLock = useRef(false);
  const [favSaving, setFavSaving] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMemoryForm, setShowMemoryForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<number | null>(null);
  const [deletingMemoryId, setDeletingMemoryId] = useState<number | null>(null);
  const [repliesByMemory, setRepliesByMemory] = useState<
    Record<number, MemoryReply[]>
  >({});
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [favError, setFavError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setError("장소를 찾을 수 없어요.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const [placeRes, memRes] = await Promise.all([
        supabase.from("places").select(PLACE_COLUMNS).eq("id", id).single(),
        supabase
          .from("memories")
          .select(`${MEMORY_COLUMNS}, memory_replies(${MEMORY_REPLY_COLUMNS})`)
          .eq("place_id", id),
      ]);
      if (cancelled) return;

      if (placeRes.error || !placeRes.data) {
        const missingTagsCol = /column .*tags.* does not exist/i.test(
          placeRes.error?.message ?? "",
        );
        setError(
          placeRes.error?.code === "PGRST116"
            ? "장소를 찾을 수 없어요."
            : missingTagsCol
              ? "tags 컬럼이 아직 없어요. supabase/add-place-tags.sql 을 Supabase SQL Editor에서 실행하세요."
              : `장소를 불러오지 못했어요: ${placeRes.error?.message ?? "알 수 없는 오류"}`,
        );
        setLoading(false);
        return;
      }

      // 코스 전용 장소는 독립적인 상세 페이지가 없다 (오직 그 코스 안에서만)
      if (placeRes.data.status === "course_only") {
        setError("장소를 찾을 수 없어요.");
        setLoading(false);
        return;
      }

      setPlace(withPreferences(placeRes.data as unknown as Place));
      if (memRes.error) {
        console.error("[memories] 조회 실패:", memRes.error);
      } else {
        const rows = (memRes.data ?? []) as (Memory & {
          memory_replies?: MemoryReply[];
        })[];
        const byMem: Record<number, MemoryReply[]> = {};
        const mems = rows.map((row) => {
          const { memory_replies, ...m } = row;
          byMem[m.id] = (memory_replies ?? [])
            .slice()
            .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
          return m as Memory;
        });
        setMemories(mems.sort(byDateAsc));
        setRepliesByMemory(byMem);

        // 추억 + 답글에 달린 이모지 반응 한 번에 로드
        const targetIds = [
          ...mems.map((m) => m.id),
          ...Object.values(byMem).flat().map((r) => r.id),
        ];
        if (targetIds.length > 0) {
          const { data: rx } = await supabase
            .from("reactions")
            .select(REACTION_COLUMNS)
            .in("target_id", targetIds);
          if (!cancelled) setReactions((rx ?? []) as Reaction[]);
        }
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleAddMemory = useCallback(
    async (input: NewMemoryInput) => {
      const row = {
        place_id: id,
        date: input.date || null,
        content: input.content.trim(),
        mood_tag: input.mood_tag.trim() || null,
        author: input.author || null,
        photo_urls: input.photo_urls,
      };

      const { data, error: insErr } = await supabase
        .from("memories")
        .insert(row)
        .select(MEMORY_COLUMNS)
        .single();

      if (insErr) {
        console.error("[memories] 추가 실패:", insErr);
        throw new Error(insErr.message);
      }

      setMemories((prev) => [...prev, data as Memory].sort(byDateAsc));
      setShowMemoryForm(false);
    },
    [id],
  );

  const handleEditMemory = useCallback(
    async (memoryId: number, input: NewMemoryInput) => {
      const { data, error: upErr } = await supabase
        .from("memories")
        .update({
          date: input.date || null,
          content: input.content.trim(),
          mood_tag: input.mood_tag.trim() || null,
          author: input.author || null,
          photo_urls: input.photo_urls,
        })
        .eq("id", memoryId)
        .select(MEMORY_COLUMNS);

      if (upErr) {
        console.error("[memories] 수정 실패:", upErr);
        throw new Error(upErr.message);
      }
      if (!data || data.length === 0) {
        throw new Error(`수정이 반영되지 않았어요. ${POLICY_HINT}`);
      }

      setMemories((prev) =>
        prev
          .map((mm) => (mm.id === memoryId ? (data[0] as Memory) : mm))
          .sort(byDateAsc),
      );
      setEditingMemoryId(null);
    },
    [],
  );

  const handleDeleteMemory = useCallback(async (memoryId: number) => {
    if (!window.confirm("이 추억을 삭제할까요? 되돌릴 수 없어요.")) return;

    setDeletingMemoryId(memoryId);
    const { data, error: delErr } = await supabase
      .from("memories")
      .delete()
      .eq("id", memoryId)
      .select("id");

    setDeletingMemoryId(null);
    if (delErr) {
      window.alert(`삭제하지 못했어요: ${delErr.message}`);
      return;
    }
    if (!data || data.length === 0) {
      window.alert(`삭제되지 않았어요. ${POLICY_HINT}`);
      return;
    }
    setMemories((prev) => prev.filter((mm) => mm.id !== memoryId));
  }, []);

  const handleEditPlace = useCallback(
    async (input: NewPlaceInput) => {
      const { data, error: upErr } = await supabase
        .from("places")
        .update(placeInputToRow(input))
        .eq("id", id)
        .select(PLACE_COLUMNS);

      if (upErr) {
        console.error("[places] 수정 실패:", upErr);
        throw new Error(upErr.message);
      }
      if (!data || data.length === 0) {
        // RLS 로 UPDATE 가 막히면 에러 없이 0행이 돌아온다
        throw new Error(`수정이 반영되지 않았어요. ${POLICY_HINT}`);
      }

      setPlace(withPreferences(data[0] as unknown as Place));
      setEditing(false);
    },
    [id],
  );

  // pick은 본인 행만, 단골은 커플 공동 값. 저장 후 서버 상태로 갱신.
  const toggleFavorite = useCallback(
    async (
      target: { kind: "member"; memberId: string } | { kind: "regular" },
    ) => {
      if (!place || !user || favLock.current) return;
      if (target.kind === "member" && target.memberId !== user.id) return;
      favLock.current = true;
      setFavSaving(true);
      setFavError(null);
      try {
        if (target.kind === "regular") {
          const { data, error } = await supabase.from("places")
            .update({ is_regular: !place.is_regular }).eq("id", id).select("id");
          if (error) throw error;
          if (!data?.length) throw new Error(POLICY_HINT);
        } else if ((place.favorite_by ?? []).includes(user.id)) {
          const { error } = await supabase.from("place_preferences").delete()
            .eq("place_id", id).eq("user_id", user.id).eq("kind", "pick");
          if (error) throw error;
        } else {
          const { error } = await supabase.from("place_preferences")
            .insert({ place_id: id, user_id: user.id, kind: "pick" });
          // 다른 탭에서 이미 켰다면 같은 최종 상태이므로 재조회한다.
          if (error && error.code !== "23505") throw error;
        }
        const { data, error } = await supabase.from("places").select(PLACE_COLUMNS).eq("id", id).single();
        if (error) throw error;
        setPlace(withPreferences(data as unknown as Place));
      } catch {
        setFavError("저장 상태를 확인하지 못했어요. 새로고침 후 다시 확인해 주세요.");
      } finally {
        favLock.current = false;
        setFavSaving(false);
      }
    },
    [place, id, user],
  );

  const handleDeletePlace = useCallback(async () => {
    if (!place) return;
    const ok = window.confirm(
      memories.length > 0
        ? `'${place.name}'을(를) 삭제할까요?\n연결된 추억 ${memories.length}개도 함께 삭제되며 되돌릴 수 없어요.`
        : `'${place.name}'을(를) 삭제할까요? 되돌릴 수 없어요.`,
    );
    if (!ok) return;

    setDeleting(true);
    const { data, error: delErr } = await supabase
      .from("places")
      .delete()
      .eq("id", id)
      .select("id");

    if (delErr) {
      console.error("[places] 삭제 실패:", delErr);
      setDeleting(false);
      window.alert(`삭제하지 못했어요: ${delErr.message}`);
      return;
    }
    if (!data || data.length === 0) {
      setDeleting(false);
      window.alert(`삭제되지 않았어요. ${POLICY_HINT}`);
      return;
    }

    // 연결된 memories 는 FK ON DELETE CASCADE 로 함께 삭제됨
    router.push(place.status === "wishlist" ? "/wishlist" : "/");
  }, [id, place, memories.length, router]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-56 animate-pulse rounded-[20px] bg-[#efe7d6]" />
        <div className="h-24 animate-pulse rounded-[20px] bg-[#efe7d6]" />
      </div>
    );
  }

  if (error || !place) {
    return (
      <div className="rounded-[20px] bg-card p-10 text-center ring-1 ring-border">
        <p className="text-sm text-muted">{error ?? "장소를 찾을 수 없어요."}</p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white"
        >
          홈으로
        </Link>
      </div>
    );
  }

  const visited = place.first_visit_date
    ? place.first_visit_date.split("-").join(".")
    : null;
  const visitAnniversaries = anniversariesOn(anniversaries, place.first_visit_date);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-accent"
        >
          ← 홈으로
        </Link>
        {!editing && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="whitespace-nowrap rounded-full bg-background px-3.5 py-1.5 text-sm font-medium text-muted-2 transition-colors hover:brightness-95"
            >
              수정
            </button>
            <button
              type="button"
              onClick={handleDeletePlace}
              disabled={deleting}
              className="whitespace-nowrap rounded-full bg-red-50 px-3.5 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60"
            >
              {deleting ? "삭제 중…" : "삭제"}
            </button>
          </div>
        )}
      </div>

      {/* 장소 헤더 (수정 중이면 폼으로 교체) */}
      {editing ? (
        <AddPlaceForm
          initial={placeFormInput(place)}
          submitLabel="수정 저장"
          onSubmit={handleEditPlace}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <header className="overflow-hidden rounded-[20px] bg-card ring-1 ring-border">
          <div className="relative aspect-[16/7] overflow-hidden bg-gradient-to-br from-stone-200 to-stone-300">
            {place.image_url && (
              <button
                type="button"
                onClick={() => setPhotoOpen(true)}
                aria-label="대표 사진 크게 보기"
                className="group absolute inset-0 block cursor-zoom-in"
              >

                <PhotoImage
                  src={place.image_url}
                  alt={place.name}
                  className="h-full w-full object-cover transition duration-200 group-hover:brightness-90"
                />
              </button>
            )}
            <span
              className={`absolute left-5 top-5 z-[1] rounded-full px-3 py-1 text-xs font-semibold ${categoryStyle(
                place.category,
              )}`}
            >
              {place.category}
            </span>
            {place.status === "visited" && (
              <PlaceTagBadges
                favoriteBy={place.favorite_by}
                isRegular={place.is_regular}
                size="md"
              />
            )}
            {photoOpen && place.image_url && (
              <Lightbox
                urls={[place.image_url]}
                onClose={() => setPhotoOpen(false)}
              />
            )}
          </div>
          <div className="flex flex-col gap-3 p-6 sm:p-8">
            <h1 className="text-2xl font-extrabold tracking-[-0.02em]">{place.name}</h1>
            {(visited || addedByLabel(place.added_by)) && (
              <p className="text-xs text-muted">
                {[visited, addedByLabel(place.added_by)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}

            {/* 픽/단골 컨트롤 — 다녀온 곳에서만. 배경/테두리 없는 텍스트 버튼. */}
            {place.status === "visited" && (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  {user && (
                    <button
                      type="button"
                      disabled={favSaving}
                      onClick={() => toggleFavorite({ kind: "member", memberId: user.id })}
                      aria-pressed={(place.favorite_by ?? []).includes(user.id)}
                      className={`flex cursor-pointer items-center gap-1 text-sm font-semibold transition-colors disabled:cursor-default ${
                        (place.favorite_by ?? []).includes(user.id)
                          ? "text-accent"
                          : "text-muted hover:text-accent"
                      }`}
                    >
                      <HeartMini className="h-4 w-4" />
                      내 pick으로 등록
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!user || favSaving}
                    onClick={() => toggleFavorite({ kind: "regular" })}
                    aria-pressed={place.is_regular}
                    className={`flex cursor-pointer items-center gap-1 text-sm font-semibold transition-colors ${
                      place.is_regular
                        ? "text-amber-600"
                        : "text-muted hover:text-amber-600"
                    }`}
                  >
                    <CrownMini className="h-4 w-4" />
                    단골
                  </button>
                </div>
                {favError && (
                  <p className="text-xs font-medium text-red-600">{favError}</p>
                )}
              </>
            )}

            <p className="text-sm text-muted">{place.address}</p>
            {place.description && (
              <p className="text-sm leading-relaxed text-foreground/80">
                {place.description}
              </p>
            )}
            {!!place.tags?.length && (
              <div className="flex flex-wrap gap-1.5">
                {place.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <Link
              href={`/courses?places=${place.id}`}
              className="inline-flex w-fit items-center gap-1 py-2 text-xs font-medium text-muted transition-colors hover:text-accent focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              이 장소로 코스 만들기 <span aria-hidden="true">→</span>
            </Link>
            {visitAnniversaries.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {visitAnniversaries.slice(0, 2).map((event) => (
                  <span key={`${event.kind}-${event.label}`} className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#fff3ee] px-3 py-1.5 text-xs font-semibold text-[#a85f50] ring-1 ring-[#e7b9ad]/50">
                    <span aria-hidden>{event.icon}</span>{event.label}에 다녀왔어요
                  </span>
                ))}
                {visitAnniversaries.length > 2 && <span className="rounded-full bg-[#fff3ee] px-2.5 py-1.5 text-xs font-bold text-[#a85f50]">+{visitAnniversaries.length - 2}</span>}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <StarRating rating={place.rating} />
              {place.naver_map_link && (
                <a
                  href={place.naver_map_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-[#03C75A] px-3 py-1 text-xs font-semibold text-[#003B1B] transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008A3E]"
                >
                  Naver Map
                </a>
              )}
              {place.kakao_map_link && (
                <a
                  href={place.kakao_map_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-[#FEE500] px-3 py-1 text-xs font-semibold text-[#191919] transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#806E00]"
                >
                  Kakao Map
                </a>
              )}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `${place.name} ${place.address}`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-[#E8F0FE] px-3 py-1 text-xs font-semibold text-[#1967D2] ring-1 ring-inset ring-[#4285F4]/40 transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1967D2]"
              >
                Google Map
              </a>
              <DirectionsButton
                name={place.name}
                lat={place.lat}
                lng={place.lng}
                address={place.address}
                className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              />
              <SharePlaceButton place={place} />
            </div>
          </div>
        </header>
      )}

      {place && <AiRecommendationSection place={place} />}

      {/* 우리의 추억 */}
      <section className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">
            우리의 추억 <span className="text-muted">{memories.length}</span>
          </h2>
          <button
            type="button"
            onClick={() => setShowMemoryForm((v) => !v)}
            className="shrink-0 rounded-full bg-foreground px-4 py-1.5 text-sm font-semibold text-background"
          >
            {showMemoryForm ? "닫기" : "추억 추가"}
          </button>
        </div>

        {showMemoryForm && (
          <AddMemoryForm
            onSubmit={handleAddMemory}
            onCancel={() => setShowMemoryForm(false)}
          />
        )}

        {memories.length === 0 && !showMemoryForm ? (
          <p className="rounded-[20px] bg-card p-10 text-center text-sm text-muted-2 ring-1 ring-border">
            아직 추억이 없어요, 첫 이야기를 남겨보세요.
          </p>
        ) : memories.length > 0 ? (
          <ol className="relative space-y-4 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-border">
            {memories.map((m) => (
              <li key={m.id} className="relative pl-7">
                <span className="absolute left-0 top-[18px] h-3.5 w-3.5 rounded-full border-2 border-accent bg-background" />
                {editingMemoryId === m.id ? (
                  <AddMemoryForm
                    initial={memoryToInput(m)}
                    submitLabel="수정 저장"
                    onSubmit={(input) => handleEditMemory(m.id, input)}
                    onCancel={() => setEditingMemoryId(null)}
                  />
                ) : (
                  <article className="rounded-[20px] bg-card p-5 ring-1 ring-border">
                    <div className="flex flex-wrap items-center gap-2">
                      <time className="text-sm font-semibold text-accent">
                        {dot(m.date)}
                      </time>
                      {m.mood_tag && (
                        <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
                          {m.mood_tag}
                        </span>
                      )}
                      {m.author && (
                        <span className="text-xs text-muted">· {m.author}</span>
                      )}
                      <span className="ml-auto flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setShowMemoryForm(false);
                            setEditingMemoryId(m.id);
                          }}
                          className="rounded-full px-2 py-0.5 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-accent"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMemory(m.id)}
                          disabled={deletingMemoryId === m.id}
                          className="rounded-full px-2 py-0.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingMemoryId === m.id ? "삭제 중…" : "삭제"}
                        </button>
                      </span>
                    </div>
                    {m.content && (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                        {m.content}
                      </p>
                    )}
                    <PhotoThumbnails urls={m.photo_urls} className="mt-3" />
                    <Reactions
                      targetType="memory"
                      targetId={m.id}
                      initial={reactions.filter(
                        (r) =>
                          r.target_type === "memory" && r.target_id === m.id,
                      )}
                    />
                    <MemoryReplies
                      memoryId={m.id}
                      initialReplies={repliesByMemory[m.id] ?? []}
                      initialReactions={reactions.filter(
                        (r) => r.target_type === "reply",
                      )}
                    />
                  </article>
                )}
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <NearbySimilar place={place} />
    </div>
  );
}
