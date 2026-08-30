// 우편함 알림 (notifications 테이블). 트리거가 파트너 행동마다 한 줄씩 쌓는다.
export interface Notification {
  id: number;
  couple_id: string;
  recipient_id: string;
  message: string;
  related_link: string | null;
  is_read: boolean;
  created_at: string;
}

export const NOTIFICATION_COLUMNS =
  "id, couple_id, recipient_id, message, related_link, is_read, created_at";

/** "3분 전" / "2일 전" 같은 상대 시간 (간단 버전) */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
  });
}
