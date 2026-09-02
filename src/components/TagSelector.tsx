"use client";

import { useMemo, useState } from "react";
import {
  MAX_SELECTED_TAGS,
  RECOMMENDED_MAX_TAGS,
  RECOMMENDED_MIN_TAGS,
  TAG_GROUPS,
  suggestedTagsForCategory,
} from "@/lib/tags";

/**
 * Naver 지도 리뷰 키워드 스타일의 태그 선택 UI.
 * 실제 저장 로직과 분리된 표현 전용 컴포넌트 — 선택 상태는 부모가 들고 있는다.
 */
export function TagSelector({
  category,
  selected,
  onChange,
  max = MAX_SELECTED_TAGS,
}: {
  category?: string | null;
  selected: string[];
  onChange: (tags: string[]) => void;
  max?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const [customInput, setCustomInput] = useState("");

  const suggested = useMemo(() => suggestedTagsForCategory(category), [category]);
  const atMax = selected.length >= max;

  // 더보기 전에는 추천 태그 + 사용자가 이미 고른 태그(추천 밖의 것 포함)만 보여준다.
  const collapsedChips = useMemo(() => {
    const extra = selected.filter((t) => !suggested.includes(t));
    return [...suggested, ...extra];
  }, [suggested, selected]);

  function toggle(tag: string) {
    if (selected.includes(tag)) {
      onChange(selected.filter((t) => t !== tag));
      return;
    }
    if (atMax) return;
    onChange([...selected, tag]);
  }

  function addCustomTag() {
    const tag = customInput.trim();
    if (!tag || atMax || selected.includes(tag)) {
      setCustomInput("");
      return;
    }
    onChange([...selected, tag]);
    setCustomInput("");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[13px] font-semibold">태그로 취향을 더 알려주세요</p>
        <p className="text-[11px] text-muted-3">
          선택은 자유예요 · 추천 {RECOMMENDED_MIN_TAGS}~{RECOMMENDED_MAX_TAGS}개, 최대 {max}개
          <span className={atMax ? "ml-1 font-semibold text-accent" : "ml-1"}>
            ({selected.length}/{max})
          </span>
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(showAll ? [] : collapsedChips).map((tag) => (
          <TagChip
            key={tag}
            tag={tag}
            active={selected.includes(tag)}
            disabled={!selected.includes(tag) && atMax}
            onClick={() => toggle(tag)}
          />
        ))}

        {!showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="rounded-full px-3 py-1.5 text-[12px] font-medium text-muted-2 ring-1 ring-border transition hover:text-accent hover:ring-accent-border"
          >
            더보기
          </button>
        )}
      </div>

      {showAll && (
        <div className="space-y-4 rounded-2xl bg-surface p-4 ring-1 ring-border">
          {TAG_GROUPS.map((group) => (
            <div key={group.name}>
              <p className="mb-1.5 text-[11px] font-semibold text-muted-2">{group.name}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.tags.map((tag) => (
                  <TagChip
                    key={tag}
                    tag={tag}
                    active={selected.includes(tag)}
                    disabled={!selected.includes(tag) && atMax}
                    onClick={() => toggle(tag)}
                  />
                ))}
              </div>
            </div>
          ))}

          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-muted-2">직접 추가</p>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomTag();
                  }
                }}
                placeholder="예: 반려동물 동반"
                disabled={atMax}
                className="min-w-0 flex-1 rounded-full bg-card px-3 py-1.5 text-[12px] ring-1 ring-border placeholder:text-muted-3 focus:outline-none focus:ring-accent-border disabled:opacity-50"
              />
              <button
                type="button"
                onClick={addCustomTag}
                disabled={atMax || !customInput.trim()}
                className="shrink-0 rounded-full bg-foreground px-3.5 py-1.5 text-[12px] font-semibold text-background transition disabled:opacity-40"
              >
                추가
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="text-[11px] font-medium text-muted-2 transition hover:text-accent"
          >
            접기
          </button>
        </div>
      )}
    </div>
  );
}

function TagChip({
  tag,
  active,
  disabled,
  onClick,
}: {
  tag: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={
        active
          ? "rounded-full bg-accent px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition"
          : "rounded-full bg-card px-3 py-1.5 text-[12px] font-medium text-muted-2 ring-1 ring-border transition hover:ring-accent-border disabled:cursor-not-allowed disabled:opacity-40"
      }
    >
      {tag}
    </button>
  );
}
