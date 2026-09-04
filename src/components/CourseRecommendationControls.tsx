"use client";
import { useState } from "react";
import type { CourseContext } from "@/lib/courseContext";

export function CourseRecommendationControls({ value, onChange, categories, loading, onRecommend }: {
  value: CourseContext; onChange: (value: CourseContext) => void;
  categories: string[]; loading: boolean; onRecommend: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const summary = [value.travel, value.mood, value.category].filter(Boolean).join(" · ");
  const groups = [
    { key: "travel", label: "이동", options: ["가까이", "조금 멀어도"] },
    { key: "mood", label: "가장 원하는 분위기는?", options: ["조용한", "활기찬", "감성적인", "이색적인"] },
    { key: "category", label: "다음은 어디가 좋아요?", options: more ? categories : categories.slice(0, 4) },
  ] as const;
  return <div className="mb-4">
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={loading} onClick={onRecommend} className="min-h-11 flex-1 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{loading ? "추천하는 중…" : summary ? "이 조건으로 추천" : "우리 취향으로 추천"}</button>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-11 rounded-full border border-border bg-white px-4 py-3 text-sm font-medium text-accent">조건 설정 {open ? "−" : "+"}</button>
    </div>
    {summary && <p className="mt-3 text-xs leading-5 text-accent">{summary}</p>}
    {open && <div className="mt-4 space-y-4 border-t border-border/70 pt-4">
      <p className="text-xs text-muted">이번 데이트는? 원하는 것만 골라요.</p>
      {groups.map(group => <fieldset key={group.key}><legend className="mb-2 text-xs text-muted">{group.label}</legend><div className="flex flex-wrap gap-2">{group.options.map(option => <button type="button" key={option} aria-pressed={value[group.key] === option} onClick={() => { const next = { ...value }; if (next[group.key] === option) delete next[group.key]; else Object.assign(next, { [group.key]: option }); onChange(next); }} className={`min-h-10 rounded-full border px-4 py-2 text-xs font-medium ${value[group.key] === option ? "border-accent bg-accent text-white" : "border-border bg-white text-muted"}`}>{option}</button>)}{group.key === "category" && categories.length > 4 && <button type="button" onClick={() => setMore(!more)} className="px-2 text-xs text-muted">{more ? "접기" : "더보기 +"}</button>}</div></fieldset>)}
      <div className="flex items-center justify-between"><p className="text-[11px] text-muted">이번 추천에만 반영돼요.</p>{summary && <button type="button" onClick={() => onChange({})} className="min-h-9 text-xs text-muted underline">초기화</button>}</div>
    </div>}
  </div>;
}
