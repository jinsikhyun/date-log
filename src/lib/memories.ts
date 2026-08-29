// Supabase `memories` 테이블의 한 행.
export interface Memory {
  id: number;
  place_id: number;
  date: string | null; // 'YYYY-MM-DD'
  content: string | null;
  mood_tag: string | null;
  created_at: string;
}

export const MEMORY_COLUMNS = "id, place_id, date, content, mood_tag, created_at";

/** 오래된 순(스토리 흐름). 날짜 같으면 입력 순(id). */
export function byDateAsc(a: Memory, b: Memory): number {
  const da = a.date ?? "";
  const db = b.date ?? "";
  if (da !== db) return da < db ? -1 : 1;
  return a.id - b.id;
}
