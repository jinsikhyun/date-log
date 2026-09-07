import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { CourseContextSchema } from "@/lib/courseContext";
import { diverseCandidates, isLocalCourse, searchQueries, contextPolicy, contextualQueries } from "@/lib/recommendationPolicy";
import {
  collectCandidates,
  deriveSpecificSearchTerm,
  excludeNearSelf,
  extractKakaoId,
  findReferenceCategoryName,
  withDistance,
} from "@/lib/kakaoLocal";

// 서버 전용. KAKAO_REST_API_KEY 는 NEXT_PUBLIC_ 이 아니므로 브라우저 번들에 안 들어간다.
// AI_RECOMMENDATION_HANDOFF.md §5·§6: 서울·경기 범위 제한 + date.log 에 이미 있는 장소 제외.

const MAX_RADIUS_METERS = 20000;
const MAX_LIMIT = 20;
const DEFAULT_MIN_DISTANCE_METERS = 50; // 같은 건물/바로 옆 정도는 "새 추천"으로서 의미가 없다.

const RequestBodySchema = z.object({
  context: CourseContextSchema.optional(),
  mode: z.enum(["place_detail", "course"]).default("place_detail"),
  courseStops: z.array(z.object({
    category: z.string().max(100),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
  })).max(20).default([]),
  category: z.string().trim().min(1).max(100),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  // place_detail 전용(3단계): 기준 장소 자신을 Kakao에서 재검색해 세부 업종을 얻는 데만 쓴다.
  // course 모드는 무시한다(courseStops 기반 역할 검색이 이미 있음).
  name: z.string().trim().min(1).max(200).optional(),
  kakaoMapLink: z.string().url().max(500).nullable().optional(),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  radiusMeters: z.number().finite().min(1).max(MAX_RADIUS_METERS).optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
  excludeKakaoIds: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
  excludeAddress: z.string().trim().max(300).optional(),
  minDistanceMeters: z.number().finite().min(0).max(MAX_RADIUS_METERS).optional(),
});

export async function POST(req: NextRequest) {
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
      { error: "커플 연결을 완료한 뒤 장소 추천을 이용해 주세요." },
      { status: 403 },
    );
  }

  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    console.error("[kakao-candidates] KAKAO_REST_API_KEY 가 설정되지 않았어요.");
    return NextResponse.json(
      { error: "장소 후보 검색이 아직 설정되지 않았어요." },
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
      { error: "장소 후보 요청 정보가 올바르지 않아요." },
      { status: 400 },
    );
  }
  const body = bodyResult.data;

  // date.log 에 이미 저장된 장소는 후보에서 제외 — 같은 곳을 "새 추천"처럼 보여주지 않는다.
  const { data: ownPlaces, error: placesErr } = await supabase
    .from("places")
    .select("kakao_map_link")
    .eq("couple_id", profile.couple_id);
  if (placesErr) {
    console.error("[kakao-candidates] 기존 장소 조회 실패:", placesErr);
    return NextResponse.json(
      { error: "기존 장소 목록을 확인하지 못했어요." },
      { status: 500 },
    );
  }
  const excludeIds = new Set(
    (ownPlaces ?? [])
      .map((p) => extractKakaoId(p.kakao_map_link))
      .filter((id): id is string => id != null),
  );
  for (const id of body.excludeKakaoIds ?? []) excludeIds.add(id);

  // 카테고리 하나로만 검색하지 않고, 태그를 조합한 검색어도 함께 써서 후보 폭을 넓힌다.
  const category = body.category.trim();
  const local = body.mode === "course" && isLocalCourse(body.courseStops);
  const context = body.mode === "course" ? body.context : undefined;
  const policy = contextPolicy(local, context);
  const baseQueries = searchQueries(body.mode, category, [], body.courseStops);

  // place_detail 전용 3단계 개선: "카페"/"맛집" 같은 우리 앱의 대분류 하나로만 검색하면
  // 실측상 반경 수백m를 못 벗어난다(진단 결과 참고). 기준 장소를 이름+좌표로 재검색해
  // Kakao 쪽 세부 category_name(예: "일본식라면")을 확인되면 검색어에 추가한다.
  // course 모드는 이미 역할 기반 다중 검색어가 있어 건드리지 않는다.
  let specificTerm: string | null = null;
  if (body.mode !== "course" && body.name) {
    const expectedId = extractKakaoId(body.kakaoMapLink);
    if (expectedId) {
      try {
        const found = await findReferenceCategoryName({
          apiKey,
          name: body.name,
          lat: body.lat,
          lng: body.lng,
          expectedId,
        });
        specificTerm = found ? deriveSpecificSearchTerm(found.categoryName) : null;
        // 식별정보(장소명·좌표) 없이 성공/실패와 실제 쓰인 검색어만 남긴다 — §0단계 원칙.
        console.log(
          `[kakao-candidates] 세부업종 검색어: ${specificTerm ? `"${specificTerm}" 사용` : found ? "category_name은 확인했으나 쓸 만한 세부 항목 없음" : "기준 장소 재검색 매칭 실패 — 대분류만 사용"}`,
        );
      } catch (err) {
        console.error("[kakao-candidates] 기준 장소 세부업종 조회 실패(대분류로 계속):", err);
      }
    } else {
      console.log("[kakao-candidates] kakaoMapLink 없음 — 대분류만 사용");
    }
  }

  const queries = contextualQueries(
    specificTerm ? [specificTerm, ...baseQueries] : baseQueries,
    context,
  );

  let raw;
  try {
    raw = await collectCandidates({
      apiKey,
      queries,
      lat: body.lat,
      lng: body.lng,
      radiusMeters: context?.travel ? policy.radiusMeters : Math.min(MAX_RADIUS_METERS, body.radiusMeters ?? policy.radiusMeters),
    });
  } catch (err) {
    console.error("[kakao-candidates] 카카오 API 호출 실패:", err);
    return NextResponse.json(
      { error: "장소 후보를 가져오지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }

  // 거리(현재 장소 기준)를 붙인 뒤: 자기 자신 주소·근접(기본 50m 이내) 제외 → 이미 저장된 장소 제외.
  const withDist = withDistance(raw, { lat: body.lat, lng: body.lng });
  const nearFiltered = excludeNearSelf(
    withDist,
    { address: body.excludeAddress },
    body.minDistanceMeters ?? DEFAULT_MIN_DISTANCE_METERS,
  );
  const candidates = diverseCandidates(
    nearFiltered.filter((c) => !excludeIds.has(c.id) && (!context?.travel || c.distanceMeters <= policy.radiusMeters)),
    Math.min(MAX_LIMIT, body.limit ?? 20), policy.distanceFirst,
  );

  return NextResponse.json({ candidates });
}
