import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_MATCH_DISTANCE_KM,
  namesLikelyMatch,
  isConfidentMatch,
} from "../src/lib/googlePlaceMatch.ts";

const BASE = { lat: 37.5665, lng: 126.978 }; // 서울시청 부근
const KM_PER_DEG_LAT = 111.32;

function offsetLat(km) {
  return BASE.lat + km / KM_PER_DEG_LAT;
}

const ours = (over = {}) => ({
  name: "카멜커피 서촌점",
  address: "서울 종로구 자하문로 10",
  lat: BASE.lat,
  lng: BASE.lng,
  ...over,
});

const candidate = (over = {}) => ({
  id: "ChIJ_test",
  displayName: "카멜커피 서촌점",
  formattedAddress: "대한민국 서울특별시 종로구 자하문로 10",
  lat: BASE.lat,
  lng: BASE.lng,
  ...over,
});

test("MAX_MATCH_DISTANCE_KM은 300m", () => {
  assert.equal(MAX_MATCH_DISTANCE_KM, 0.3);
});

test("이름 유사 판정: 정확히 같음 / 한쪽이 다른 쪽을 포함(지점명 축약) / 전혀 다름 / 빈 문자열", () => {
  assert.equal(namesLikelyMatch("카멜커피 서촌점", "카멜커피 서촌점"), true);
  assert.equal(namesLikelyMatch("카멜커피 서촌점", "카멜커피"), true); // 후보 쪽이 축약
  assert.equal(namesLikelyMatch("카멜커피", "카멜커피 서촌점"), true); // 우리 쪽이 축약
  assert.equal(namesLikelyMatch("카멜커피 서촌점", "스타벅스 광화문점"), false);
  assert.equal(namesLikelyMatch("", "카멜커피"), false);
  assert.equal(namesLikelyMatch("카멜커피", ""), false);
});

test("이름 유사 판정: 공백/괄호/구두점 표기 차이는 무시한다", () => {
  assert.equal(namesLikelyMatch("카멜커피(서촌점)", "카멜커피 서촌점"), true);
  assert.equal(namesLikelyMatch("Camel Coffee - Seochon", "camel coffee seochon"), true);
});

test("매칭 성공: 좌표 근접 + 이름 일치", () => {
  assert.equal(isConfidentMatch(ours(), candidate()), true);
});

test("매칭 실패: 좌표는 같은데 이름이 다른 장소(같은 건물 다른 가게 등)", () => {
  assert.equal(
    isConfidentMatch(ours(), candidate({ displayName: "이디야커피 서촌점" })),
    false,
  );
});

test("매칭 실패: 이름은 같은데 좌표가 너무 멀다(다른 지점)", () => {
  const far = candidate({ lat: offsetLat(2) }); // 2km 떨어진 동명의 다른 지점
  assert.equal(isConfidentMatch(ours(), far), false);
});

test("경계값: 300m 이내는 통과, 300m를 넘으면 실패", () => {
  const within = candidate({ lat: offsetLat(0.25) });
  const beyond = candidate({ lat: offsetLat(0.35) });
  assert.equal(isConfidentMatch(ours(), within), true);
  assert.equal(isConfidentMatch(ours(), beyond), false);
});
