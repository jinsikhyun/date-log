import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendationFeedback } from '../src/lib/recommendationFeedback.ts';
const places = [{id:1,name:'카페',category:'카페',status:'visited',rating:4.5}];
const members = [{id:'a',display_name:'A'},{id:'b',display_name:'B'}];
test('감정은 개인별, 별점은 공동 기록으로 전달',()=>{
  const r=recommendationFeedback(places,[{place_id:1,author:'A',mood_tag:'❤️ 좋았어요'},{place_id:1,author:'B',mood_tag:'😐 아쉬웠어요'}],members);
  assert.equal(r.ratings[0].scope,'shared_place_record');
  assert.deepEqual(r.emotions.map(e=>[e.member,e.reaction]),[['member_1','positive'],['member_2','negative']]);
  assert.ok(!JSON.stringify(r).includes('display_name'));
});
test('자유 감정, 불명확한 작성자, 미방문은 제외',()=>{
  assert.equal(recommendationFeedback(places,[{place_id:1,author:'A',mood_tag:'생일'},{place_id:1,author:'unknown',mood_tag:'좋았어요'}],members).emotions.length,0);
  assert.equal(recommendationFeedback([{...places[0],status:'wishlist'}],[],members).ratings.length,0);
  assert.equal(recommendationFeedback(places,[{place_id:1,author:'A',mood_tag:'좋았어요'}],[members[0],{id:'b',display_name:'A'}]).emotions.length,0);
});
test('최신 반응만 사용하고 미평가를 0점으로 바꾸지 않는다',()=>{
  const r=recommendationFeedback([{...places[0],rating:null}],[{place_id:1,author:'A',mood_tag:'아쉬웠어요'},{place_id:1,author:'A',mood_tag:'좋았어요'}],members);
  assert.equal(r.ratings.length,0); assert.equal(r.emotions.length,1); assert.equal(r.emotions[0].reaction,'negative');
});
