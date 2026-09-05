import { supabase } from "@/lib/supabase/client";

/**
 * 이 장소가 "몇 번째로 방문한 곳인지" — 첫 방문일 오름차순 방문 순번.
 * 방문 기록(status='visited', first_visit_date 있음)이 아니면 null.
 */
export async function getFrameNumber(placeId: number): Promise<number | null> {
  const { data, error } = await supabase
    .from("places")
    .select("id, first_visit_date")
    .eq("status", "visited")
    .not("first_visit_date", "is", null)
    .order("first_visit_date", { ascending: true })
    .order("id", { ascending: true });

  if (error || !data) return null;
  const index = data.findIndex((p) => p.id === placeId);
  return index === -1 ? null : index + 1;
}
