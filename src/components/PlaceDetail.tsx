"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
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
import { NearbySimilar } from "@/components/NearbySimilar";
import { DirectionsButton } from "@/components/DirectionsButton";
import {
  AddPlaceForm,
  placeFormInput,
  type NewPlaceInput,
} from "@/components/AddPlaceForm";

const PLACE_COLUMNS =
  "id, name, category, address, naver_map_link, kakao_map_link, rating, first_visit_date, description, image_url, lat, lng, status, wanted_by, added_by, via_course, memory_count, created_at";

const POLICY_HINT =
  "Supabase 정책(supabase/policies_open_write.sql) 적용 여부를 확인해 주세요.";

const dot = (d: string | null) => (d ? d.split("-").join(".") : "날짜 미정");

/** memories 행 → 추억 폼 초기값 (수정 시) */
function memoryToInput(m: Memory): NewMemoryInput {
  return {
    date: m.date ?? "",
    content: m.content ?? "",
    mood_tag: m.mood_tag ?? "",
    author: "", // 저장 시 현재 사용자로 덮어씀
    photo_urls: m.photo_urls ?? [],
  };
}

export function PlaceDetail({ id }: { id: number }) {
  const router = useRouter();
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
        setError(
          placeRes.error?.code === "PGRST116"
            ? "장소를 찾을 수 없어요."
            : `장소를 불러오지 못했어요: ${placeRes.error?.message ?? "알 수 없는 오류"}`,
        );
        setLoading(false);
        return;
      }

      setPlace(placeRes.data as Place);
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

      setPlace(data[0] as Place);
      setEditing(false);
    },
    [id],
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
        <div className="h-56 animate-pulse rounded-3xl bg-stone-200/70" />
        <div className="h-24 animate-pulse rounded-3xl bg-stone-200/70" />
      </div>
    );
  }

  if (error || !place) {
    return (
      <div className="rounded-3xl bg-card p-10 text-center ring-1 ring-border/70">
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
              className="rounded-full bg-stone-100 px-3.5 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-200"
            >
              수정
            </button>
            <button
              type="button"
              onClick={handleDeletePlace}
              disabled={deleting}
              className="rounded-full bg-red-50 px-3.5 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60"
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
        <header className="overflow-hidden rounded-3xl bg-card ring-1 ring-border/70">
          <div className="relative aspect-[16/7] overflow-hidden bg-gradient-to-br from-stone-200 to-stone-300">
            {place.image_url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={place.image_url}
                alt={place.name}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            <span
              className={`absolute left-5 top-5 z-[1] rounded-full px-3 py-1 text-xs font-semibold ${categoryStyle(
                place.category,
              )}`}
            >
              {place.category}
            </span>
          </div>
          <div className="flex flex-col gap-3 p-6 sm:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h1 className="text-2xl font-bold">{place.name}</h1>
              {visited && (
                <span className="text-sm text-muted">첫 방문 {visited}</span>
              )}
            </div>
            <p className="text-sm text-muted">{place.address}</p>
            {addedByLabel(place.added_by) && (
              <span className="w-fit rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                {addedByLabel(place.added_by)}
              </span>
            )}
            {place.description && (
              <p className="text-sm leading-relaxed text-foreground/80">
                {place.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <StarRating rating={place.rating} />
              {place.naver_map_link && (
                <a
                  href={place.naver_map_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-200"
                >
                  네이버지도에서 보기
                </a>
              )}
              {place.kakao_map_link && (
                <a
                  href={place.kakao_map_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-200"
                >
                  카카오맵에서 보기
                </a>
              )}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `${place.name} ${place.address}`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-200"
              >
                구글지도에서 보기
              </a>
              <DirectionsButton
                name={place.name}
                lat={place.lat}
                lng={place.lng}
                address={place.address}
                className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              />
            </div>
          </div>
        </header>
      )}

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
          <p className="rounded-3xl bg-card p-10 text-center text-sm text-muted ring-1 ring-border/70">
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
                  <article className="rounded-3xl bg-card p-5 ring-1 ring-border/70">
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
                    <MemoryReplies
                      memoryId={m.id}
                      initialReplies={repliesByMemory[m.id] ?? []}
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
