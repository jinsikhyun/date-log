// src/hooks/useTodayHint.ts
// ─────────────────────────────────────────────────────────────
// 데이트 힌트 팝업용 훅. 오늘 띄울 힌트 하나를 판정해서 돌려준다.
// 기존 useAnniversaries 패턴을 그대로 따르고, 그 결과를 재사용한다(중복 없음).
//
// 조합하는 데이터:
//   - anniversaries    : useAnniversaries() (생일·주년·100일·첫기록) — 재사용
//   - special          : /api/special-days (절기·공휴일)
//   - upcomingBirthdays: anniversaries 에서 D-7/3/1 생일 계산
//   - onThisDay        : 오늘 월·일과 같은 과거 방문/추억 (places/memories)
//   - hasPastVisitFor  : 회고 CTA 여부 (과거 같은 기념일에 방문 기록이 있는지)
//
// 판정은 순수 함수 decideTodayHint(todayHint.ts)가 하고, 이 훅은 데이터 수집 담당.
// 확정 UI: 하루 1회, dismiss 하면 그날 재노출 안 함 → localStorage 로 처리.
// 날씨는 팝업에서 제외(확정) → 여기서 날씨는 안 부름.
// ─────────────────────────────────────────────────────────────

"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { useAnniversaries } from "@/hooks/useAnniversaries";
import { decideTodayHint, type TodayHint, type HintInput } from "@/lib/todayHint";

// 오늘 "YYYY-MM-DD" (KST). 로컬 타임존 보정.
function todayKST(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function monthDay(iso: string): string {
  return iso.slice(5);
}

/** 이 날짜 이 힌트를 이미 닫았는지 (하루 1회). */
function dismissKey(today: string, type: string): string {
  return `datehint:dismissed:${today}:${type}`;
}

interface SpecialResp {
  solarTerm: string | null;
  holiday: { pattern: string; streak: number; name: string } | null;
}

interface OnThisDay {
  yearsAgo: number;
  placeId: number;
  placeName: string;
  memory?: string | null;
}

export interface UseTodayHintResult {
  hint: TodayHint | null;
  /** 팝업을 닫을 때 호출 — 그날 이 힌트 재노출 안 함. */
  dismiss: () => void;
  loading: boolean;
}

export function useTodayHint(enabled = true): UseTodayHintResult {
  const { profile, ready } = useAuth();
  const anniversaries = useAnniversaries();
  const today = todayKST();

  const [special, setSpecial] = useState<SpecialResp | null>(null);
  const [onThisDay, setOnThisDay] = useState<OnThisDay | null>(null);
  const [hasPastVisitFor, setHasPastVisitFor] = useState<
    HintInput["hasPastVisitFor"]
  >({});
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  // 특일(절기·공휴일) — 라우트 호출. 실패해도 팝업 자체는 막지 않음(확정 UI 3-2).
  useEffect(() => {
    if (!enabled || !ready || !profile?.couple_id) return;
    let cancelled = false;
    fetch("/api/special-days", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data) setSpecial({ solarTerm: data.solarTerm, holiday: data.holiday });
      })
      .catch(() => {
        /* 조용히 무시 — 특일 없이도 나머지 트리거는 동작 */
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, ready, profile?.couple_id]);

  // 1년 전 오늘: 오늘 월·일과 같은 과거 방문/추억 중 가장 오래된 것.
  useEffect(() => {
    if (!enabled || !ready || !profile?.couple_id) return;
    let cancelled = false;
    (async () => {
      const mmdd = monthDay(today);
      // places.first_visit_date 와 memories.date 각각에서 같은 월·일 과거 기록.
      // RLS 로 커플 스코프는 자동. 넉넉히 가져와 클라이언트에서 필터.
      const [placesRes, memRes] = await Promise.all([
        supabase
          .from("places")
          .select("id, name, first_visit_date")
          .eq("status", "visited")
          .not("first_visit_date", "is", null),
        supabase
          .from("memories")
          .select("place_id, date, content, places(name)")
          .not("date", "is", null),
      ]);
      if (cancelled) return;

      type Cand = { year: number; placeId: number; placeName: string; memory?: string | null };
      const cands: Cand[] = [];

      for (const p of placesRes.data ?? []) {
        const d = p.first_visit_date as string;
        if (monthDay(d) === mmdd && d < today) {
          cands.push({ year: Number(d.slice(0, 4)), placeId: p.id as number, placeName: p.name as string });
        }
      }
      for (const m of memRes.data ?? []) {
        const d = m.date as string;
        if (monthDay(d) === mmdd && d < today) {
          // places(name) 조인은 타입 추론상 배열로 잡히지만 실제로는 단일 객체다
          // (memories.place_id 는 단일 FK). OnThisMonthBanner.tsx 와 동일한 처리.
          const pl = m.places as unknown as { name: string } | null;
          cands.push({
            year: Number(d.slice(0, 4)),
            placeId: m.place_id as number,
            placeName: pl?.name ?? "그곳",
            memory: (m.content as string | null) ?? null,
          });
        }
      }

      if (cands.length > 0) {
        cands.sort((a, b) => a.year - b.year); // 오래된 것 먼저
        const oldest = cands[0];
        setOnThisDay({
          yearsAgo: Number(today.slice(0, 4)) - oldest.year,
          placeId: oldest.placeId,
          placeName: oldest.placeName,
          memory: oldest.memory,
        });

        // 회고 CTA 판단: 오늘 월·일에 과거 방문 기록이 있으므로, 오늘 걸리는
        // 기념일(생일/주년/첫기록/문화기념일)은 "지난 그날 돌아보기"가 가능하다.
        // (기념일은 매년 같은 월·일이라, 오늘 과거 방문 = 지난 그 기념일 방문)
        setHasPastVisitFor({
          birthday: true,
          anniversary: true,
          first_record: true,
          culture: true,
        });
      } else {
        // 과거 방문이 없으면 회고 불가 → 전부 fallback CTA.
        setHasPastVisitFor({});
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, ready, profile?.couple_id, today]);

  // 다가오는 생일 (D-7/3/1) — 기존 anniversaries 에서 계산.
  const upcomingBirthdays = useMemo(() => {
    const result: { name: string; date: string; daysUntil: number }[] = [];
    const todayMs = Date.parse(today + "T00:00:00Z");
    for (const a of anniversaries) {
      if (a.kind !== "birthday") continue;
      const ms = Date.parse(a.date + "T00:00:00Z");
      const days = Math.round((ms - todayMs) / 86400000);
      if ([7, 3, 1].includes(days)) {
        // label "지민의 생일" → 이름만 뽑기
        const name = a.label.replace(/의 생일$/, "");
        result.push({ name, date: a.date, daysUntil: days });
      }
    }
    return result;
  }, [anniversaries, today]);

  // 판정
  const hint = useMemo(() => {
    if (!enabled) return null;
    return decideTodayHint({
      today,
      anniversaries,
      upcomingBirthdays,
      special,
      onThisDay,
      hasPastVisitFor,
    });
  }, [enabled, today, anniversaries, upcomingBirthdays, special, onThisDay, hasPastVisitFor]);

  // 하루 1회 dismiss 체크 (localStorage). 힌트가 정해지면 이미 닫았는지 확인.
  useEffect(() => {
    if (!hint) return;
    try {
      const closed = localStorage.getItem(dismissKey(today, hint.type));
      setDismissed(closed === "1");
    } catch {
      setDismissed(false);
    }
  }, [hint, today]);

  const dismiss = () => {
    if (!hint) return;
    try {
      localStorage.setItem(dismissKey(today, hint.type), "1");
    } catch {
      /* 스토리지 막혀도 무시 */
    }
    setDismissed(true);
  };

  return {
    hint: dismissed ? null : hint,
    dismiss,
    loading,
  };
}
