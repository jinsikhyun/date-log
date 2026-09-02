import type { Place } from "./places";

export type PreferenceKind = "pick";
export interface PlacePreference { user_id: string; kind: PreferenceKind }

/** 기존 카드/필터 인터페이스는 유지하되 값의 출처는 개인별 행으로 통일. */
export function withPreferences<T extends Place>(row: T): T {
  const preferences = row.place_preferences ?? [];
  return {
    ...row,
    favorite_by: preferences.filter(p => p.kind === "pick").map(p => p.user_id),
  };
}
