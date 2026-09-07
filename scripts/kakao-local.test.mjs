import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveSpecificSearchTerm } from '../src/lib/kakaoLocal.ts';

test('3단 category_name은 말단(구체 업종)을 쓴다 — 실측: 쿄오모라멘', () => {
  assert.equal(deriveSpecificSearchTerm('음식점 > 일식 > 일본식라면'), '일본식라면');
});

test('2단은 그대로 쓴다 — 실측: 일월의제면소·하이디라오', () => {
  assert.equal(deriveSpecificSearchTerm('음식점 > 일식'), '일식');
  assert.equal(deriveSpecificSearchTerm('음식점 > 샤브샤브'), '샤브샤브');
});

test('프랜차이즈/브랜드명 세그먼트는 건너뛰고 그 앞 단계를 쓴다', () => {
  assert.equal(deriveSpecificSearchTerm('음식점 > 카페 > 프랜차이즈 > 공차'), '카페');
  assert.equal(deriveSpecificSearchTerm('음식점 > 편의점 > 브랜드 > CU'), '편의점');
});

test('말단이 "기타"류면 의미가 없으므로 그 앞 단계로 물러난다', () => {
  assert.equal(deriveSpecificSearchTerm('음식점 > 한식 > 기타'), '한식');
});

test('브랜드 세그먼트가 맨 앞(두 번째)에 오면 쓸 게 없어 null', () => {
  assert.equal(deriveSpecificSearchTerm('음식점 > 프랜차이즈 > 맘스터치'), null);
});

test('최상위 대분류 하나뿐이면 새 검색어를 만들 수 없다(억지로 만들지 않는다)', () => {
  assert.equal(deriveSpecificSearchTerm('음식점'), null);
});

test('빈 문자열·공백만 있는 문자열은 null', () => {
  assert.equal(deriveSpecificSearchTerm(''), null);
  assert.equal(deriveSpecificSearchTerm('   '), null);
});

test('앞뒤 공백은 트리밍된다', () => {
  assert.equal(deriveSpecificSearchTerm('  음식점 >  일식 > 일본식라면  '), '일본식라면');
});
