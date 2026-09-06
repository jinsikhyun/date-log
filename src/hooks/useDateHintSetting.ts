// src/hooks/useDateHintSetting.ts
// ─────────────────────────────────────────────────────────────
// "데이트 힌트 받기" 개인 설정(profiles.date_hint_enabled) 로드/저장.
// 개인 preference라 couples(공유)가 아니라 profiles(개인)에 저장 — 커플 한 명이
// 꺼도 상대방 설정에는 영향 없음(계약서 §4).
//
// supabase/add-date-hint-setting.sql 이 아직 운영에 적용되지 않아 컬럼이 없어도
// (select/update 실패) 화면이 깨지지 않도록 기본값 true로 조용히 폴백한다.
// ─────────────────────────────────────────────────────────────

"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase/client";

export interface UseDateHintSettingResult {
  /** 컬럼 미적용/로딩 중에도 기본 true. */
  enabled: boolean;
  /** 로딩이 끝나 실제 저장값(또는 확정된 기본값)을 반영했는지. */
  loaded: boolean;
  setEnabled: (next: boolean) => Promise<void>;
  saving: boolean;
  error: string | null;
}

export function useDateHintSetting(): UseDateHintSettingResult {
  const { user, ready } = useAuth();
  const [enabled, setEnabledState] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("date_hint_enabled")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          // 컬럼이 아직 없는 등 — 기본값(true) 유지, 조용히 무시.
          setLoaded(true);
          return;
        }
        const value = (data as { date_hint_enabled?: boolean } | null)
          ?.date_hint_enabled;
        setEnabledState(value ?? true);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  const setEnabled = useCallback(
    async (next: boolean) => {
      if (!user) return;
      const prev = enabled;
      setEnabledState(next); // 낙관적 반영
      setSaving(true);
      setError(null);
      try {
        const { error: err } = await supabase
          .from("profiles")
          .update({ date_hint_enabled: next })
          .eq("id", user.id);
        if (err) {
          setEnabledState(prev);
          setError(
            "설정을 저장하지 못했어요. supabase/add-date-hint-setting.sql 적용 여부를 확인해 주세요.",
          );
        }
      } catch {
        setEnabledState(prev);
        setError("설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      } finally {
        setSaving(false);
      }
    },
    [user, enabled],
  );

  return { enabled, loaded, setEnabled, saving, error };
}
