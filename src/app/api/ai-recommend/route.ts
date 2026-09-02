import { NextResponse, type NextRequest } from "next/server";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { haversineKm } from "@/lib/courses";
import { ALL_TAGS } from "@/lib/tags";

// 서버(route handler) 전용 코드. OPENAI_API_KEY 는 NEXT_PUBLIC_ 접두사가 없으므로
// Next.js 가 브라우저 번들에 절대 인라인하지 않는다 — 클라이언트에서 직접 호출하지 않는다.
// AI_RECOMMENDATION_HANDOFF.md §7: 소형·저비용 모델 사용. 2026-09-03 OpenAI 공식 모델 페이지 기준
// gpt-5.6-luna = $0.20 / $1.20 (입력 / 출력, 1M 토큰) — GPT-5.6 세대의 저비용 티어.
// Structured Outputs·Responses API 공식 지원 확인.
const MODEL = "gpt-5.6-luna";

const MIN_COUNT = 1;
const MAX_COUNT = 5; // AI_RECOMMENDATION_HANDOFF.md §2: 한 번에 최대 5개
const MAX_CANDIDATES = 20; // 프롬프트 크기·비용 상한
// gpt-5.6-luna 는 (다른 GPT-5.x 계열처럼) 보이는 JSON 앞에 내부적으로 토큰을 더 쓸 수 있어
// 800으로는 가끔 응답이 중간에 잘려 JSON 파싱이 실패했다(실측). 여유 있게 올림 — 그래도
// 출력 단가가 1M 토큰당 $1.20이라 호출당 비용 영향은 미미하다.
const MAX_OUTPUT_TOKENS = 2000;
const FAVORITE_TAGS_LIMIT = 8; // 커플 취향 태그 상위 몇 개까지 프롬프트에 줄지

// 비용 방어(DB 기반) — 커플당 시간당 호출 횟수를 ai_recommend_calls 테이블에 기록하고
// 세어서 막는다. supabase/add-ai-recommend-rate-limit.sql 을 먼저 적용해야 동작한다.
// (이전 버전은 서버 인스턴스 메모리 기준이라 Vercel 서버리스에서 인스턴스가
// 여러 개/재시작되면 안 지켜지는 문제가 있었음 — 지금은 DB로 옮겨 해결.)
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1시간
const RATE_LIMIT_MAX_CALLS = 20; // 커플당 시간당 최대 호출

async function checkRateLimit(
  supabase: SupabaseClient,
  coupleId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from("ai_recommend_calls")
    .select("id", { count: "exact", head: true })
    .eq("couple_id", coupleId)
    .gte("created_at", since);
  if (error) {
    // 마이그레이션 전이거나 일시적 DB 오류 — 막지 않고 통과시킨다(가용성 우선).
    console.error("[ai-recommend] rate limit 확인 실패:", error);
    return true;
  }
  if ((count ?? 0) >= RATE_LIMIT_MAX_CALLS) return false;

  const { error: insErr } = await supabase
    .from("ai_recommend_calls")
    .insert({ couple_id: coupleId });
  if (insErr) {
    console.error("[ai-recommend] rate limit 기록 실패:", insErr);
  }
  return true;
}

const ShortText = z.string().trim().min(1).max(200);
const TagList = z.array(z.string().trim().min(1).max(40)).max(20).default([]);
const Latitude = z.number().finite().min(-90).max(90);
const Longitude = z.number().finite().min(-180).max(180);
const CandidateInputSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: ShortText,
  category: ShortText,
  categoryName: z.string().trim().max(300).optional(),
  address: z.string().trim().min(1).max(300),
  lat: Latitude,
  lng: Longitude,
  distanceMeters: z.number().finite().min(0).max(100_000).optional(),
  kakaoMapUrl: z.string().url().max(500).nullable().optional(),
});
const CourseStopInputSchema = z.object({
  name: ShortText,
  category: ShortText,
  tags: TagList.optional(),
});
const RequestBodySchema = z.object({
  // place_detail(기본): 장소 상세 페이지, place 자체가 추천 기준.
  // course: place 는 마지막 장소, courseStops 는 코스 전체 맥락이다.
  mode: z.enum(["place_detail", "course"]).optional(),
  place: z.object({
    name: ShortText,
    category: ShortText,
    address: z.string().trim().min(1).max(300),
    description: z.string().trim().max(1_000).nullable().optional(),
    tags: TagList.optional(),
    lat: Latitude.nullable().optional(),
    lng: Longitude.nullable().optional(),
  }),
  courseStops: z.array(CourseStopInputSchema).max(20).optional(),
  candidates: z.array(CandidateInputSchema).min(1).max(MAX_CANDIDATES),
  count: z.number().int().min(MIN_COUNT).max(MAX_COUNT).optional(),
});
type RequestBody = z.infer<typeof RequestBodySchema>;

export async function POST(req: NextRequest) {
  // 로그인한 커플만 호출 가능 — 비로그인 요청으로 유료 API 예산이 새는 것을 막는다.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("couple_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.couple_id) {
    return NextResponse.json(
      { error: "커플 연결을 완료한 뒤 AI 추천을 이용해 주세요." },
      { status: 403 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[ai-recommend] OPENAI_API_KEY 가 설정되지 않았어요.");
    return NextResponse.json(
      { error: "AI 추천 기능이 아직 설정되지 않았어요." },
      { status: 500 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  const bodyResult = RequestBodySchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return NextResponse.json(
      { error: "추천 요청의 장소 정보가 올바르지 않아요." },
      { status: 400 },
    );
  }
  const body: RequestBody = bodyResult.data;

  const ok = await checkRateLimit(supabase, profile.couple_id);
  if (!ok) {
    return NextResponse.json(
      { error: "AI 추천을 너무 많이 요청했어요. 잠시 후 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  const rawCandidates = body.candidates;

  // 커플이 그동안 저장한 장소들의 태그 빈도 상위 N개 — "위시리스트/코스 추가"로
  // 확정된 취향을 다음 추천에 다시 반영해 취향을 좁혀간다(피드백 루프).
  // AI가 추천을 고른 근거(matchedTags)를 그 장소의 tags로 그대로 저장해두기 때문에
  // (AiRecommendationSection.addToWishlist, CourseForm.addAiCandidate) 성립한다.
  const { data: tagRows } = await supabase
    .from("places")
    .select("tags")
    .eq("couple_id", profile.couple_id);
  const tagCounts = new Map<string, number>();
  for (const row of tagRows ?? []) {
    for (const t of row.tags ?? []) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  }
  const favoriteTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, FAVORITE_TAGS_LIMIT)
    .map(([tag]) => tag);
  const count = Math.min(MAX_COUNT, Math.max(MIN_COUNT, body.count ?? 3));

  const placeCoord =
    body.place.lat != null && body.place.lng != null
      ? { lat: body.place.lat, lng: body.place.lng }
      : null;

  // 거리는 AI가 계산하지 않는다 — 서버가 한 번만 계산해 두고(있으면 그대로 재사용)
  // AI 프롬프트와 최종 응답 양쪽에 같은 값을 쓴다.
  const candidates = rawCandidates.map((c) => ({
    ...c,
    distanceMeters:
      c.distanceMeters ??
      (placeCoord != null
        ? Math.round(haversineKm(placeCoord, { lat: c.lat, lng: c.lng }) * 1000)
        : null),
  }));

  const mode = body.mode === "course" ? "course" : "place_detail";

  // matchedTags 는 자유 문구가 아니라 §6 확정 태그 체계 + 이번 요청에 실제로 쓰인
  // place/코스 태그(사용자 직접 추가 태그 포함)로만 제한한다. 요청마다 후보 태그가
  // 다르므로 스키마를 매 요청 안에서 만든다.
  const allowedTags = Array.from(
    new Set([
      ...ALL_TAGS,
      ...(body.place.tags ?? []),
      ...(mode === "course"
        ? (body.courseStops ?? []).flatMap((s) => s.tags ?? [])
        : []),
      ...favoriteTags,
    ]),
  );
  const TagEnum = z.enum(allowedTags as [string, ...string[]]);
  const PickSchema = z.object({
    id: z.string(),
    reason: z.string(),
    matchedTags: z.array(TagEnum),
  });
  const OutputSchema = z.object({ picks: z.array(PickSchema) });

  const commonRules = [
    "user 메시지의 candidates 배열에 있는 장소 중에서만 선택하세요. 목록에 없는 장소를 만들어내거나 이름·주소를 바꾸지 마세요.",
    "candidates 에 없는 메뉴·분위기·영업 특성은 지어내지 마세요 — category, address, distanceMeters 로 확인 가능한 사실만 근거로 쓰세요.",
    "",
    "적절한 후보가 부족하면 억지로 개수를 채우지 말고 실제로 추천할 만한 만큼만 반환하세요(0개도 가능합니다).",
    "고른 항목끼리 카테고리·컨셉이 서로 겹치지 않도록 다양하게 고르세요.",
    `matchedTags 는 반드시 다음 목록 중에서만, 그 후보와 실제로 어울리는 것만 골라 담으세요: ${allowedTags.join(", ")}`,
    "id 는 candidates 의 id 를 그대로 사용하세요.",
    ...(favoriteTags.length > 0
      ? [
          `coupleFavoriteTags 는 이 커플이 그동안 위시리스트·코스에 추가해온 장소들에서 자주 나온 태그입니다: ${favoriteTags.join(", ")}. 관련 있으면 참고해서 취향에 더 맞는 후보를 우선하세요.`,
        ]
      : []),
  ];

  const system =
    mode === "course"
      ? [
          "당신은 date.log 서비스의 데이트 코스 추천 도우미입니다. place 는 지금까지 담은 코스의 마지막 장소이고, courseStops 는 코스 전체(순서대로)입니다.",
          ...commonRules,
          "",
          `다음 기준으로 candidates 를 평가해 최대 ${count}개까지 고르세요:`,
          "- 동선·거리 50%: place(마지막 장소) 기준 distanceMeters 가 가까울수록 좋습니다 — 코스 추천에서는 거리가 가장 중요한 기준입니다.",
          "- 코스 전체 컨셉 30%: courseStops 전체의 공통 분위기·카테고리 조합, 그리고 있다면 coupleFavoriteTags 와 어울리는지",
          "- 후보 구체성·적합성 20%: candidate.category 가 데이트 코스에 자연스럽게 이어질 구체적인 업종인지",
          "",
          "각 항목마다 courseStops 의 맥락과 candidate 의 실제 정보(카테고리, 주소, 거리)를 연결한",
          "한국어 1~2문장의 reason 을 쓰고, 거리·동선 근거를 짧게 포함하세요.",
          "reason 에서는 '마지막 정거장'이라는 표현을 쓰지 말고 반드시 '마지막 장소'라고 표현하세요.",
        ].join("\n")
      : [
          "당신은 date.log 서비스의 장소 추천 도우미입니다.",
          ...commonRules,
          "",
          `다음 기준으로 candidates 를 평가해 최대 ${count}개까지 고르세요 (거리를 최우선으로 평가하지 마세요):`,
          "- 취향·태그·분위기 유사도 45%: place.tags, place.description, 그리고 있다면 coupleFavoriteTags(커플이 그동안 선호해온 태그 패턴)와 candidate.category 의 결이 얼마나 맞는지",
          "- 데이트 맥락 25%: place 에서 자연스럽게 이어지는 다음 장소로 어울리는지",
          "- 후보 구체성·카테고리 적합성 20%: candidate.category 가 데이트 목적에 맞는 구체적인 업종인지 (모호하거나 관련 없는 업종은 낮게 평가)",
          "- 거리 10%: 너무 멀지만 않으면 충분합니다 — distanceMeters 만으로 순위를 매기지 마세요",
          "",
          "각 항목마다 place 의 설명·태그와 candidate 의 실제 정보(카테고리, 주소, 거리)를 구체적으로 연결한",
          "한국어 1~2문장의 reason 을 쓰세요. \"가까워서 편합니다\" 류의 표현만 반복하지 마세요.",
        ].join("\n");

  const userPayload = {
    place: {
      name: body.place.name,
      category: body.place.category,
      address: body.place.address,
      description: body.place.description ?? null,
      tags: body.place.tags ?? [],
    },
    ...(mode === "course" ? { courseStops: body.courseStops ?? [] } : {}),
    ...(favoriteTags.length > 0 ? { coupleFavoriteTags: favoriteTags } : {}),
    candidates: candidates.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.categoryName ?? c.category,
      address: c.address,
      lat: c.lat,
      lng: c.lng,
      distanceMeters: c.distanceMeters,
    })),
  };

  const openai = new OpenAI({ apiKey });

  let response;
  try {
    response = await openai.responses.create({
      model: MODEL,
      input: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      text: { format: zodTextFormat(OutputSchema, "recommendations") },
      max_output_tokens: MAX_OUTPUT_TOKENS,
    });
  } catch (err) {
    console.error("[ai-recommend] OpenAI 호출 실패:", err);
    return NextResponse.json(
      { error: "추천을 가져오지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }

  const message = response.output.find((item) => item.type === "message");
  const content = message?.content?.[0];
  if (!content || content.type !== "output_text") {
    console.error("[ai-recommend] 예상치 못한 응답 형식:", message?.content);
    return NextResponse.json(
      { error: "추천 응답을 이해하지 못했어요." },
      { status: 502 },
    );
  }

  let parsed: z.infer<typeof OutputSchema>;
  try {
    parsed = OutputSchema.parse(JSON.parse(content.text));
  } catch (err) {
    console.error("[ai-recommend] 응답 파싱 실패:", err);
    return NextResponse.json(
      { error: "추천 응답을 이해하지 못했어요." },
      { status: 502 },
    );
  }

  const byId = new Map(candidates.map((c) => [c.id, c]));

  const recommendations = parsed.picks
    .map((pick) => {
      // AI 가 candidates 에 없는 id 를 반환하면 버린다 — 실제 존재하지 않는 장소 조작 방지.
      const c = byId.get(pick.id);
      if (!c) return null;
      return {
        kakaoPlaceId: c.id,
        name: c.name,
        category: c.category,
        address: c.address,
        lat: c.lat,
        lng: c.lng,
        distanceMeters: c.distanceMeters,
        // 모델이 이전 표현을 답하더라도 사용자에게는 제품 용어인 "마지막 장소"로 통일한다.
        reason: pick.reason.replaceAll("마지막 정거장", "마지막 장소"),
        matchedTags: pick.matchedTags,
        kakaoMapUrl: c.kakaoMapUrl ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null)
    .slice(0, count);

  return NextResponse.json({ recommendations });
}
