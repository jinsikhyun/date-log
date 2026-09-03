"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { buildAnniversaries, type Anniversary, type Birthday } from "@/lib/anniversaries";

export function useAnniversaries(): Anniversary[] {
  const { profile, ready } = useAuth();
  const [startDate, setStartDate] = useState<string | null>(null);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [firstRecordDate, setFirstRecordDate] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !profile?.couple_id) return;
    let cancelled = false;
    Promise.all([
      supabase.from("couples").select("start_date").eq("id", profile.couple_id).maybeSingle(),
      supabase.from("profiles").select("display_name, birth_date").eq("couple_id", profile.couple_id).not("birth_date", "is", null),
      supabase.from("places").select("first_visit_date").eq("status", "visited").not("first_visit_date", "is", null).order("first_visit_date", { ascending: true }).limit(1).maybeSingle(),
    ]).then(([couple, members, firstRecord]) => {
      if (cancelled) return;
      setStartDate((couple.data?.start_date as string | null) ?? null);
      if (!members.error) {
        setBirthdays((members.data ?? []).map((member) => ({
          name: String(member.display_name ?? "우리"),
          birthDate: String(member.birth_date),
        })));
      }
      if (!firstRecord.error) {
        setFirstRecordDate((firstRecord.data?.first_visit_date as string | null) ?? null);
      }
    });
    return () => { cancelled = true; };
  }, [profile?.couple_id, ready]);

  return useMemo(() => {
    const year = new Date().getFullYear();
    return buildAnniversaries(startDate, birthdays, year - 10, year + 2, firstRecordDate);
  }, [birthdays, firstRecordDate, startDate]);
}
