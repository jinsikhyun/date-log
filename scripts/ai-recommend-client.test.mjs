import test from "node:test";
import assert from "node:assert/strict";
import {
  AiRecommendError,
  describeAiError,
  kakaoCategoryDetail,
  AI_TIMEOUT_MS,
} from "../src/lib/aiRecommendClient.ts";

test("kakaoCategoryDetail: 대분류를 빼고 우리 카테고리와 같은 조각은 숨긴다", () => {
  assert.equal(kakaoCategoryDetail("음식점 > 일식 > 일본식라면", "일식"), "일본식라면");
  assert.equal(kakaoCategoryDetail("음식점 > 카페 > 프랜차이즈 > 공차", "카페"), "프랜차이즈 · 공차");
  assert.equal(kakaoCategoryDetail("음식점 > 한식 > 육류,고기 > 곱창,막창 > 곱창", "한식"), "곱창,막창 · 곱창");
});

test("kakaoCategoryDetail: 위시 후보(우리 카테고리 그대로)·빈 값은 null", () => {
  assert.equal(kakaoCategoryDetail("맛집", "맛집"), null);
  assert.equal(kakaoCategoryDetail("음식점 > 일식", "일식"), null);
  assert.equal(kakaoCategoryDetail(null, "카페"), null);
  assert.equal(kakaoCategoryDetail(undefined, "카페"), null);
  assert.equal(kakaoCategoryDetail("", "카페"), null);
});

test("describeAiError: 단계별 타임아웃 문구가 다르고 재시도 가능", () => {
  const a = describeAiError(new AiRecommendError("timeout", "candidates", "timeout"));
  const b = describeAiError(new AiRecommendError("timeout", "ranking", "timeout"));
  assert.notEqual(a.title, b.title);
  assert.match(a.title, /주변 장소/);
  assert.match(b.title, /추천을 고르는/);
  assert.equal(a.retryable, true);
  assert.equal(b.retryable, true);
});

test("describeAiError: 5xx 는 서버 원문을 노출하지 않는다", () => {
  const v = describeAiError(
    new AiRecommendError("server", "ranking", "TypeError: fetch failed at OpenAI…", 502),
  );
  assert.doesNotMatch(v.title, /TypeError|OpenAI/);
  assert.equal(v.retryable, true);
});

test("describeAiError: 4xx 사용자용 서버 문구는 살리고, 권한 오류는 재시도 불가", () => {
  const rl = describeAiError(new AiRecommendError("rate_limit", "ranking", "1분 뒤에 다시", 429));
  assert.equal(rl.hint, "1분 뒤에 다시");
  assert.equal(rl.retryable, true);
  const auth = describeAiError(new AiRecommendError("auth", "candidates", "로그인이 필요해요.", 401));
  assert.equal(auth.title, "로그인이 필요해요.");
  assert.equal(auth.retryable, false);
});

test("describeAiError: 알 수 없는 오류는 일반 문구 + 재시도", () => {
  const v = describeAiError({});
  assert.equal(v.title, "추천을 가져오지 못했어요.");
  assert.equal(v.retryable, true);
});

test("타임아웃 값은 리뷰 권고(20~30초) 안쪽", () => {
  assert.ok(AI_TIMEOUT_MS.candidates + AI_TIMEOUT_MS.ranking <= 40_000);
  assert.ok(AI_TIMEOUT_MS.ranking >= 20_000 && AI_TIMEOUT_MS.ranking <= 30_000);
});
