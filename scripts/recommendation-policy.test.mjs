import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalCourse, searchQueries, diverseCandidates, contextPolicy, contextualQueries } from '../src/lib/recommendationPolicy.ts';

test('이동 명시 조건은 자동 지역 판단보다 우선한다', () => {
  assert.deepEqual(contextPolicy(true, {travel:'조금 멀어도'}), {distanceFirst:false,radiusMeters:20000});
  assert.deepEqual(contextPolicy(false, {travel:'가까이'}), {distanceFirst:true,radiusMeters:2000});
  assert.equal(contextPolicy(true).distanceFirst, true);
});
test('선택 업종으로 검색하고 분위기 없는 기본 검색도 유지한다', () => {
  assert.deepEqual(contextualQueries(['공원','전시'], {category:'카페',mood:'조용한'}), ['카페 조용한','카페']);
  assert.deepEqual(contextualQueries(['공원']), ['공원']);
});

test('한 장소 또는 좌표 누락은 거리 우선이 아니다', () => {
  assert.equal(isLocalCourse([{ category: '카페', lat: 37.5, lng: 127 }]), false);
  assert.equal(isLocalCourse([{ category: '카페' }, { category: '맛집' }]), false);
});
test('가까운 두 장소만 지역 확정으로 판단한다', () => {
  const a = { category: '카페', lat: 37.5, lng: 127 };
  assert.equal(isLocalCourse([a, { ...a, lat: 37.505 }]), true);
  assert.equal(isLocalCourse([a, { ...a, lat: 37.6 }]), false);
});
test('식사와 카페가 있으면 경험 후보를 검색한다', () => {
  assert.deepEqual(searchQueries('course', '카페', [], [{ category: '맛집' }, { category: '카페' }]), ['전시', '서점', '공원']);
});
test('장소 추천은 기존 업종을 기준으로 검색한다', () => {
  assert.deepEqual(searchQueries('place_detail', '카페', ['조용한'], []), ['카페', '카페 조용한']);
});
test('취향 모드는 먼 후보를 거리만으로 탈락시키지 않는다', () => {
  const items = [{category:'카페',distanceMeters:9000}, {category:'카페',distanceMeters:100}, {category:'전시',distanceMeters:3000}];
  assert.deepEqual(diverseCandidates(items, 2, false), [items[0], items[2]]);
  assert.deepEqual(diverseCandidates(items, 2, true), [items[1], items[2]]);
});
