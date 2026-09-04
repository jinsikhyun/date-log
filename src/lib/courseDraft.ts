export const MAX_COURSE_PLACES = 20;
export function validPlaceIds(value: unknown): number[] {
  return Array.isArray(value) ? [...new Set(value.filter((x): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x > 0))] : [];
}
export function readDraft(key: string): { title: string; concept: string; placeIds: number[]; courseOnlyPlaceIds: number[] } | null {
  try {
    const data = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (!data || typeof data.title !== 'string' || typeof data.concept !== 'string') return null;
    return { title: data.title, concept: data.concept, placeIds: validPlaceIds(data.placeIds), courseOnlyPlaceIds: validPlaceIds(data.courseOnlyPlaceIds) };
  } catch { return null; }
}
