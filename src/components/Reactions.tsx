"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import {
  type Reaction,
  type ReactionTarget,
  REACTION_COLUMNS,
  REACTION_EMOJIS,
  groupReactions,
} from "@/lib/reactions";

function SmileyPlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-3.5 w-3.5"
    >
      <path d="M9 10h.01M15 10h.01M9.5 15a3.5 3.5 0 0 0 5 0" />
      <path d="M20.5 12a8.5 8.5 0 1 1-4.7-7.6" />
      <path d="M19 3v4M17 5h4" />
    </svg>
  );
}

/**
 * 추억/답글 아래의 이모지 반응 줄.
 * - 반응 pill(❤️ 2) 모음 + "+" 버튼(6개 이모지 팝업)
 * - 같은 이모지 다시 누르면 취소, 다른 이모지 누르면 교체(upsert)
 * - MemoriesFeed 처럼 부모가 <Link> 인 경우가 있어 클릭 전파를 막는다.
 */
export function Reactions({
  targetType,
  targetId,
  initial,
}: {
  targetType: ReactionTarget;
  targetId: number;
  initial: Reaction[];
}) {
  const { user } = useAuth();
  const [list, setList] = useState<Reaction[]>(initial);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  const mine = user
    ? (list.find((r) => r.profile_id === user.id) ?? null)
    : null;
  const groups = groupReactions(list, user?.id);

  const react = async (emoji: string) => {
    setPickerOpen(false);
    if (!user || busy) return;

    // 같은 이모지 → 취소
    if (mine?.emoji === emoji) {
      const removed = mine;
      setList((p) => p.filter((r) => r.id !== removed.id));
      setBusy(true);
      const { error } = await supabase
        .from("reactions")
        .delete()
        .eq("target_type", targetType)
        .eq("target_id", targetId)
        .eq("profile_id", user.id);
      setBusy(false);
      if (error) {
        setList((p) => [...p, removed]); // 롤백
        window.alert(`반응 취소 실패: ${error.message}`);
      }
      return;
    }

    // 새로 추가 / 다른 이모지로 교체 (낙관적).
    // 임시 id 는 -1 (내 반응은 항상 한 개 → 교체는 profile_id 기준이라 값 무관).
    const prevMine = mine;
    const optimistic: Reaction = {
      id: prevMine?.id ?? -1,
      target_type: targetType,
      target_id: targetId,
      profile_id: user.id,
      emoji,
      created_at: prevMine?.created_at ?? "",
    };
    setList((p) => [
      ...p.filter((r) => r.profile_id !== user.id),
      optimistic,
    ]);
    setBusy(true);
    const { data, error } = await supabase
      .from("reactions")
      .upsert(
        {
          target_type: targetType,
          target_id: targetId,
          profile_id: user.id,
          emoji,
        },
        { onConflict: "target_type,target_id,profile_id" },
      )
      .select(REACTION_COLUMNS)
      .single();
    setBusy(false);
    if (error) {
      // 롤백: 낙관적 항목 제거, 이전 반응 있었으면 복원
      setList((p) => [
        ...p.filter((r) => r.profile_id !== user.id),
        ...(prevMine ? [prevMine] : []),
      ]);
      window.alert(`반응 저장 실패: ${error.message}`);
      return;
    }
    setList((p) =>
      p.map((r) => (r.profile_id === user.id ? (data as Reaction) : r)),
    );
  };

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  if (!user) {
    // 로그인 안 했으면 읽기 전용 pill 만
    return groups.length > 0 ? (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {groups.map((g) => (
          <span
            key={g.emoji}
            className="flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600"
          >
            <span>{g.emoji}</span>
            <span className="font-semibold">{g.count}</span>
          </span>
        ))}
      </div>
    ) : null;
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {groups.map((g) => (
        <button
          key={g.emoji}
          type="button"
          onClick={(e) => {
            stop(e);
            void react(g.emoji);
          }}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors ${
            g.mine
              ? "bg-accent/10 text-accent ring-1 ring-accent/50"
              : "bg-stone-100 text-stone-600 hover:bg-stone-200"
          }`}
        >
          <span>{g.emoji}</span>
          <span className="font-semibold">{g.count}</span>
        </button>
      ))}

      <div ref={boxRef} className="relative">
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            setPickerOpen((v) => !v);
          }}
          aria-label="반응 추가"
          aria-expanded={pickerOpen}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition-colors hover:bg-stone-200 hover:text-accent"
        >
          <SmileyPlusIcon />
        </button>

        {pickerOpen && (
          // 위로 연다: /memories 카드(figure) 가 overflow-hidden 이라 아래로 열면 잘림
          <div
            role="menu"
            className="absolute bottom-full left-0 z-20 mb-1 flex gap-0.5 rounded-full border border-border bg-white p-1 shadow-lg"
          >
            {REACTION_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={(ev) => {
                  stop(ev);
                  void react(e);
                }}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-base transition-transform hover:scale-110 ${
                  mine?.emoji === e ? "bg-accent/15" : "hover:bg-stone-100"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
