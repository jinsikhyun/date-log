// §3단계 배분 정책(allocateBySourceKind) 전/후 비교 실측(2026-09-08).
// src/lib/kakaoLocal.ts collectCandidates()가 반환하는 sources Map(후보 id -> {query, kind,
// sort, rank})을 그대로 쓰고, src/lib/recommendationPolicy.ts의 diverseCandidates(기존)와
// allocateBySourceKind(신규, 구체 검색어 최소 슬롯 보장 + 나머지 균등)를 같은 풀에 적용해
// 결과를 나란히 비교한다. 로직 재구현 아님 — 실제 lib 함수를 그대로 import.
//
// 범위: 쿄오모라멘 snapshot만. 황재벌은 정답 후보(용가회전훠궈/일석삼조버섯매운탕/칠프로칠백식당)
// 자체가 "장어"/"맛집" 어느 쿼리 raw 상위에도 없어(§3단계 근본 한계, HANDOFF.md 참고) 배분
// 정책 검증 대상이 아니다 — 사용자 확인 완료.
//
// 카카오 인덱스가 시간대별로 바뀌므로 3회 반복한다(n=1 결론 금지 — 사용자 지시).
//
// 실행: node --env-file=.env.local --import ./scripts/register-ts-extension-hook.mjs scripts/eval/diagnose-candidate-sources.mjs
import { collectCandidates, withDistance, excludeNearSelf } from "../../src/lib/kakaoLocal.ts";
import { contextPolicy, diverseCandidates, allocateBySourceKind, MIN_SPECIFIC_SLOTS } from "../../src/lib/recommendationPolicy.ts";

const apiKey = process.env.KAKAO_REST_API_KEY;
if (!apiKey) {
  console.error("KAKAO_REST_API_KEY 필요");
  process.exit(1);
}

const RADIUS = 20000; // route.ts가 place_detail에 실제로 쓰는 값
const PAGE_SIZE = 15;
const RUNS = 3; // n=1 결론 금지 — 사용자 지시

const origin = {
  label: "쿄오모라멘",
  lat: 37.552741300481316,
  lng: 127.01027916449614,
  address: "서울 중구 다산로8길 16",
  baseCategory: "맛집",
  // 실제 서버 로그로 이미 확인된 값(HANDOFF.md 3단계 절) — 이번 실행에서 self-lookup 재실행 안 함.
  specificTerm: "일본식라면",
  expectedAnswers: ["129라멘하우스"],
};

function tally(list, sources) {
  const t = { specific: { count: 0, distances: [] }, base: { count: 0, distances: [] } };
  for (const c of list) {
    const kind = sources.get(c.id)?.kind ?? "base";
    t[kind].count++;
    t[kind].distances.push(c.distanceMeters);
  }
  return t;
}

const rate = (survived, pool) => (pool === 0 ? null : Math.round((survived / pool) * 1000) / 10);

function report(label, limited, poolTally, sources) {
  const survivedTally = tally(limited, sources);
  console.log(
    `  [${label}] 생존(${limited.length}건): specific=${survivedTally.specific.count}/${poolTally.specific.count}(${rate(survivedTally.specific.count, poolTally.specific.count)}%) base=${survivedTally.base.count}/${poolTally.base.count}(${rate(survivedTally.base.count, poolTally.base.count)}%)`,
  );
  console.log(`  [${label}] 카테고리 다양성: ${[...new Set(limited.map((c) => c.category))].join(",")}`);
  return survivedTally;
}

async function measureOnce(runIndex) {
  console.log(`\n[#${runIndex}] 검색어=["${origin.specificTerm}"(specific), "${origin.baseCategory}"(base)]`);

  const taggedQueries = [
    { query: origin.specificTerm, kind: "specific" },
    { query: origin.baseCategory, kind: "base" },
  ];

  const { candidates: raw, sources } = await collectCandidates({
    apiKey,
    queries: taggedQueries,
    lat: origin.lat,
    lng: origin.lng,
    radiusMeters: RADIUS,
    limitPerCall: PAGE_SIZE,
  });
  const withD = withDistance(raw, { lat: origin.lat, lng: origin.lng });
  const nearFiltered = excludeNearSelf(withD, { address: origin.address }, 50);
  const poolTally = tally(nearFiltered, sources);
  console.log(`  풀(${nearFiltered.length}건): specific=${poolTally.specific.count} base=${poolTally.base.count}`);

  const policy = contextPolicy(false, undefined);

  // BEFORE: 기존 diverseCandidates(카테고리로만 자름, specific/base 구분 없음)
  const before = diverseCandidates(nearFiltered, 20, policy.distanceFirst);
  const beforeTally = report("BEFORE(카테고리만)", before, poolTally, sources);

  // AFTER: allocateBySourceKind(구체 검색어 최소 MIN_SPECIFIC_SLOTS 보장 + 나머지 균등)
  const after = allocateBySourceKind(nearFiltered, (id) => sources.get(id)?.kind ?? "base", 20, policy.distanceFirst);
  const afterTally = report("AFTER(최소슬롯+나머지균등)", after, poolTally, sources);

  const beforeIds = new Set(before.map((c) => c.id));
  const afterIds = new Set(after.map((c) => c.id));
  const droppedByAfter = before.filter((c) => !afterIds.has(c.id));
  const addedByAfter = after.filter((c) => !beforeIds.has(c.id));
  if (droppedByAfter.length || addedByAfter.length) {
    console.log(
      `  차이: BEFORE에만 있던 ${droppedByAfter.length}건 빠짐(${droppedByAfter.map((c) => `${c.name}/${c.distanceMeters}m`).join(", ") || "-"}), AFTER에서 새로 들어온 ${addedByAfter.length}건(${addedByAfter.map((c) => `${c.name}/${c.distanceMeters}m`).join(", ") || "-"})`,
    );
  } else {
    console.log("  차이: 없음 (BEFORE == AFTER, 같은 20건)");
  }

  const ansName = origin.expectedAnswers[0];
  const inPool = nearFiltered.find((c) => c.name.includes(ansName));
  const survivedBefore = inPool ? beforeIds.has(inPool.id) : false;
  const survivedAfter = inPool ? afterIds.has(inPool.id) : false;
  console.log(
    `  정답지 "${ansName}": BEFORE=${survivedBefore ? "생존" : "컷"} / AFTER=${survivedAfter ? "생존" : "컷"}`,
  );

  return { poolTally, beforeTally, afterTally };
}

async function main() {
  console.log(`MIN_SPECIFIC_SLOTS=${MIN_SPECIFIC_SLOTS}`);
  console.log(`\n${"=".repeat(70)}\n${origin.label} — BEFORE/AFTER ${RUNS}회 반복\n${"=".repeat(70)}`);
  const results = [];
  for (let i = 1; i <= RUNS; i++) {
    results.push(await measureOnce(i));
  }

  console.log(`\n-- ${RUNS}회 집계 --`);
  const rates = (tallyKey, kind) =>
    results.map((r) => rate(r[tallyKey][kind].count, r.poolTally[kind].count)).join(", ");
  console.log(`  BEFORE specific 생존율(run별): ${rates("beforeTally", "specific")}%`);
  console.log(`  AFTER  specific 생존율(run별): ${rates("afterTally", "specific")}%`);
  console.log(`  BEFORE base 생존율(run별): ${rates("beforeTally", "base")}%`);
  console.log(`  AFTER  base 생존율(run별): ${rates("afterTally", "base")}%`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
