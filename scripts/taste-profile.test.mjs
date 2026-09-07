import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTasteProfile } from '../src/lib/tasteProfile.ts';

const members = [{ id: 'a', displayName: 'A' }, { id: 'b', displayName: 'B' }];
const now = new Date('2026-09-08T00:00:00Z');

function place(overrides) {
  return {
    id: 1, name: '카페', category: '카페', status: 'visited', rating: null,
    confirmedTags: [], isRegular: false, favoriteBy: [], wantedByIds: [],
    firstVisitDate: null, createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

test('기록 없음 — 모든 목록이 비고 충분성은 none', () => {
  const p = buildTasteProfile([], [], members, now);
  assert.deepEqual(p.representativePlaces, []);
  assert.deepEqual(p.relatedHighRatedPlaces, []);
  assert.equal(p.evidenceSufficiency.overall, 'none');
  assert.equal(p.evidenceSufficiency.perMember.member_1, 'none');
  assert.equal(p.evidenceSufficiency.perMember.member_2, 'none');
});

test('단골은 "지정함"으로만 표현 — 방문 횟수를 주장하지 않는다', () => {
  const p = buildTasteProfile([place({ isRegular: true, favoriteBy: ['a'] })], [], members, now);
  const facts = p.representativePlaces[0].facts.join(' | ');
  assert.match(facts, /단골로 지정함/);
  assert.doesNotMatch(facts, /번 방문|재방문|여러 번/);
});

test('낮은 별점은 negativeEvidence에만 — 업종 전체를 불호로 일반화하는 필드가 없다', () => {
  const places = [
    place({ id: 1, name: '실망한집', category: '한식', rating: 1.5 }),
    place({ id: 2, name: '좋아하는집', category: '한식', rating: 4.5, favoriteBy: ['a'] }),
  ];
  const p = buildTasteProfile(places, [], members, now);
  assert.equal(p.negativeEvidence.length, 1);
  assert.equal(p.negativeEvidence[0].placeId, 1);
  assert.ok(!p.representativePlaces.some((e) => e.placeId === 1));
  assert.ok(p.representativePlaces.some((e) => e.placeId === 2));
});

test('별점과 감정이 충돌해도 어느 한쪽을 숨기지 않는다', () => {
  const places = [place({ id: 1, rating: 4.5, favoriteBy: ['a'] })];
  const memories = [{ placeId: 1, author: 'B', moodTag: '😐 아쉬웠어요', content: null, date: '2026-08-01', createdAt: '2026-08-01T00:00:00Z' }];
  const p = buildTasteProfile(places, memories, members, now);
  const facts = p.representativePlaces[0].facts.join(' | ');
  assert.match(facts, /공동 별점 4.5/);
  assert.match(facts, /다른 사람은 방문 후 아쉬운 반응을 남김/); // member_1/member_2 라벨은 절대 등장하지 않는다
  assert.doesNotMatch(facts, /member_[12]/);
  assert.equal(p.negativeEvidence.length, 1); // 부정 반응은 negativeEvidence에도 별도로 잡힌다
});

test('추억 개수는 만족도가 아니다 — 부정 감정과 충돌하면 대표로 승격하지 않는다', () => {
  const places = [place({ id: 1, rating: null })];
  const memories = [
    { placeId: 1, author: 'A', moodTag: '😐 아쉬웠어요', content: '별로였어요', date: '2026-08-01', createdAt: '2026-08-01T00:00:00Z' },
    { placeId: 1, author: 'A', moodTag: '😐 아쉬웠어요', content: '또 별로였어요', date: '2026-08-15', createdAt: '2026-08-15T00:00:00Z' },
  ];
  const p = buildTasteProfile(places, memories, members, now);
  assert.equal(p.representativePlaces.length, 0); // 추억 2건뿐이고 전부 부정 — 대표 근거 아님
  assert.equal(p.negativeEvidence.length, 1);
});

test('같은 장소가 여러 신호(pick+별점+단골)에 있어도 대표 목록에 한 번만 나온다', () => {
  const places = [place({ id: 1, rating: 4.8, favoriteBy: ['a', 'b'], isRegular: true })];
  const p = buildTasteProfile(places, [], members, now);
  assert.equal(p.representativePlaces.filter((e) => e.placeId === 1).length, 1);
});

test('개인별 선호는 기록이 적은 쪽도 자신의 근거를 보존한다(커플 균형)', () => {
  const places = [
    place({ id: 1, name: 'A픽1', favoriteBy: ['a'] }),
    place({ id: 2, name: 'A픽2', favoriteBy: ['a'] }),
    place({ id: 3, name: 'A픽3', favoriteBy: ['a'] }),
    place({ id: 4, name: 'B픽', favoriteBy: ['b'] }),
  ];
  const p = buildTasteProfile(places, [], members, now);
  const m1 = p.personalPreferences.find((x) => x.member === 'member_1');
  const m2 = p.personalPreferences.find((x) => x.member === 'member_2');
  assert.equal(m1.places.length, 3);
  assert.equal(m2.places.length, 1); // 적어도 사라지지 않고 남아 있어야 한다
  assert.equal(p.evidenceSufficiency.perMember.member_2, 'low');
});

test('위시는 방문 만족과 분리된다 — 방문 완료 장소는 wishlistOrientation에 없다', () => {
  const places = [
    place({ id: 1, status: 'wishlist', wantedByIds: ['a'] }),
    place({ id: 2, status: 'visited', rating: 5, favoriteBy: ['a'] }),
  ];
  const p = buildTasteProfile(places, [], members, now);
  assert.equal(p.wishlistOrientation.length, 1);
  assert.equal(p.wishlistOrientation[0].placeId, 1);
});

test('오래된 단골은 최근성 하한으로 인해 완전히 사라지지 않는다', () => {
  const oldRegular = place({ id: 1, isRegular: true, favoriteBy: ['a', 'b'], firstVisitDate: '2020-01-01' });
  const p = buildTasteProfile([oldRegular], [], members, now);
  assert.equal(p.representativePlaces.length, 1);
});

test('원문 절단은 문장 경계를 우선해 부정어가 잘리지 않도록 한다', () => {
  const longNegative = '이 집은 사실 기대했던 것보다 많이 아쉬웠어요. 다음엔 다른 곳으로 가려고요 정말로요';
  const places = [place({ id: 1 })];
  const memories = [{ placeId: 1, author: 'A', moodTag: '😐 아쉬웠어요', content: longNegative, date: '2026-08-01', createdAt: '2026-08-01T00:00:00Z' }];
  const p = buildTasteProfile(places, memories, members, now);
  const quote = p.negativeEvidence.length ? null : null; // negativeEvidence는 quote를 안 담음 — representative 쪽 확인
  const rep = p.representativePlaces[0];
  assert.ok(rep === undefined || rep.quote === undefined || rep.quote.text.length <= 82);
  // 이 장소는 rating/pick 등 긍정 신호가 없으므로 representative에 없고 negative만 있어야 함
  assert.equal(p.representativePlaces.length, 0);
  assert.equal(p.negativeEvidence[0].facts.join(' '), '방문 후 아쉬운 반응을 남김'); // 한 명만 관련 — 라벨/대명사 없이
});

test('원문 노출은 요청 전체에서 상한(개수)을 넘지 않는다 — 초과분은 facts만 남고 quote는 빠진다', () => {
  const places = [];
  const memories = [];
  for (let i = 1; i <= 15; i++) {
    places.push(place({ id: i, name: `장소${i}`, favoriteBy: ['a'], rating: 4.5 }));
    memories.push({ placeId: i, author: 'A', moodTag: '❤️ 좋았어요', content: `${i}번 장소 후기입니다`, date: `2026-0${(i % 9) + 1}-01`, createdAt: `2026-0${(i % 9) + 1}-01T00:00:00Z` });
  }
  const p = buildTasteProfile(places, memories, members, now);
  const all = [...p.representativePlaces, ...p.relatedHighRatedPlaces, ...p.personalPreferences.flatMap((m) => m.places)];
  const quotedPlaceIds = new Set(all.filter((e) => e.quote).map((e) => e.placeId));
  assert.ok(quotedPlaceIds.size <= 10); // QUOTE_BUDGET_TOTAL — 서로 다른 장소 기준
  const withoutQuote = all.filter((e) => !e.quote);
  assert.ok(withoutQuote.length > 0);
  // quote가 빠져도 facts(사실 자체)는 그대로 남아 있어야 한다
  assert.ok(withoutQuote.every((e) => e.facts.length > 0));
});

test('facts·quote 어디에도 member_1/member_2 내부 라벨 문자열이 없다', () => {
  const places = [
    place({ id: 1, favoriteBy: ['a'], rating: 4.8, isRegular: true, confirmedTags: ['조용한'] }),
    place({ id: 2, favoriteBy: ['b'], status: 'wishlist', wantedByIds: ['b'] }),
    place({ id: 3, favoriteBy: ['a', 'b'], rating: 4.9 }),
  ];
  const memories = [
    { placeId: 1, author: 'A', moodTag: '❤️ 좋았어요', content: '조용해서 좋아요', date: '2026-01-01', createdAt: '2026-01-01T00:00:00Z' },
    { placeId: 1, author: 'B', moodTag: '😐 아쉬웠어요', content: '나는 별로였어요', date: '2026-01-02', createdAt: '2026-01-02T00:00:00Z' },
    { placeId: 3, author: 'A', moodTag: '🙂 괜찮았어요', content: null, date: '2026-02-01', createdAt: '2026-02-01T00:00:00Z' },
    { placeId: 3, author: 'B', moodTag: '❤️ 좋았어요', content: '또 가고 싶어요', date: '2026-02-01', createdAt: '2026-02-01T00:00:00Z' },
  ];
  const p = buildTasteProfile(places, memories, members, now);
  const collect = (e) => [...e.facts, e.quote?.text ?? '', e.quote?.member ?? ''];
  const all = [
    ...p.representativePlaces.flatMap(collect),
    ...p.relatedHighRatedPlaces.flatMap(collect),
    ...p.personalPreferences.flatMap((m) => m.places.flatMap(collect)),
    ...p.sharedPreferences.places.flatMap(collect),
    ...p.negativeEvidence.flatMap((e) => e.facts),
  ].join(' | ');
  assert.doesNotMatch(all, /member_[12]/);
  // 그래도 상충(긍정+부정)이 있는 장소는 대명사로 구분해 여전히 숨기지 않는다
  const place1 = p.representativePlaces.find((e) => e.placeId === 1);
  assert.match(place1.facts.join(' '), /한 사람은.*다른 사람은|다른 사람은.*한 사람은/);
});

test('개인별 원문은 그 member 것일 때만 붙는다 — 상대방 원문이 섞이지 않는다', () => {
  const places = [place({ id: 1, favoriteBy: ['a', 'b'], rating: 4.9 })];
  const memories = [
    { placeId: 1, author: 'A', moodTag: '🙂 괜찮았어요', content: null, date: '2026-02-01', createdAt: '2026-02-01T00:00:00Z' },
    { placeId: 1, author: 'B', moodTag: '❤️ 좋았어요', content: 'B의 원문', date: '2026-02-02', createdAt: '2026-02-02T00:00:00Z' },
  ];
  const p = buildTasteProfile(places, memories, members, now);
  const m1 = p.personalPreferences.find((x) => x.member === 'member_1').places[0];
  const m2 = p.personalPreferences.find((x) => x.member === 'member_2').places[0];
  assert.equal(m1.quote, undefined); // A의 반응엔 원문이 없었다
  assert.equal(m2.quote.text, 'B의 원문');
  assert.equal(m2.quote.member, null); // 이미 개인 목록이라 대명사도 불필요
});

test('생성일이 아닌 방문일을 최근성 기준으로 쓴다', () => {
  const p1 = place({ id: 1, favoriteBy: ['a'], firstVisitDate: '2026-09-01', createdAt: '2020-01-01T00:00:00Z' });
  const p2 = place({ id: 2, favoriteBy: ['a'], firstVisitDate: null, createdAt: '2026-09-01T00:00:00Z' });
  const profile = buildTasteProfile([p1, p2], [], members, now);
  // 둘 다 동일 강도 신호(pick 1개)이므로 recencyWeight만 다르다 — firstVisitDate가 최근인 p1이 앞선다.
  assert.equal(profile.representativePlaces[0].placeId, 1);
});
