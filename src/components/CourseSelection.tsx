"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { MAX_COURSE_PLACES, validPlaceIds } from "@/lib/courseDraft";
import Link from "next/link";
export function useCourseSelection() {
  const { user, coupleMembers } = useAuth();
  const key = `course-selection:${user?.id}:${coupleMembers.map(m => m.id).sort().join(':')}`;
  const [readyKey, setReadyKey] = useState("");
  const [active, setActive] = useState(false);
  const [ids, setIds] = useState<number[]>([]);
  useEffect(() => {
    if (!user) return;
    try { const data = JSON.parse(sessionStorage.getItem(key) ?? 'null'); setIds(validPlaceIds(data?.ids)); setActive(Boolean(data?.active)); } catch { setIds([]); setActive(false); }
    setReadyKey(key);
  }, [key, user]);
  useEffect(() => { if (readyKey === key) { try { sessionStorage.setItem(key, JSON.stringify({ ids, active })); } catch {} } }, [ids, active, key, readyKey]);
  const toggle = (id: number) => setIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < MAX_COURSE_PLACES ? [...prev, id] : prev);
  const trigger = <button type="button" className="rounded-full px-3 py-2 text-xs font-medium text-muted transition-colors hover:bg-accent/5 hover:text-accent" onClick={() => { setActive(!active); setIds([]); }}>{active ? "선택 취소" : "코스 조합하기"}</button>;
  const toolbar = active ? <div className="my-4 flex flex-wrap items-center gap-3">
    {active && <span className="text-xs text-muted">누른 순서대로 코스에 담겨요. ({ids.length}/{MAX_COURSE_PLACES})</span>}
    {active && ids.length > 0 && <Link className="hidden rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white lg:inline-flex" href={`/courses?places=${ids.join(',')}`}>{ids.length}곳으로 코스 만들기 →</Link>}
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-40 border-t border-border bg-background/95 p-3 backdrop-blur-sm lg:hidden">
      <div className="pointer-events-auto mx-auto flex max-w-lg items-center gap-3">
        <span aria-live="polite" className="shrink-0 text-xs font-medium text-accent">{ids.length}/{MAX_COURSE_PLACES}곳</span>
        {ids.length ? <Link className="flex min-h-11 flex-1 items-center justify-center rounded-full bg-accent px-4 text-sm font-semibold text-white" href={`/courses?places=${ids.join(',')}`}>{ids.length}곳으로 코스 만들기 →</Link> : <button type="button" disabled className="min-h-11 flex-1 rounded-full bg-accent/10 px-4 text-sm text-muted">장소를 선택해 주세요</button>}
      </div>
    </div>
  </div> : null;
  const selector = (id: number, name: string) => active ? <button type="button" aria-label={`${name} 코스 선택${ids.includes(id) ? ` · ${ids.indexOf(id) + 1}번째` : ''}`} aria-pressed={ids.includes(id)} onClick={() => toggle(id)} className={`absolute inset-0 z-20 cursor-pointer rounded-[20px] transition-shadow focus-visible:outline-2 focus-visible:outline-accent ${ids.includes(id) ? 'ring-2 ring-accent ring-inset' : 'hover:ring-2 hover:ring-accent/40 hover:ring-inset'}`}>{ids.includes(id) && <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-white shadow-sm">{ids.indexOf(id) + 1}</span>}</button> : null;
  return { toolbar, trigger, selector, active };
}
