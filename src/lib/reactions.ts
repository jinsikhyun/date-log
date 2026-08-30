// 이모지 반응 (reactions 테이블). memory / reply 한 항목에 사람당 이모지 하나.

export type ReactionTarget = "memory" | "reply";

export interface Reaction {
  id: number;
  target_type: ReactionTarget;
  target_id: number;
  profile_id: string;
  emoji: string;
  created_at: string;
}

export const REACTION_COLUMNS =
  "id, target_type, target_id, profile_id, emoji, created_at";

/** 기본 이모지 세트 (커플 앱용, 순서 고정) */
export const REACTION_EMOJIS = ["❤️", "😂", "😢", "😮", "👍", "🥹"] as const;

/** 반응 배열 → 이모지별 { count, mine } (REACTION_EMOJIS 순서, 0개는 제외) */
export function groupReactions(list: Reaction[], myId: string | undefined) {
  return REACTION_EMOJIS.map((emoji) => {
    const rs = list.filter((r) => r.emoji === emoji);
    return {
      emoji,
      count: rs.length,
      mine: myId ? rs.some((r) => r.profile_id === myId) : false,
    };
  }).filter((g) => g.count > 0);
}
