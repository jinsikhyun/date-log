"use client";

import { type FormEvent, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { type MemoryReply, MEMORY_REPLY_COLUMNS } from "@/lib/memories";
import { type Reaction } from "@/lib/reactions";
import { useAuth } from "@/components/AuthProvider";
import { Reactions } from "@/components/Reactions";
import { EmojiPicker } from "@/components/EmojiPicker";

/** 추억 카드 하단의 채팅 말풍선 답장 — 목록 + 입력 + 삭제를 자체 관리 */
export function MemoryReplies({
  memoryId,
  initialReplies,
  initialReactions = [],
}: {
  memoryId: number;
  initialReplies: MemoryReply[];
  initialReactions?: Reaction[];
}) {
  const { authorName: me } = useAuth();
  const [replies, setReplies] = useState<MemoryReply[]>(initialReplies);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 커서 위치에 이모지 삽입 후 그 뒤로 커서 이동 + 포커스 유지.
  // (EmojiPicker 버튼들이 mousedown 을 preventDefault 해서 입력창 포커스/선택이 유지됨)
  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (!node) return;
      node.focus();
      const pos = start + emoji.length;
      node.setSelectionRange(pos, pos);
    });
  };

  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    if (!me) {
      setErr("프로필 이름이 없어! 설정에서 이름부터 정해줘.");
      return;
    }
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase
      .from("memory_replies")
      .insert({ memory_id: memoryId, author: me, content })
      .select(MEMORY_REPLY_COLUMNS)
      .single();
    setBusy(false);
    if (error) {
      setErr(`못 달았어: ${error.message}`);
      return;
    }
    setReplies((prev) => [...prev, data as MemoryReply]);
    setText("");
  };

  const remove = async (rep: MemoryReply) => {
    if (rep.author !== me) return;
    if (!window.confirm("이 답장 지울까?")) return;
    const { data, error } = await supabase
      .from("memory_replies")
      .delete()
      .eq("id", rep.id)
      .select("id");
    if (error) {
      window.alert(`못 지웠어: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) {
      window.alert("안 지워졌어. (Supabase 정책 확인)");
      return;
    }
    setReplies((prev) => prev.filter((x) => x.id !== rep.id));
  };

  return (
    <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
      {replies.length > 0 && (
        <ul className="space-y-1.5">
          {replies.map((rep) => {
            const mine = rep.author != null && rep.author === me;
            return (
              <li
                key={rep.id}
                className={`flex flex-col ${
                  mine ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`group flex max-w-[80%] items-end gap-1 rounded-2xl px-3 py-1.5 text-sm ${
                    mine
                      ? "rounded-br-sm bg-accent text-white"
                      : "rounded-bl-sm bg-stone-100 text-foreground"
                  }`}
                >
                  <span
                    className={`text-[11px] font-semibold ${
                      mine ? "text-white/70" : "text-muted"
                    }`}
                  >
                    {rep.author ?? "?"}
                  </span>
                  <span className="whitespace-pre-wrap break-words">
                    {rep.content}
                  </span>
                  {mine && (
                    <button
                      type="button"
                      onClick={() => remove(rep)}
                      aria-label="답장 삭제"
                      className="ml-0.5 shrink-0 text-[11px] text-white/60 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <Reactions
                  targetType="reply"
                  targetId={rep.id}
                  initial={initialReactions.filter(
                    (r) => r.target_id === rep.id,
                  )}
                />
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={add} className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="한마디 남겨볼까? 👀"
          className="min-w-0 flex-1 rounded-full border border-border bg-white px-3 py-1.5 text-sm outline-none transition-colors focus:border-accent"
        />
        <EmojiPicker onPick={insertEmoji} />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="shrink-0 rounded-full bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background disabled:opacity-50"
        >
          달기
        </button>
      </form>
      {err && <p className="text-xs font-medium text-red-600">{err}</p>}
    </div>
  );
}
