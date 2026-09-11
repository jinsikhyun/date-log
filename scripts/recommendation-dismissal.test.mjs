import test from "node:test";
import assert from "node:assert/strict";
import {
  DISMISS_DURATION_DAYS,
  TOO_FAR_ORIGIN_RADIUS_KM,
  dismissalExpiresAt,
  isDismissReason,
  isDismissalActive,
  filterDismissed,
} from "../src/lib/recommendationDismissal.ts";

const NOW = new Date("2026-09-11T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const SEOUL = { originLat: 37.5665, originLng: 126.978 };
const SUWON = { originLat: 37.2636, originLng: 127.0286 }; // 서울시청에서 약 34km

const rec = (over = {}) => ({
  candidateId: "k1",
  reason: null,
  originLat: SEOUL.originLat,
  originLng: SEOUL.originLng,
  expiresAt: new Date(NOW.getTime() + 10 * DAY),
  ...over,
});

test("사유별 만료일: 취향 아님 180 / 이미 알아요 90 / 없음 90 / 너무 멀어요 30", () => {
  assert.equal(DISMISS_DURATION_DAYS.not_my_taste, 180);
  assert.equal(DISMISS_DURATION_DAYS.already_know, 90);
  assert.equal(DISMISS_DURATION_DAYS.none, 90);
  assert.equal(DISMISS_DURATION_DAYS.too_far, 30);
  assert.equal(dismissalExpiresAt("not_my_taste", NOW).getTime(), NOW.getTime() + 180 * DAY);
  assert.equal(dismissalExpiresAt(null, NOW).getTime(), NOW.getTime() + 90 * DAY);
  assert.equal(dismissalExpiresAt("too_far", NOW).getTime(), NOW.getTime() + 30 * DAY);
});

test("사유 값 검증: 정의된 3개만 통과", () => {
  assert.equal(isDismissReason("too_far"), true);
  assert.equal(isDismissReason("already_know"), true);
  assert.equal(isDismissReason("hate"), false);
  assert.equal(isDismissReason(null), false);
});

test("만료 전에는 숨기고, 만료 시각 이후에는 다시 노출한다", () => {
  assert.equal(isDismissalActive(rec(), { now: NOW, ...SEOUL }), true);
  assert.equal(
    isDismissalActive(rec({ expiresAt: new Date(NOW.getTime() - 1) }), { now: NOW, ...SEOUL }),
    false,
  );
  // 문자열(ISO) 만료 시각도 그대로 받는다(DB 응답 형식).
  assert.equal(
    isDismissalActive(rec({ expiresAt: new Date(NOW.getTime() + DAY).toISOString() }), { now: NOW, ...SEOUL }),
    true,
  );
});

test("너무 멀어요: 거절 당시 출발지 근처에서만 숨긴다 — 영구 불호가 아니다", () => {
  const tooFar = rec({ reason: "too_far" });
  assert.equal(isDismissalActive(tooFar, { now: NOW, ...SEOUL }), true);
  // 출발지가 반경 밖(수원)이면 같은 후보가 다시 나올 수 있다.
  assert.equal(isDismissalActive(tooFar, { now: NOW, ...SUWON }), false);
  // 반경 경계(1km) 바로 안쪽: 위도 0.008° ≈ 0.89km
  assert.equal(
    isDismissalActive(tooFar, { now: NOW, originLat: SEOUL.originLat + 0.008, originLng: SEOUL.originLng }),
    true,
  );
  // 바로 바깥쪽: 위도 0.01° ≈ 1.11km
  assert.equal(
    isDismissalActive(tooFar, { now: NOW, originLat: SEOUL.originLat + 0.01, originLng: SEOUL.originLng }),
    false,
  );
  assert.equal(TOO_FAR_ORIGIN_RADIUS_KM, 1);
});

test("너무 멀어요인데 출발지 기록이 없으면 숨기지 않는다(보수적)", () => {
  const noOrigin = rec({ reason: "too_far", originLat: null, originLng: null });
  assert.equal(isDismissalActive(noOrigin, { now: NOW, ...SEOUL }), false);
});

test("다른 사유(취향 아님/이미 알아요)는 출발지와 무관하게 숨긴다", () => {
  assert.equal(isDismissalActive(rec({ reason: "not_my_taste" }), { now: NOW, ...SUWON }), true);
  assert.equal(isDismissalActive(rec({ reason: "already_know" }), { now: NOW, ...SUWON }), true);
});

test("filterDismissed: 활성 거절만 제외하고 나머지 순서를 보존한다", () => {
  const cands = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "wish-7" }];
  const dismissals = [
    rec({ candidateId: "b" }),
    rec({ candidateId: "c", expiresAt: new Date(NOW.getTime() - DAY) }), // 만료됨
    rec({ candidateId: "wish-7", reason: "too_far" }), // 출발지 근처 → 숨김
  ];
  const { kept, hiddenCount } = filterDismissed(cands, dismissals, { now: NOW, ...SEOUL });
  assert.deepEqual(kept.map((c) => c.id), ["a", "c"]);
  assert.equal(hiddenCount, 2);
  // 거절 기록이 없으면 같은 배열을 그대로 돌려준다.
  const none = filterDismissed(cands, [], { now: NOW, ...SEOUL });
  assert.equal(none.kept, cands);
  assert.equal(none.hiddenCount, 0);
});
