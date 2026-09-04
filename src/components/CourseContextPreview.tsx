"use client";

import { useState } from "react";
import { GptMark } from "@/components/GptMark";

const groups = [
  { key: "travel", label: "이동", choices: ["가까이", "조금 멀어도"] },
  { key: "mood", label: "가장 원하는 분위기는?", choices: ["조용한", "활기찬", "감성적인", "이색적인"] },
  { key: "category", label: "다음은 어디가 좋아요?", choices: ["술집", "바", "맛집", "카페"] },
] as const;

export function CourseContextPreview() {
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const summary = groups.map(g => choices[g.key]).filter(Boolean).join(" · ");
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
      <p className="mb-3 text-[11px] font-semibold tracking-wider text-accent">DESIGN PREVIEW · 저장되지 않는 예시</p>
      <h1 className="text-2xl font-bold tracking-tight">우리의 다음 데이트</h1>
      <p className="mt-2 text-sm text-muted">좋아하는 곳에서 시작해, 함께할 하루를 그려요.</p>
      <div className="mt-7 rounded-[26px] border border-border bg-white p-5 sm:p-8">
        <p className="text-xs font-medium text-muted">코스 이름</p>
        <p className="mt-2 text-lg font-semibold">서촌에서 느리게 보내는 오후</p>
        <p className="mb-3 mt-7 text-xs font-medium text-muted">코스 순서 · 1</p>
        <div className="flex items-center gap-3 rounded-2xl border border-border p-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">1</span>
          <span className="flex-1 text-sm font-semibold">작은 식탁</span>
          <span className="rounded-full bg-accent/10 px-3 py-1 text-xs text-accent">맛집</span>
        </div>

        <section className="mt-7 overflow-hidden rounded-[22px] border border-[#10a37f]/20 bg-[#fcfefd]" aria-label="AI 코스 추천 미리보기">
          <div className="flex items-center gap-3 px-5 pb-4 pt-5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#10a37f] text-white"><GptMark className="h-5 w-5" /></span>
            <div><h2 className="text-sm font-bold">AI 추천 · 다음은 어디로 갈까요?</h2><p className="mt-1 text-[11px] text-muted">우리의 취향에, 이번 데이트의 마음을 더해요.</p></div>
          </div>

          <div className="px-5 pb-5">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { setOpen(false); setResult(summary || "우리의 기록을 바탕으로"); }} className="min-h-11 flex-1 whitespace-nowrap rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:opacity-90">{summary ? "이 조건으로 추천" : "우리 취향으로 추천"}</button>
              <button type="button" aria-expanded={open} aria-controls="date-context-options" onClick={() => setOpen(!open)} className="min-h-11 whitespace-nowrap rounded-full border border-border bg-white px-4 py-3 text-sm font-medium text-accent transition-colors hover:border-accent/40 focus-visible:outline-2 focus-visible:outline-accent">조건 설정 <span aria-hidden="true">{open ? "−" : "+"}</span></button>
            </div>
            {summary && <p className="mt-3 text-xs leading-5 text-accent">{summary}</p>}
            {open && <div id="date-context-options" className="mt-5 border-t border-border/70 pt-5">
              <p className="mb-4 text-xs text-muted">이번 데이트는? 원하는 것만 골라요.</p>
              <div className="space-y-4">
                {groups.map(group => <fieldset key={group.key} className="min-w-0">
                  <legend className="mb-2 text-[11px] font-medium text-muted">{group.label}</legend>
                  <div className="flex flex-wrap gap-2">{group.choices.map(value => <button type="button" key={value} aria-pressed={choices[group.key] === value} onClick={() => { setChoices(prev => { const next = { ...prev }; if (next[group.key] === value) delete next[group.key]; else next[group.key] = value; return next; }); setResult(null); }} className={`min-h-10 rounded-full border px-4 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${choices[group.key] === value ? "border-accent bg-accent text-white" : "border-border bg-white text-muted hover:border-accent/40 hover:text-accent"}`}>{value}</button>)}</div>
                </fieldset>)}
              </div>
              <div className="mt-5 flex items-center justify-between gap-3"><p className="text-[11px] text-muted">이번 추천에만 반영돼요.</p>{summary && <button type="button" className="min-h-9 text-xs text-muted underline underline-offset-4" onClick={() => { setChoices({}); setResult(null); }}>초기화</button>}</div>
            </div>}
          </div>
          {result && <div role="status" className="mx-5 mb-5 rounded-2xl bg-accent/5 p-4"><p className="text-xs font-semibold text-accent">{result}</p><p className="mt-2 text-xs leading-5 text-muted">이 설정으로 추천을 요청하는 화면이에요. 미리보기에서는 AI를 호출하거나 코스를 저장하지 않아요.</p></div>}
        </section>
        <p className="mt-6 text-xs text-muted">예시 장소와 코스입니다. 실제 기록은 사용하지 않았어요.</p>
      </div>
    </main>
  );
}
