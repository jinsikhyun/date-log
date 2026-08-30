// "우리의 기록" 회고 대시보드용 헬퍼.
// 관계 시작일은 커플별로 다르므로(couples.start_date) 코드 상수로 두지 않는다.

/** 기준일(YYYY-MM-DD)을 1일째로 세는 "함께한 지 N일째" (로컬 자정 기준) */
export function daysTogether(startISO: string): number {
  const start = new Date(`${startISO}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((today.getTime() - start.getTime()) / 86_400_000);
  return diff + 1; // 기준일 당일 = 1일째
}
