// "우리의 기록" 회고 대시보드용 상수/헬퍼.

export const RELATIONSHIP_START_DATE = "2025-06-28";

/** 기준일을 1일째로 세는 "함께한 지 N일째" (로컬 자정 기준) */
export function daysTogether(
  startISO: string = RELATIONSHIP_START_DATE,
): number {
  const start = new Date(`${startISO}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((today.getTime() - start.getTime()) / 86_400_000);
  return diff + 1; // 기준일 당일 = 1일째
}
