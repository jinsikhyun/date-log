// src/app/api/place-google-photo/route.ts
// ─────────────────────────────────────────────────────────────
// GOOGLE_PLACES_PHOTO_FEATURE_HANDOFF.md — 장소의 Google 자동 대표사진.
// POST { placeId } → 서버가 그 id로 DB에서 name/address/lat/lng 를 직접 읽어 Google 을 조회한다
// (클라이언트가 임의 텍스트를 보내 다른 장소 사진을 긁어오게 하는 경로를 만들지 않기 위해).
// 사용자가 직접 올린 image_url 이 있는 장소·course_only 장소(사진 자체를 안 받는 상태)는 대상이
// 아니다. 2026-09-12 사용자 확정: 위시리스트뿐 아니라 다녀온 곳도 사진 없으면 자동 표시.
// 실패해도 이 라우트는 장소 저장을 막지 않는다 — 순수 조회 전용이라 실패는 그냥 no_match/error.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getWishlistPlacePhoto } from "@/lib/googlePlacePhoto";

const BodySchema = z.object({
  placeId: z.number().int().positive(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ status: "error", error: "로그인 후 이용해 주세요." }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ status: "error", error: "요청이 올바르지 않아요." }, { status: 400 });
  }

  // RLS 가 같은 커플 소유 행만 돌려준다 — couple_id 를 따로 검사하지 않는다.
  const { data: place, error: placeErr } = await supabase
    .from("places")
    .select("id, name, address, lat, lng, status, image_url, google_place_id")
    .eq("id", parsed.data.placeId)
    .maybeSingle();
  if (placeErr) {
    return NextResponse.json({ status: "error", error: "장소를 확인하지 못했어요." }, { status: 500 });
  }
  if (!place) {
    return NextResponse.json({ status: "error", error: "장소를 찾을 수 없어요." }, { status: 404 });
  }
  // 사용자 사진이 있거나 course_only(사진을 아예 안 받는 상태)면 Google 조회 자체를 하지
  // 않는다 — 어차피 안 보여줄 사진을 위해 유료 API를 부르지 않는다.
  if (place.status === "course_only" || place.image_url) {
    return NextResponse.json({ status: "no_match" });
  }

  const result = await getWishlistPlacePhoto({
    placeId: place.id,
    name: place.name,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    existingGooglePlaceId: place.google_place_id,
  });

  if (result.matchedGooglePlaceId && result.matchedGooglePlaceId !== place.google_place_id) {
    // Best-effort 캐싱: place_id는 Google 정책상 캐싱 제한 예외라 저장 가능(공식 문서 확인).
    // 다음 조회부터 Text Search 매칭 단계를 건너뛰게 해준다. 실패해도 응답에는 영향 없음.
    const { error: updateErr } = await supabase
      .from("places")
      .update({ google_place_id: result.matchedGooglePlaceId })
      .eq("id", place.id);
    if (updateErr) {
      console.error("[place-google-photo] google_place_id 저장 실패:", updateErr.code);
    }
  }

  if (result.status !== "ok") {
    return NextResponse.json({ status: result.status });
  }
  return NextResponse.json({
    status: "ok",
    dataUrl: result.dataUrl,
    attribution: result.attribution ?? null,
    googleMapsUri: result.googleMapsUri ?? null,
  });
}
