// Supabase `courses` / `course_places` 테이블과 코스용 계산 헬퍼.

export interface Course {
  id: number;
  title: string;
  concept: string | null;
  created_at: string;
}

// 코스 안의 한 정거장(순서 + 장소 요약). 목록/상세에서 필요한 필드만.
export interface CourseStop {
  order_index: number;
  places: {
    id: number;
    name: string;
    category: string;
    address: string;
    image_url: string | null;
    lat: number | null;
    lng: number | null;
    status: string;
  } | null;
}

export interface CourseWithStops extends Course {
  course_places: CourseStop[];
}

/** order_index 오름차순으로 정렬한 정거장 배열 (장소가 삭제돼 null 인 건 제외) */
export function sortedStops(course: CourseWithStops): CourseStop[] {
  return [...(course.course_places ?? [])]
    .filter((s) => s.places != null)
    .sort((a, b) => a.order_index - b.order_index);
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** 두 좌표 사이 직선거리(km). 하버사인. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371; // 지구 반지름 km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** 직선거리(km) → 도보 예상 시간(분). 시속 4km 기준, 반올림. */
export function walkMinutes(km: number): number {
  return Math.max(1, Math.round((km / 4) * 60));
}

/** 좌표가 있는 연속 정거장들 사이 직선거리 합(km). 좌표 없는 구간은 건너뜀. */
export function courseDistanceKm(stops: CourseStop[]): number {
  let total = 0;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1].places;
    const b = stops[i].places;
    if (a?.lat != null && a.lng != null && b?.lat != null && b.lng != null) {
      total += haversineKm(
        { lat: a.lat, lng: a.lng },
        { lat: b.lat, lng: b.lng },
      );
    }
  }
  return total;
}
