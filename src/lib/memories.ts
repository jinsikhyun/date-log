// Supabase `memories` 테이블의 한 행.
export interface Memory {
  id: number;
  place_id: number;
  date: string | null; // 'YYYY-MM-DD'
  content: string | null;
  mood_tag: string | null;
  author: string | null; // 작성한 사람 ('진식' / '지민')
  photo_urls: string[]; // 첨부 사진 public URL 목록 (place-photos 버킷). 없으면 []
  created_at: string;
}

export const MEMORY_COLUMNS =
  "id, place_id, date, content, mood_tag, author, photo_urls, created_at";

// 추억 대댓글(답장)
export interface MemoryReply {
  id: number;
  memory_id: number;
  author: string | null; // '진식' / '지민'
  content: string | null;
  created_at: string;
}

export const MEMORY_REPLY_COLUMNS =
  "id, memory_id, author, content, created_at";

// "추억 모아보기"(/memories) 용: 장소 정보 + 답글 개수를 함께 가져온다.
export const MEMORY_WITH_PLACE_COLUMNS =
  "id, place_id, date, content, mood_tag, author, photo_urls, created_at, places(id, name, category), memory_replies(count)";

export interface MemoryWithPlace extends Memory {
  // FK memories.place_id → places.id (다대일). 장소가 지워졌다면 null 일 수 있어 방어.
  places: { id: number; name: string; category: string } | null;
  memory_replies?: { count: number }[];
}

/** 최신순(날짜 최근 → 과거). 날짜 없으면 맨 뒤로, 같으면 최근 입력(id)이 위로. */
export function byDateDesc(a: MemoryWithPlace, b: MemoryWithPlace): number {
  const da = a.date ?? "";
  const db = b.date ?? "";
  if (da !== db) {
    if (!da) return 1;
    if (!db) return -1;
    return da < db ? 1 : -1;
  }
  return b.id - a.id;
}

/** 오래된 순(스토리 흐름). 날짜 같으면 입력 순(id). */
export function byDateAsc(a: Memory, b: Memory): number {
  const da = a.date ?? "";
  const db = b.date ?? "";
  if (da !== db) return da < db ? -1 : 1;
  return a.id - b.id;
}
