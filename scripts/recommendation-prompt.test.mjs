import test from 'node:test';
import assert from 'node:assert/strict';
import { stripInternalMemberLabels } from '../src/lib/recommendationPrompt.ts';

test('2026-09-08 회귀 확인에서 실제로 관측된 유출 문장을 정리한다', () => {
  const cases = [
    ['공동 별점 4.9점과 member_2 pick 기록도 있어요.', '공동 별점 4.9점과 pick 기록도 있어요.'],
    ['루프탑 칵테일바를 member_2 pick으로 남겼고', '루프탑 칵테일바를 pick으로 남겼고'],
    ['member_1은 조용한 북카페를 pick했고', '조용한 북카페를 pick했고'],
    ['member_1이 pick한 조용한 북카페의 분위기와도', 'pick한 조용한 북카페의 분위기와도'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(stripInternalMemberLabels(input), expected);
  }
});

test('member_1/member_2 라벨이 전혀 없는 정상 문장은 그대로 둔다', () => {
  const text = '조용한 북카페에서 좋았다는 반응을 남겼어요.';
  assert.equal(stripInternalMemberLabels(text), text);
});
