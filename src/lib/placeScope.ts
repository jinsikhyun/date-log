// 장소 집계 기준을 한 곳에 둔다.
//
// "코스 전용" 장소는 두 가지 표현으로 저장돼 있다(역사적 이유):
//   1) status = 'course_only'                — 현재 코스 미니폼이 저장하는 형태
//   2) status = 'wishlist' AND via_course = true — add-via-course-flag.sql 이전의 레거시 형태
// 사이드바·위시리스트는 (2)만, 기록 화면은 (1)만 걸러서 "가고 싶은 곳 4 vs 7"처럼
// 화면마다 숫자가 달라졌다. 모든 화면은 아래 함수만 거치도록 해서 기준을 하나로 맞춘다.
//
// 정의:
//   코스 전용   = status='course_only' OR via_course=true  → 위시/기록/통계/주변 추천 어디에도 안 나온다
//   가고 싶은 곳 = status='wishlist' AND 코스 전용 아님
//   다녀온 곳   = status='visited'  AND 코스 전용 아님

export type PlaceScopeRow = {
  status: string;
  via_course?: boolean | null;
};

/** 코스 안에서만 존재하는 장소인지 — 두 저장 형태를 모두 잡는다. */
export function isCourseOnlyPlace(p: PlaceScopeRow): boolean {
  return p.status === "course_only" || p.via_course === true;
}

export function isWishlistPlace(p: PlaceScopeRow): boolean {
  return p.status === "wishlist" && !isCourseOnlyPlace(p);
}

export function isVisitedPlace(p: PlaceScopeRow): boolean {
  return p.status === "visited" && !isCourseOnlyPlace(p);
}

/**
 * Supabase 쿼리 빌더에 같은 기준을 적용한다. PostgrestFilterBuilder 는 `this` 를
 * 반환하므로 들어온 타입 그대로 돌려준다.
 * 제네릭에 제약(`Q extends ...`)을 걸면 count/head 오버로드가 섞인 빌더 타입에서
 * TS2589(과도한 타입 인스턴스화)가 나서, 내부에서만 좁혀 쓴다.
 */
type ScopeQuery = {
  eq: (column: string, value: unknown) => ScopeQuery;
  neq: (column: string, value: unknown) => ScopeQuery;
};

/** 코스 전용 제외(다녀온 곳 + 가고 싶은 곳만) */
export function excludeCourseOnly<Q>(q: Q): Q {
  const b = q as unknown as ScopeQuery;
  return b.neq("status", "course_only").eq("via_course", false) as unknown as Q;
}

/** /wishlist 와 사이드바 "가고 싶은 곳" 카운트가 쓰는 기준 */
export function wishlistScope<Q>(q: Q): Q {
  const b = q as unknown as ScopeQuery;
  return b.eq("status", "wishlist").eq("via_course", false) as unknown as Q;
}

/** 홈과 사이드바 "다녀온 곳" 카운트가 쓰는 기준 */
export function visitedScope<Q>(q: Q): Q {
  const b = q as unknown as ScopeQuery;
  return b.eq("status", "visited").eq("via_course", false) as unknown as Q;
}

// ── 카운트 갱신 신호 ─────────────────────────────────────────
// 사이드바 카운트는 라우트 이동 때만 다시 세므로, 같은 화면에서 장소·추억을
// 추가/전환/삭제하면 숫자가 그대로였다. 데이터를 바꾼 곳이 아래 함수를 부르면
// Header 가 즉시 다시 센다.
export const PLACE_DATA_CHANGED_EVENT = "datelog:data-changed";

export function notifyDataChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PLACE_DATA_CHANGED_EVENT));
}
