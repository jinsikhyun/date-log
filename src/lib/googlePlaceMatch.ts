// GOOGLE_PLACES_PHOTO_FEATURE_HANDOFF.md §5 "장소 매칭" — 순수 함수만. DB·네트워크 없음.
//
// Kakao Place ID는 Google Place ID와 다른 식별자라 매칭에 쓰지 않는다. 대신 장소명·주소·
// 좌표로 Google Text Search 후보 1개를 받아온 뒤, 여기서 "충분히 같은 장소인지"만 판정한다.
// 판정에 실패하면 호출자는 사진을 표시하지 않는다(잘못된 장소 사진 추측 금지 원칙).

import { haversineKm } from "@/lib/courses";

/** 이 거리보다 멀면 다른 장소로 본다. 지오코딩 오차를 감안한 여유값(표본 없이 정한 초기값). */
export const MAX_MATCH_DISTANCE_KM = 0.3;

export interface OurPlace {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface GoogleCandidate {
  id: string;
  displayName: string;
  formattedAddress: string;
  lat: number;
  lng: number;
}

/** 공백·괄호·구두점을 지우고 소문자화 — "카멜커피 (서촌점)" vs "카멜커피서촌점" 같은 표기 차이 흡수. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s()·,./\-'"]/g, "");
}

/** 정규화 후 한쪽이 다른 쪽을 포함하면 같은 장소로 본다(지점명 축약 등 흡수). */
export function namesLikelyMatch(ourName: string, candidateName: string): boolean {
  const a = normalize(ourName);
  const b = normalize(candidateName);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/** 좌표 300m 이내 AND 이름 유사 — 둘 다 통과해야 매칭 확정. */
export function isConfidentMatch(ours: OurPlace, candidate: GoogleCandidate): boolean {
  const km = haversineKm(
    { lat: ours.lat, lng: ours.lng },
    { lat: candidate.lat, lng: candidate.lng },
  );
  if (!(km <= MAX_MATCH_DISTANCE_KM)) return false;
  return namesLikelyMatch(ours.name, candidate.displayName);
}
