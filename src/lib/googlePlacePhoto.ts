// GOOGLE_PLACES_PHOTO_FEATURE_HANDOFF.md — 사용자 사진이 없는 장소의 Google 자동 대표사진
// (위시리스트·다녀온 곳 공통, course_only는 제외).
// 서버 전용 모듈(API 키를 다룬다). 클라이언트에서 절대 import 하지 않는다.
//
// 정책(공식 문서 직접 확인, §3):
//  - 사진 리소스 이름(photos[].name)은 캐시·저장 금지, 만료될 수 있음 → 표시할 때마다 재조회.
//  - Google Place ID는 캐싱 제한의 명시적 예외 → 재매칭을 건너뛰기 위해 호출자가 DB에 저장해도 된다
//    (이 파일은 저장을 하지 않는다 — 저장은 API route가 담당).
//  - Photo 리소스에 실제로 googleMapsUri 필드가 있다(REST 레퍼런스로 확인) — 장소 전체가 아니라
//    "이 사진을 Google 지도에서 보기" 링크.
//  - 이미지 바이트는 서버가 받아 data URL로 클라이언트에 내려준다 — API 키가 포함된 Google
//    media URL을 클라이언트가 보는 일은 없다.
//
// 호출량 최소화: Text Search는 photos 필드를 요청하지 않는다(Enterprise 과금 회피, Pro tier로 매칭만).
// 사진은 Place Details에 photos·googleMapsUri만 field mask로 요청(가장 저렴한 Photos SKU).

import { isConfidentMatch, type GoogleCandidate, type OurPlace } from "@/lib/googlePlaceMatch";

const API_BASE = "https://places.googleapis.com/v1";
const TIMEOUT_MS = 8000;
const DEFAULT_MAX_WIDTH_PX = 800;

function apiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY 가 설정되지 않았어요.");
  return key;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface JsonResult {
  ok: boolean;
  status: number;
  body: unknown;
}

async function fetchJsonOnce(url: string, init: RequestInit): Promise<JsonResult> {
  const res = await fetchWithTimeout(url, init);
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

/** 4xx(요청 자체가 잘못됨)는 재시도하지 않는다. 네트워크 오류·timeout·5xx만 1회 재시도. */
async function fetchJsonWithRetry(url: string, init: RequestInit): Promise<JsonResult> {
  try {
    const first = await fetchJsonOnce(url, init);
    if (first.ok || first.status < 500) return first;
    return await fetchJsonOnce(url, init);
  } catch {
    return await fetchJsonOnce(url, init);
  }
}

// "확인해봤는데 없음"(empty)과 "확인 자체를 못 함"(failed)을 구분한다 — 로그·상태 코드가
// "성공/실패"를 정확히 반영하게 하기 위해(§6: 서버 로그에 성공/실패를 남긴다).
type Outcome<T> = { kind: "ok"; value: T } | { kind: "empty" } | { kind: "failed" };

async function textSearchCandidate(place: OurPlace): Promise<Outcome<GoogleCandidate>> {
  const res = await fetchJsonWithRetry(`${API_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey(),
      // photos 는 여기서 요청하지 않는다 — Enterprise SKU 과금을 매칭 단계에서 발생시키지 않기 위해.
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({
      textQuery: `${place.name} ${place.address}`.trim(),
      locationBias: {
        circle: {
          center: { latitude: place.lat, longitude: place.lng },
          radius: 300,
        },
      },
      languageCode: "ko",
      maxResultCount: 1,
    }),
  });
  if (!res.ok) return { kind: "failed" };
  const body = res.body as { places?: Array<Record<string, unknown>> } | null;
  const top = body?.places?.[0];
  const location = top?.location as { latitude?: number; longitude?: number } | undefined;
  if (!top?.id || typeof location?.latitude !== "number" || typeof location?.longitude !== "number") {
    return { kind: "empty" };
  }
  const displayName = top.displayName as { text?: string } | undefined;
  return {
    kind: "ok",
    value: {
      id: String(top.id),
      displayName: displayName?.text ?? "",
      formattedAddress: typeof top.formattedAddress === "string" ? top.formattedAddress : "",
      lat: location.latitude,
      lng: location.longitude,
    },
  };
}

interface PhotoMeta {
  photoName: string;
  googleMapsUri: string;
  attribution: { displayName: string; uri: string } | null;
}

async function fetchPlacePhotoMeta(googlePlaceId: string): Promise<Outcome<PhotoMeta>> {
  const res = await fetchJsonWithRetry(`${API_BASE}/places/${encodeURIComponent(googlePlaceId)}`, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask": "photos,googleMapsUri",
    },
  });
  if (!res.ok) return { kind: "failed" };
  const body = res.body as {
    photos?: Array<{
      name?: string;
      googleMapsUri?: string;
      authorAttributions?: Array<{ displayName?: string; uri?: string }>;
    }>;
    googleMapsUri?: string;
  } | null;
  const photo = body?.photos?.[0];
  if (!photo?.name) return { kind: "empty" };
  const author = photo.authorAttributions?.[0];
  return {
    kind: "ok",
    value: {
      photoName: photo.name,
      // Photo 자체의 googleMapsUri(REST 레퍼런스 확인: "이 사진을 Google 지도에서 보기")를
      // 우선 쓰고, 없으면 장소 전체 링크로 대체.
      googleMapsUri: photo.googleMapsUri || body?.googleMapsUri || "",
      attribution: author?.displayName ? { displayName: author.displayName, uri: author.uri ?? "" } : null,
    },
  };
}

async function fetchPhotoDataUrl(photoName: string, maxWidthPx = DEFAULT_MAX_WIDTH_PX): Promise<string | null> {
  const url = `${API_BASE}/${photoName}/media?maxWidthPx=${maxWidthPx}`;
  const res = await fetchWithTimeout(url, {
    headers: { "X-Goog-Api-Key": apiKey() },
  });
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const buf = await res.arrayBuffer();
  return `data:${contentType};base64,${Buffer.from(buf).toString("base64")}`;
}

export interface GooglePlacePhotoInput {
  placeId: number;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  existingGooglePlaceId: string | null;
}

export interface GooglePlacePhotoResult {
  status: "ok" | "no_match" | "error";
  dataUrl?: string;
  attribution?: { displayName: string; uri: string } | null;
  googleMapsUri?: string;
  /** 새로 매칭된 Google place id. 호출자가 places.google_place_id 캐싱에 쓸 수 있다. */
  matchedGooglePlaceId?: string;
}

// 같은 장소에 대한 동시 요청을 하나로 합친다(중복 요청 방지). 서버 인스턴스 메모리에만
// 존재하며 응답 후 즉시 지워진다 — 사진 데이터를 저장해두는 캐시가 아니다.
const inflight = new Map<number, Promise<GooglePlacePhotoResult>>();

export async function getWishlistPlacePhoto(input: GooglePlacePhotoInput): Promise<GooglePlacePhotoResult> {
  const existing = inflight.get(input.placeId);
  if (existing) return existing;
  const task = runLookup(input).finally(() => inflight.delete(input.placeId));
  inflight.set(input.placeId, task);
  return task;
}

async function matchGooglePlaceId(
  input: GooglePlacePhotoInput,
  lat: number,
  lng: number,
): Promise<Outcome<string>> {
  const ours: OurPlace = { name: input.name, address: input.address, lat, lng };
  const outcome = await textSearchCandidate(ours);
  if (outcome.kind !== "ok") return outcome;
  if (!isConfidentMatch(ours, outcome.value)) return { kind: "empty" };
  return { kind: "ok", value: outcome.value.id };
}

async function runLookup(input: GooglePlacePhotoInput): Promise<GooglePlacePhotoResult> {
  try {
    if (input.lat == null || input.lng == null) {
      // 좌표 없이는 이름·주소만으로 매칭을 시도하지 않는다 — 위양성 위험이 너무 크다.
      return { status: "no_match" };
    }
    const lat = input.lat;
    const lng = input.lng;

    let googlePlaceId = input.existingGooglePlaceId;
    let matchedNewId: string | null = null;
    if (!googlePlaceId) {
      const matched = await matchGooglePlaceId(input, lat, lng);
      if (matched.kind === "failed") return { status: "error" };
      if (matched.kind === "empty") return { status: "no_match" };
      googlePlaceId = matched.value;
      matchedNewId = matched.value;
    }

    let metaOutcome = await fetchPlacePhotoMeta(googlePlaceId);
    if (metaOutcome.kind !== "ok" && input.existingGooglePlaceId && !matchedNewId) {
      // 캐시해둔 place id가 만료·삭제됐을 수 있다 — 한 번만 재매칭.
      const rematched = await matchGooglePlaceId(input, lat, lng);
      if (rematched.kind === "ok") {
        googlePlaceId = rematched.value;
        matchedNewId = rematched.value;
        metaOutcome = await fetchPlacePhotoMeta(googlePlaceId);
      }
    }
    if (metaOutcome.kind === "failed") return { status: "error" };
    if (metaOutcome.kind === "empty") return { status: "no_match" };

    const dataUrl = await fetchPhotoDataUrl(metaOutcome.value.photoName);
    if (!dataUrl) return { status: "error" };

    return {
      status: "ok",
      dataUrl,
      attribution: metaOutcome.value.attribution,
      googleMapsUri: metaOutcome.value.googleMapsUri,
      matchedGooglePlaceId: matchedNewId ?? undefined,
    };
  } catch (err) {
    // 장소명·주소·좌표·Google place id·사진 URL은 로그에 남기지 않는다(§6 원칙).
    console.error("[googlePlacePhoto] 조회 실패:", err instanceof Error ? err.message : "unknown");
    return { status: "error" };
  }
}
