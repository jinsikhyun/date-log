import { NextResponse, type NextRequest } from "next/server";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { haversineKm } from "@/lib/courses";
import { ALL_TAGS } from "@/lib/tags";
import { isLocalCourse, contextPolicy } from "@/lib/recommendationPolicy";
import { buildTasteProfile, type TasteProfilePlace, type TasteProfileMemory } from "@/lib/tasteProfile";
import {
  buildCommonRules,
  buildPlaceDetailScoringRules,
  buildCourseScoringRules,
  stripInternalMemberLabels,
} from "@/lib/recommendationPrompt";
import { CourseContextSchema } from "@/lib/courseContext";

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
  // §5단계(우리 위시 활용): 카카오가 아니라 우리 위시리스트에서 온 후보인지. AI 프롬프트와
  // 최종 응답까지 그대로 통과시켜 "새로 발견한 곳"으로 오표시되지 않게 한다 — 검색어 출처
  // 메타(specific/base)와 달리 이건 사용자에게 그대로 보여줘야 하는 정보라 숨기지 않는다.
  alreadyOnWishlist: z.boolean().default(false),
  wishPlaceId: z.number().int().optional(),
});
const CourseStopInputSchema = z.object({
  name: ShortText,
  category: ShortText,
  tags: TagList.optional(),
  lat: Latitude.nullable().optional(),
  lng: Longitude.nullable().optional(),
});
const RequestBodySchema = z.object({
  context: CourseContextSchema.optional(),
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

  // buildTasteProfile(§4단계) 입력. places에는 상한이 없으면 커플이 오래 쓸수록
  // 무한정 커진다 — memories와 같은 방식(최근순 + 상한)으로 방어한다.
  // 2026-09-08 조회 부담 검토: couple_id에 인덱스가 없어(운영 확인,
  // supabase/migrations/20260908000000_add_couple_id_indexes.sql — 아직 미실행) 테이블
  // 전체 크기에 비례해 스캔 비용이 커진다. 지금 데이터량에서는 문제되지 않지만 인덱스
  // 적용 전까지는 이 상한이 유일한 방어선이다.
  const PLACE_TASTE_ROWS_LIMIT = 300;
  const { data: tasteRows, error: tasteError } = await supabase
    .from("places")
    .select(
      "id, name, category, status, rating, confirmed_tags, wanted_by_ids, is_regular, first_visit_date, created_at, place_preferences(user_id, kind)",
    )
    .eq("couple_id", profile.couple_id)
    .order("created_at", { ascending: false })
    .limit(PLACE_TASTE_ROWS_LIMIT);
  if (tasteError) {
    return NextResponse.json({ error: "우리의 취향 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
  const [memberResult, memoryResult] = await Promise.all([
    supabase.from("profiles").select("id, display_name").eq("couple_id", profile.couple_id).order("id"),
    // content(추억 원문)를 새로 조회한다 — buildTasteProfile 안에서 관련 있는 소수 장소에만,
    // 요청당 상한을 두고 붙인다(tasteProfile.ts 상단 QUOTE_BUDGET_TOTAL 주석 참고).
    supabase.from("memories").select("place_id, author, mood_tag, content, date, created_at")
      .eq("couple_id", profile.couple_id).not("mood_tag", "is", null)
      .order("date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(200),
  ]);
  if (memberResult.error || memoryResult.error) {
    return NextResponse.json({ error: "방문 후 평가를 확인하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
  const coupleMembers = memberResult.data ?? [];
  const tasteProfilePlaces: TasteProfilePlace[] = (tasteRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    status: row.status as TasteProfilePlace["status"],
    rating: row.rating,
    confirmedTags: row.confirmed_tags ?? [],
    isRegular: row.is_regular ?? false,
    favoriteBy: (row.place_preferences ?? []).filter((p) => p.kind === "pick").map((p) => p.user_id),
    wantedByIds: row.wanted_by_ids ?? [],
    firstVisitDate: row.first_visit_date,
    createdAt: row.created_at,
  }));
  const tasteProfileMemories: TasteProfileMemory[] = (memoryResult.data ?? []).map((m) => ({
    placeId: m.place_id,
    author: m.author,
    moodTag: m.mood_tag,
    content: m.content,
    date: m.date,
    createdAt: m.created_at,
  }));
  const tasteProfile = buildTasteProfile(
    tasteProfilePlaces,
    tasteProfileMemories,
    coupleMembers.map((m) => ({ id: m.id, displayName: m.display_name })),
    new Date(),
  );
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
      (placeCoord != null
        ? Math.round(haversineKm(placeCoord, { lat: c.lat, lng: c.lng }) * 1000)
        : null),
  }));

  const mode = body.mode === "course" ? "course" : "place_detail";
  const localCourse = mode === "course" && isLocalCourse(body.courseStops ?? []);
  const policy = contextPolicy(localCourse, mode === "course" ? body.context : undefined);

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
    ]),
  );
  const TagEnum = z.enum(allowedTags as [string, ...string[]]);
  const PickSchema = z.object({
    id: z.string(),
    reason: z.string(),
    matchedTags: z.array(TagEnum),
  });
  const OutputSchema = z.object({ picks: z.array(PickSchema) });

  const commonRules = buildCommonRules(allowedTags);

  const system =
    mode === "course"
      ? [
          "당신은 date.log 서비스의 데이트 코스 추천 도우미입니다. place 는 지금까지 담은 코스의 마지막 장소이고, courseStops 는 코스 전체(순서대로)입니다.",
          ...commonRules,
          "",
          ...buildCourseScoringRules(count, policy),
        ].join("\n")
      : [
          "당신은 date.log 서비스의 장소 추천 도우미입니다.",
          ...commonRules,
          "",
          ...buildPlaceDetailScoringRules(count),
        ].join("\n");

  const userPayload = {
    ...(mode === "course" ? { courseContext: body.context ?? {} } : {}),
    tasteProfile,
    place: {
      name: body.place.name,
      category: body.place.category,
      address: body.place.address,
      description: body.place.description ?? null,
      tags: [], // legacy tags는 출처 미확인
    },
    ...(mode === "course" ? { courseStops: (body.courseStops ?? []).map(s => ({ ...s, tags: [] })) } : {}),
    candidates: candidates.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.categoryName ?? c.category,
      address: c.address,
      lat: c.lat,
      lng: c.lng,
      distanceMeters: c.distanceMeters,
      alreadyOnWishlist: c.alreadyOnWishlist,
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

  const seen = new Set<string>();
  const recommendations = parsed.picks
    .filter(pick => { if (seen.has(pick.id)) return false; seen.add(pick.id); return true; })
    .map((pick) => {
      // AI 가 candidates 에 없는 id 를 반환하면 버린다 — 실제 존재하지 않는 장소 조작 방지.
      const c = byId.get(pick.id);
      if (!c) return null;
      if (mode === "course" && body.context?.travel && (c.distanceMeters == null || c.distanceMeters > policy.radiusMeters)) return null;
      return {
        kakaoPlaceId: c.id,
        name: c.name,
        category: c.category,
        address: c.address,
        lat: c.lat,
        lng: c.lng,
        distanceMeters: c.distanceMeters,
        // 모델이 이전 표현을 답하더라도 사용자에게는 제품 용어인 "마지막 장소"로 통일하고,
        // tasteProfile 내부 라벨("member_1 pick" 등) 유출도 후처리로 방어한다.
        reason: stripInternalMemberLabels(pick.reason).replaceAll("마지막 정거장", "마지막 장소"),
        matchedTags: pick.matchedTags,
        kakaoMapUrl: c.kakaoMapUrl ?? null,
        alreadyOnWishlist: c.alreadyOnWishlist,
        wishPlaceId: c.wishPlaceId ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null)
    .slice(0, count);

  return NextResponse.json({ recommendations });
}
