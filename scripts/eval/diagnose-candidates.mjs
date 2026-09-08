// CLAUDE_AI_RECOMMENDATION_UPGRADE_HANDOFF.md 3단계 0단계: 후보 풀이 어느 단계에서
// 좁아지는지 실제 Kakao API 응답으로 추적한다. src/lib/kakaoLocal.ts,
// src/lib/recommendationPolicy.ts를 그대로 가져와 쓴다 — 로직을 다시 베끼지 않는다.
// 실행: node --env-file=.env.local --import ./scripts/register-ts-extension-hook.mjs scripts/eval/diagnose-candidates.mjs
import { searchKakaoPlaces, collectCandidates, withDistance, excludeNearSelf } from "../../src/lib/kakaoLocal.ts";
import { searchQueries, contextualQueries, contextPolicy, diverseCandidates } from "../../src/lib/recommendationPolicy.ts";

const apiKey = process.env.KAKAO_REST_API_KEY;
if (!apiKey) {
  console.error("KAKAO_REST_API_KEY 필요");
  process.exit(1);
}

// 실제 place: 쿄오모라멘 (place.category='맛집', 실제 좌표는 Kakao 검색으로 직접 확인함)
const origin = { lat: 37.552741300481316, lng: 127.01027916449614 };
const category = "맛집";
const address = "서울 중구 다산로8길 16";
const RADIUS = 20000; // route.ts가 place_detail에 실제로 쓰는 값(§2 표 그대로 확인)

function printList(label, list) {
  console.log(`\n-- ${label} (${list.length}건) --`);
  for (const c of list) console.log(`  ${String(c.distanceMeters).padStart(6)}m  ${c.name}  [${c.category}]`);
}

async function main() {
  // 1) route.ts(place_detail)가 실제로 만드는 검색어
  const baseQueries = searchQueries("place_detail", category, [], []);
  const queries = contextualQueries(baseQueries, undefined);
  console.log("현재 place_detail 검색어:", JSON.stringify(queries));

  const policy = contextPolicy(false, undefined);
  console.log("정책(place_detail):", JSON.stringify(policy));

  // 2) 검색어 × 정렬 조합별 원본 응답(merge 전) — 출처 보존
  const sorts = ["accuracy", "distance"];
  const perCombo = new Map();
  for (const q of queries) {
    for (const sort of sorts) {
      const list = await searchKakaoPlaces({ apiKey, query: q, lat: origin.lat, lng: origin.lng, radiusMeters: RADIUS, limit: 15, sort, maxPages: 1 });
      const withD = withDistance(list, origin);
      perCombo.set(`${q}::${sort}`, withD);
      printList(`쿼리="${q}" 정렬=${sort}`, withD);
    }
  }

  // 3) collectCandidates 병합(라운드로빈) 결과 — 실제 route.ts 순서 그대로
  const taggedQueries = queries.map((q) => ({ query: q, kind: "base" }));
  const { candidates: raw } = await collectCandidates({ apiKey, queries: taggedQueries, lat: origin.lat, lng: origin.lng, radiusMeters: RADIUS, limitPerCall: 15 });
  const withD = withDistance(raw, origin);
  const nearFiltered = excludeNearSelf(withD, { address }, 50);
  printList("병합 + 자기/근접 제외 (트렁케이션 전, merge 순서 그대로)", nearFiltered);

  // 4) diverseCandidates로 limit=20 자르기 — 채택 vs 컷 거리 분포
  const limited = diverseCandidates(nearFiltered, 20, policy.distanceFirst);
  const includedIds = new Set(limited.map((c) => c.id));
  const cut = nearFiltered.filter((c) => !includedIds.has(c.id));
  printList("최종 채택(20개 상한 적용 후)", limited);
  printList("잘려나감(20개 밖)", cut);

  const dist = (l) => l.map((c) => c.distanceMeters).sort((a, b) => a - b);
  console.log("\n채택된 거리 분포:", dist(limited));
  console.log("잘려나간 거리 분포:", dist(cut));
  console.log("전체 원본(merge 후) 최대 거리:", Math.max(...withD.map((c) => c.distanceMeters), 0), "m");
  console.log("카테고리 분포(채택):", [...new Set(limited.map((c) => c.category))]);

  // 5) 참고용 probe — 더 구체적인/다른 결의 쿼리를 썼다면 원본 풀 자체가 얼마나
  // 달라지는지만 확인한다(구현 아님, 진단 참고용).
  console.log("\n=== 참고: 대안 쿼리 probe (구현 아님) ===");
  for (const altQ of ["일식", "라멘", "전시", "카페", "이색 데이트"]) {
    const list = await searchKakaoPlaces({ apiKey, query: altQ, lat: origin.lat, lng: origin.lng, radiusMeters: RADIUS, limit: 15, sort: "accuracy", maxPages: 1 });
    const withD2 = withDistance(list, origin);
    const ds = withD2.map((c) => c.distanceMeters);
    console.log(`쿼리="${altQ}" accuracy: ${withD2.length}건, 거리 범위 ${ds.length ? `${Math.min(...ds)}~${Math.max(...ds)}m` : "없음"}, 카테고리=${[...new Set(withD2.map((c) => c.category))].join(",")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
