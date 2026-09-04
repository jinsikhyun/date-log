type FeedbackPlace = { id: number; name: string; category: string; status: string; rating: number | null };
type FeedbackMemory = { place_id: number; author: string | null; mood_tag: string | null };
type Member = { id: string; display_name: string | null };

const moods: Record<string, string> = {
  "❤️ 좋았어요": "positive", "🙂 괜찮았어요": "neutral", "😐 아쉬웠어요": "negative",
  "좋았어요": "positive", "괜찮았어요": "neutral", "아쉬웠어요": "negative",
};

/** memories는 최신순으로 전달. 이름이 모호하면 개인에게 귀속하지 않는다. */
export function recommendationFeedback(places: FeedbackPlace[], memories: FeedbackMemory[], members: Member[]) {
  const byId = new Map(places.filter(p => p.status === "visited").map(p => [p.id, p]));
  const ratings = [...byId.values()]
    .filter(p => p.rating != null && Number.isFinite(p.rating) && p.rating >= 0 && p.rating <= 5)
    .slice(0, 20)
    .map(p => ({ name: p.name, category: p.category, rating: p.rating, scope: "shared_place_record" }));
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  const emotions: { member: string; name: string; category: string; reaction: string }[] = [];
  for (const memory of memories) {
    const place = byId.get(memory.place_id);
    const reaction = moods[memory.mood_tag?.trim() ?? ""];
    if (!place || !reaction || !memory.author) continue;
    const matches = members.filter(m => m.display_name === memory.author);
    if (matches.length !== 1) continue;
    const member = `member_${members.findIndex(m => m.id === matches[0].id) + 1}`;
    const key = `${member}:${place.id}`;
    if (seen.has(key) || (counts.get(member) ?? 0) >= 12) continue;
    seen.add(key);
    counts.set(member, (counts.get(member) ?? 0) + 1);
    emotions.push({ member, name: place.name, category: place.category, reaction });
  }
  return { ratings, emotions };
}
