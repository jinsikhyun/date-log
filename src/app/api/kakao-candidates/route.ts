import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  collectCandidates,
  excludeNearSelf,
  extractKakaoId,
  withDistance,
} from "@/lib/kakaoLocal";

// 서버 전용. KAKAO_REST_API_KEY 는 NEXT_PUBLIC_ 이 아니므로 브라우저 번들에 안 들어간다.
// AI_RECOMMENDATION_HANDOFF.md §5·§6: 서울·경기 범위 제한 + date.log 에 이미 있는 장소 제외.

const MAX_RADIUS_METERS = 20000;
const MAX_LIMIT = 15;
const DEFAULT_MIN_DISTANCE_METERS = 50; // 같은 건물/바로 옆 정도는 "새 추천"으로서 의미가 없다.
const MAX_TAGS_IN_QUERY = 2;

interface RequestBody {
  category: string; // date.log 카테고리명("카페", "맛집" 등) — 검색어의 기본 축
  tags?: string[]; // 카테고리와 조합해 추가 검색어를 만든다 (최대 MAX_TAGS_IN_QUERY개)
  lat: number;
  lng: number;
  radiusMeters?: number;
  limit?: number;
  excludeKakaoIds?: string[]; // 자기 자신 id, 코스 작성 중 이미 추가된 곳 등
  excludeAddress?: string; // 현재 장소 주소 — 정확히 같은 주소는 제외
  minDistanceMeters?: number; // 기본 50 — 이보다 가까운 후보는 제외
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    console.error("[kakao-candidates] KAKAO_REST_API_KEY 가 설정되지 않았어요.");
    return NextResponse.json(
      { error: "장소 후보 검색이 아직 설정되지 않았어요." },
      { status: 500 },
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  if (
    !body.category?.trim() ||
    typeof body.lat !== "number" ||
    typeof body.lng !== "number"
  ) {
    return NextResponse.json(
      { error: "카테고리와 좌표(lat, lng)가 필요해요." },
      { status: 400 },
    );
  }

  // date.log 에 이미 저장된 장소는 후보에서 제외 — 같은 곳을 "새 추천"처럼 보여주지 않는다.
  const { data: ownPlaces, error: placesErr } = await supabase
    .from("places")
    .select("kakao_map_link");
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
  const queries = [
    category,
    ...(body.tags ?? [])
      .slice(0, MAX_TAGS_IN_QUERY)
      .map((t) => `${category} ${t}`),
  ];

  let raw;
  try {
    raw = await collectCandidates({
      apiKey,
      queries,
      lat: body.lat,
      lng: body.lng,
      radiusMeters: Math.min(MAX_RADIUS_METERS, body.radiusMeters ?? 3000),
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
  const candidates = nearFiltered
    .filter((c) => !excludeIds.has(c.id))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, Math.min(MAX_LIMIT, body.limit ?? 12));

  return NextResponse.json({ candidates });
}
