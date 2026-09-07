// buildTasteProfile을 route.ts에 실제로 연결한 뒤의 8-fixture 회귀 확인.
// 이전 A/B(run-taste-profile-eval.mjs)와 달리 시스템 프롬프트 규칙을 여기서 다시 베끼지
// 않는다 — src/lib/recommendationPrompt.ts의 buildCommonRules/buildPlaceDetailScoringRules를
// route.ts와 똑같이 가져와 쓴다. 즉 이 스크립트가 실제로 호출하는 건 production 코드 그 자체다.
// 실행: node --env-file=.env.local --import ./scripts/register-ts-extension-hook.mjs scripts/eval/run-route-regression.mjs
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { writeFileSync } from "node:fs";
import { haversineKm } from "../../src/lib/courses.ts";
import { ALL_TAGS } from "../../src/lib/tags.ts";
import { buildTasteProfile } from "../../src/lib/tasteProfile.ts";
import { buildCommonRules, buildPlaceDetailScoringRules, stripInternalMemberLabels } from "../../src/lib/recommendationPrompt.ts";
import { FIXTURES, NOW } from "./fixtures.ts";

const MODEL = "gpt-5.6-luna"; // route.ts와 동일
const MAX_OUTPUT_TOKENS = 2000;
const COUNT = 3;

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY 가 없어요 — node --env-file=.env.local scripts/eval/run-route-regression.mjs 로 실행하세요.");
  process.exit(1);
}
const openai = new OpenAI({ apiKey });
const ONLY = process.env.EVAL_ONLY?.split(",").map((s) => s.trim());

const OutputSchema = z.object({
  picks: z.array(
    z.object({ id: z.string(), reason: z.string(), matchedTags: z.array(z.enum(ALL_TAGS)) }),
  ),
});

function tasteProfileFor(f) {
  const places = f.tasteRows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    status: r.status,
    rating: r.rating,
    confirmedTags: r.confirmed_tags,
    isRegular: r.is_regular,
    favoriteBy: r.place_preferences.filter((p) => p.kind === "pick").map((p) => p.user_id),
    wantedByIds: r.wanted_by_ids,
    firstVisitDate: r.first_visit_date,
    createdAt: r.created_at,
  }));
  const memories = f.memories.map((m) => ({
    placeId: m.place_id,
    author: m.author,
    moodTag: m.mood_tag,
    content: m.content,
    date: m.date,
    createdAt: m.created_at,
  }));
  const members = f.members.map((m) => ({ id: m.id, displayName: m.display_name }));
  return buildTasteProfile(places, memories, members, NOW);
}

function candidatesPayload(f) {
  return f.candidates.map((c) => ({
    id: c.id,
    name: c.name,
    category: c.categoryName ?? c.category,
    address: c.address,
    lat: c.lat,
    lng: c.lng,
    distanceMeters: Math.round(haversineKm({ lat: f.place.lat, lng: f.place.lng }, { lat: c.lat, lng: c.lng }) * 1000),
  }));
}

async function callFixture(f) {
  const allowedTags = ALL_TAGS; // fixture들의 place.tags는 전부 []이므로 route.ts와 동일
  const commonRules = buildCommonRules(allowedTags);
  const system = [
    "당신은 date.log 서비스의 장소 추천 도우미입니다.",
    ...commonRules,
    "",
    ...buildPlaceDetailScoringRules(COUNT),
  ].join("\n");
  const tasteProfile = tasteProfileFor(f);
  const userPayload = {
    tasteProfile,
    place: { name: f.place.name, category: f.place.category, address: f.place.address, description: f.place.description, tags: [] },
    candidates: candidatesPayload(f),
  };
  const response = await openai.responses.create({
    model: MODEL,
    input: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
    text: { format: zodTextFormat(OutputSchema, "recommendations") },
    max_output_tokens: MAX_OUTPUT_TOKENS,
  });
  const message = response.output.find((item) => item.type === "message");
  const content = message?.content?.[0];
  if (!content || content.type !== "output_text") {
    throw new Error(`예상치 못한 응답 형식: ${JSON.stringify(message?.content)}`);
  }
  const parsed = OutputSchema.parse(JSON.parse(content.text));
  const byId = new Map(f.candidates.map((c) => [c.id, c]));
  const picks = parsed.picks.map((p) => {
    const c = byId.get(p.id);
    // route.ts와 동일한 후처리(stripInternalMemberLabels)를 거친 뒤의 최종 사용자 노출 텍스트를 검사한다.
    return { id: p.id, name: c?.name ?? "(알 수 없음)", category: c?.category, reason: stripInternalMemberLabels(p.reason), rawReason: p.reason, matchedTags: p.matchedTags };
  });
  return { picks, usage: response.usage, tasteProfile };
}

const REPS = Number(process.env.EVAL_REPS ?? "1");

async function main() {
  const results = [];
  let leakCount = 0;
  for (const f of FIXTURES) {
    if (ONLY && !ONLY.includes(f.key)) continue;
    console.log(`\n=== ${f.key} — ${f.title} ===`);
    console.log(`probe: ${f.probe}`);
    for (let rep = 0; rep < REPS; rep++) {
      const r = await callFixture(f);
      const leaked = r.picks.some((p) => /member_[12]/.test(p.rawReason));
      if (leaked) leakCount++;
      console.log(`-- rep ${rep}${leaked ? " (원본에 내부 라벨 유출 있었음 — 정리 후 텍스트만 출력)" : ""} --`);
      for (const p of r.picks) console.log(`  [${p.id}] ${p.name} (${p.category}) :: ${p.reason}`);
      console.log("  usage:", r.usage);
      results.push({ key: f.key, title: f.title, probe: f.probe, rep, ...r });
    }
  }
  console.log(`\n내부 라벨 유출(정리 전 원본 기준): ${leakCount}건`);
  const outPath = new URL(`./regression-results${REPS > 1 ? "-reps" : ""}.json`, import.meta.url);
  writeFileSync(outPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`결과 저장: ${outPath.pathname}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
