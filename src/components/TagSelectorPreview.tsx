"use client";

import { useState } from "react";
import { TagSelector } from "@/components/TagSelector";

const PREVIEW_CATEGORIES = ["카페", "맛집", "술집", "바", "사진", "전시", "기타"];

export function TagSelectorPreview() {
  const [category, setCategory] = useState(PREVIEW_CATEGORIES[0]);
  const [selected, setSelected] = useState<string[]>(["조용한", "대화하기 좋은"]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="rounded-[28px] bg-surface p-5 ring-1 ring-border-strong sm:p-8">
        <header className="mb-6">
          <p className="text-xs font-semibold text-accent">UI 미리보기 · 2단계</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-[-0.02em]">
            태그 선택 UI
          </h1>
          <p className="mt-2 text-sm text-muted-2">
            카테고리를 바꾸면 먼저 보이는 추천 태그가 맥락에 맞게 달라져요. 저장 로직은
            없고 화면 검증용 상태만 유지합니다.
          </p>
        </header>

        <div className="mb-6">
          <p className="mb-2 text-[11px] font-semibold text-muted-2">
            장소 카테고리 (미리보기 전용 스위치)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PREVIEW_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={
                  c === category
                    ? "rounded-full bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background"
                    : "rounded-full bg-card px-3 py-1.5 text-[12px] font-medium text-muted-2 ring-1 ring-border hover:ring-accent-border"
                }
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[20px] bg-card p-4 ring-1 ring-border sm:p-5">
          <TagSelector category={category} selected={selected} onChange={setSelected} />
        </div>

        <div className="mt-5 rounded-2xl bg-accent-soft px-4 py-3">
          <p className="text-[11px] font-semibold text-accent">선택한 태그 (검증용)</p>
          <p className="mt-1 text-[13px] text-[#2f4b4d]">
            {selected.length > 0 ? selected.join(" · ") : "아직 선택한 태그가 없어요."}
          </p>
        </div>
      </div>
    </main>
  );
}
