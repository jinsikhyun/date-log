// 0단계 비교 기준선: CLAUDE_AI_RECOMMENDATION_UPGRADE_HANDOFF.md §0이 요구하는 8가지 경우.
// 가상 데이터다 — 실제 커플/장소가 아니다. 좌표는 실제 서울 동네 위치를 참고해 그럴듯하게 만들었을 뿐,
// 실존 상호명과 일치하는 이름은 의도적으로 피했다.

export type FixtureMember = { id: string; display_name: string };
export type FixtureTasteRow = {
  id: number;
  name: string;
  category: string;
  status: "visited" | "wishlist" | "course_only";
  rating: number | null;
  confirmed_tags: string[];
  wanted_by_ids: string[];
  place_preferences: { user_id: string; kind: "pick" }[];
  is_regular: boolean;
  first_visit_date: string | null;
  created_at: string;
};
export type FixtureMemory = {
  place_id: number;
  author: string | null;
  mood_tag: string | null;
  content: string | null;
  date: string | null;
  created_at: string;
};
export type FixtureCandidate = {
  id: string;
  name: string;
  category: string;
  categoryName?: string;
  address: string;
  lat: number;
  lng: number;
};
export type Fixture = {
  key: string;
  title: string;
  probe: string; // 이 케이스가 검증하려는 것
  members: FixtureMember[];
  tasteRows: FixtureTasteRow[];
  memories: FixtureMemory[];
  place: {
    name: string;
    category: string;
    address: string;
    description: string | null;
    tags: string[];
    lat: number;
    lng: number;
  };
  candidates: FixtureCandidate[];
};

const MEMBERS: FixtureMember[] = [
  { id: "m1", display_name: "민준" },
  { id: "m2", display_name: "서연" },
];

const NOW = new Date("2026-09-08T09:00:00+09:00");

// ── 좌표(서울, 대략) ─────────────────────────────────────────
const GANGNAM = { lat: 37.4979, lng: 127.0276 };
const HONGDAE = { lat: 37.5563, lng: 126.9236 }; // 강남에서 직선 약 14~15km
const SEONGSU = { lat: 37.5445, lng: 127.0559 };
const ITAEWON = { lat: 37.5344, lng: 126.9944 };
const YEONNAM = { lat: 37.5622, lng: 126.9256 };

function near(base: { lat: number; lng: number }, dLatM: number, dLngM: number) {
  return { lat: base.lat + dLatM / 111_200, lng: base.lng + dLngM / (111_200 * Math.cos((base.lat * Math.PI) / 180)) };
}

// ── 케이스 1: 기록 없음 ──────────────────────────────────────
const case1: Fixture = {
  key: "no_history",
  title: "기록 없음",
  probe: "히스토리가 전혀 없을 때 근거 없이 취향을 지어내지 않는지",
  members: MEMBERS,
  tasteRows: [],
  memories: [],
  place: {
    name: "성수 브런치 카페",
    category: "카페",
    address: "서울 성동구 성수동2가",
    description: "평일 낮에 조용히 브런치 먹기 좋은 곳",
    tags: [],
    ...SEONGSU,
  },
  candidates: [
    { id: "c1", name: "성수 로스터리", category: "카페", address: "서울 성동구 성수동1가", ...near(SEONGSU, 300, 200) },
    { id: "c2", name: "서울숲 베이커리카페", category: "카페", address: "서울 성동구 성수동1가", ...near(SEONGSU, 500, -300) },
    { id: "c3", name: "성수 전시공간", category: "전시,미술관", address: "서울 성동구 성수동2가", ...near(SEONGSU, 700, 400) },
    { id: "c4", name: "골목 파스타집", category: "양식", address: "서울 성동구 성수동2가", ...near(SEONGSU, 200, -500) },
    { id: "c5", name: "성수 포차", category: "술집,포차", address: "서울 성동구 성수동1가", ...near(SEONGSU, 900, 900) },
  ],
};

// ── 케이스 2: 한 사람만 기록 있음 ────────────────────────────
const case2: Fixture = {
  key: "one_sided_history",
  title: "한 사람만 기록 있음",
  probe: "기록 없는 쪽 취향을 지어내거나, 있는 쪽 취향으로만 단정하지 않는지",
  members: MEMBERS,
  tasteRows: [
    { id: 11, name: "조용한 북카페", category: "카페", status: "visited", rating: 4.8, confirmed_tags: ["조용한", "오래 머물기 좋은"], wanted_by_ids: [], place_preferences: [{ user_id: "m1", kind: "pick" }], is_regular: true, first_visit_date: "2026-03-02", created_at: "2026-03-02T10:00:00Z" },
    { id: 12, name: "스터디 카페", category: "카페", status: "visited", rating: 4.5, confirmed_tags: ["조용한"], wanted_by_ids: [], place_preferences: [{ user_id: "m1", kind: "pick" }], is_regular: false, first_visit_date: "2026-05-10", created_at: "2026-05-10T10:00:00Z" },
    { id: 13, name: "한적한 전시관", category: "전시,미술관", status: "visited", rating: 4.6, confirmed_tags: ["조용한", "전시형 공간"], wanted_by_ids: [], place_preferences: [{ user_id: "m1", kind: "pick" }], is_regular: false, first_visit_date: "2026-06-20", created_at: "2026-06-20T10:00:00Z" },
  ],
  memories: [
    { place_id: 11, author: "민준", mood_tag: "❤️ 좋았어요", content: "혼자 책 읽기 딱 좋았어요. 조용해서 자주 옴", date: "2026-03-02", created_at: "2026-03-02T12:00:00Z" },
    { place_id: 13, author: "민준", mood_tag: "❤️ 좋았어요", content: "사람이 없어서 여유롭게 봤어요", date: "2026-06-20", created_at: "2026-06-20T12:00:00Z" },
  ],
  place: {
    name: "이태원 소품샵 카페",
    category: "카페",
    address: "서울 용산구 이태원동",
    description: "조용히 대화하기 좋은 소규모 카페",
    tags: [],
    ...ITAEWON,
  },
  candidates: [
    { id: "c1", name: "이태원 조용한 카페", category: "카페", address: "서울 용산구 이태원동", ...near(ITAEWON, 200, 200) },
    { id: "c2", name: "이태원 루프탑 바", category: "술집,바", address: "서울 용산구 이태원동", ...near(ITAEWON, 300, -200) },
    { id: "c3", name: "이태원 소극장 전시", category: "전시,미술관", address: "서울 용산구 이태원동", ...near(ITAEWON, 500, 300) },
    { id: "c4", name: "이태원 클럽라운지", category: "술집,클럽", address: "서울 용산구 이태원동", ...near(ITAEWON, 400, 400) },
  ],
};

// ── 케이스 3: 취향 충돌 ──────────────────────────────────────
const case3: Fixture = {
  key: "preference_conflict",
  title: "취향 충돌",
  probe: "두 사람 취향이 갈릴 때 허구의 공통 취향을 만들지 않고 양쪽을 있는 그대로 보여주는지",
  members: MEMBERS,
  tasteRows: [
    { id: 21, name: "조용한 북카페", category: "카페", status: "visited", rating: 4.7, confirmed_tags: ["조용한"], wanted_by_ids: [], place_preferences: [{ user_id: "m1", kind: "pick" }], is_regular: false, first_visit_date: "2026-04-01", created_at: "2026-04-01T10:00:00Z" },
    { id: 22, name: "명상 다도 공간", category: "카페", status: "visited", rating: 4.6, confirmed_tags: ["조용한", "아늑한"], wanted_by_ids: [], place_preferences: [{ user_id: "m1", kind: "pick" }], is_regular: false, first_visit_date: "2026-05-15", created_at: "2026-05-15T10:00:00Z" },
    { id: 23, name: "라이브 포차", category: "술집,포차", status: "visited", rating: 4.9, confirmed_tags: ["활기찬"], wanted_by_ids: [], place_preferences: [{ user_id: "m2", kind: "pick" }], is_regular: true, first_visit_date: "2026-02-10", created_at: "2026-02-10T10:00:00Z" },
    { id: 24, name: "루프탑 칵테일바", category: "술집,바", status: "visited", rating: 4.8, confirmed_tags: ["활기찬", "야경"], wanted_by_ids: [], place_preferences: [{ user_id: "m2", kind: "pick" }], is_regular: false, first_visit_date: "2026-06-01", created_at: "2026-06-01T10:00:00Z" },
  ],
  memories: [
    { place_id: 21, author: "민준", mood_tag: "❤️ 좋았어요", content: "이런 조용한 데가 좋아요", date: "2026-04-01", created_at: "2026-04-01T12:00:00Z" },
    { place_id: 23, author: "서연", mood_tag: "❤️ 좋았어요", content: "사람 많고 시끌시끌한 게 재밌어요", date: "2026-02-10", created_at: "2026-02-10T12:00:00Z" },
  ],
  place: {
    name: "을지로 골목 술집",
    category: "술집,포차",
    address: "서울 중구 을지로3가",
    description: null,
    tags: [],
    lat: 37.5663,
    lng: 126.9912,
  },
  candidates: [
    { id: "c1", name: "을지로 조용한 위스키바", category: "술집,바", address: "서울 중구 을지로3가", ...near({ lat: 37.5663, lng: 126.9912 }, 200, 100) },
    { id: "c2", name: "을지로 시끌벅적 포차", category: "술집,포차", address: "서울 중구 을지로3가", ...near({ lat: 37.5663, lng: 126.9912 }, 150, -200) },
    { id: "c3", name: "을지로 조용한 북카페", category: "카페", address: "서울 중구 을지로3가", ...near({ lat: 37.5663, lng: 126.9912 }, 300, 300) },
  ],
};

// ── 케이스 4: 높은 별점과 부정 감정 충돌 ─────────────────────
const case4: Fixture = {
  key: "rating_emotion_conflict",
  title: "높은 별점과 부정 감정 충돌",
  probe: "공동 별점은 높은데 한 사람 반응은 부정적일 때 어느 한쪽을 숨기지 않는지, 업종 전체를 불호로 일반화하지 않는지",
  members: MEMBERS,
  tasteRows: [
    { id: 31, name: "인기 오마카세", category: "일식", status: "visited", rating: 4.8, confirmed_tags: ["특별한 날"], wanted_by_ids: [], place_preferences: [{ user_id: "m1", kind: "pick" }, { user_id: "m2", kind: "pick" }], is_regular: false, first_visit_date: "2026-07-01", created_at: "2026-07-01T10:00:00Z" },
    { id: 32, name: "동네 이자카야", category: "일식", status: "visited", rating: 4.0, confirmed_tags: [], wanted_by_ids: [], place_preferences: [], is_regular: false, first_visit_date: "2026-05-05", created_at: "2026-05-05T10:00:00Z" },
  ],
  memories: [
    { place_id: 31, author: "민준", mood_tag: "❤️ 좋았어요", content: "맛은 최고였는데 자리가 너무 붙어 있어서 불편했어요", date: "2026-07-01", created_at: "2026-07-01T12:00:00Z" },
    { place_id: 31, author: "서연", mood_tag: "😐 아쉬웠어요", content: "가격 대비 양이 적어서 아쉬웠어요", date: "2026-07-01", created_at: "2026-07-01T13:00:00Z" },
  ],
  place: {
    name: "강남 스시 오마카세",
    category: "일식",
    address: "서울 강남구 역삼동",
    description: "특별한 날 가려고 하는 곳",
    tags: [],
    ...GANGNAM,
  },
  candidates: [
    { id: "c1", name: "강남 프리미엄 스시", category: "일식", address: "서울 강남구 역삼동", ...near(GANGNAM, 300, 200) },
    { id: "c2", name: "강남 캐주얼 이자카야", category: "일식", address: "서울 강남구 역삼동", ...near(GANGNAM, 400, -300) },
    { id: "c3", name: "강남 파스타 다이닝", category: "양식", address: "서울 강남구 역삼동", ...near(GANGNAM, 500, 400) },
  ],
};

// ── 케이스 5: 오래된 단골 ────────────────────────────────────
const case5: Fixture = {
  key: "old_regular",
  title: "오래된 단골",
  probe: "최근 방문·기록이 없는 오래된 단골을 자동으로 무효화하지 않는지 (현재 코드는 is_regular를 조회조차 하지 않음)",
  members: MEMBERS,
  tasteRows: [
    { id: 41, name: "동네 오래된 국밥집", category: "한식", status: "visited", rating: 4.5, confirmed_tags: ["일상 데이트"], wanted_by_ids: [], place_preferences: [{ user_id: "m1", kind: "pick" }, { user_id: "m2", kind: "pick" }], is_regular: true, first_visit_date: "2021-11-03", created_at: "2021-11-03T10:00:00Z" },
  ],
  memories: [
    { place_id: 41, author: "민준", mood_tag: "❤️ 좋았어요", content: "몇 년째 오는 단골집이에요", date: "2021-11-03", created_at: "2021-11-03T12:00:00Z" },
  ],
  place: {
    name: "연남 가정식 백반",
    category: "한식",
    address: "서울 마포구 연남동",
    description: null,
    tags: [],
    ...YEONNAM,
  },
  candidates: [
    { id: "c1", name: "연남 백반집", category: "한식", address: "서울 마포구 연남동", ...near(YEONNAM, 200, 150) },
    { id: "c2", name: "연남 파인다이닝", category: "양식", address: "서울 마포구 연남동", ...near(YEONNAM, 300, -200) },
    { id: "c3", name: "연남 분식", category: "분식", address: "서울 마포구 연남동", ...near(YEONNAM, 250, 300) },
  ],
};

// ── 케이스 6: 같은 업종 반복 ──────────────────────────────────
const case6: Fixture = {
  key: "repeated_category",
  title: "같은 업종 반복",
  probe: "카페 방문 기록만 잔뜩 있을 때 대표 근거가 과도하게 부풀거나, 추천이 업종 다양성 없이 카페로만 쏠리지 않는지",
  members: MEMBERS,
  tasteRows: [1, 2, 3, 4, 5, 6].map((n) => ({
    id: 50 + n,
    name: `조용한 카페 ${n}`,
    category: "카페",
    status: "visited" as const,
    rating: 4.3 + n * 0.05,
    confirmed_tags: ["조용한", "커피·음료 중심"],
    wanted_by_ids: [],
    place_preferences: [{ user_id: n % 2 === 0 ? "m2" : "m1", kind: "pick" as const }],
    is_regular: n === 1,
    first_visit_date: `2026-0${(n % 6) + 1}-1${n}`,
    created_at: `2026-0${(n % 6) + 1}-1${n}T10:00:00Z`,
  })),
  memories: [
    { place_id: 51, author: "민준", mood_tag: "❤️ 좋았어요", content: "여기 진짜 조용해서 좋아요", date: "2026-01-11", created_at: "2026-01-11T12:00:00Z" },
  ],
  place: {
    name: "성수 신상 카페",
    category: "카페",
    address: "서울 성동구 성수동1가",
    description: null,
    tags: [],
    ...SEONGSU,
  },
  candidates: [
    { id: "c1", name: "성수 조용한 카페", category: "카페", address: "서울 성동구 성수동1가", ...near(SEONGSU, 200, 100) },
    { id: "c2", name: "성수 디저트 카페", category: "카페", address: "서울 성동구 성수동1가", ...near(SEONGSU, 300, -150) },
    { id: "c3", name: "성수 편집숍 전시", category: "전시,미술관", address: "서울 성동구 성수동1가", ...near(SEONGSU, 400, 250) },
    { id: "c4", name: "성수 브런치 레스토랑", category: "양식", address: "서울 성동구 성수동1가", ...near(SEONGSU, 350, 350) },
  ],
};

// ── 케이스 7: 적합한 먼 후보 ──────────────────────────────────
const case7: Fixture = {
  key: "relevant_far_candidate",
  title: "적합한 먼 후보",
  probe: "거리는 멀어도 취향과 강하게 연결되는 후보를 거리만으로 탈락시키지 않는지 (place_detail 모드는 거리 10%만 반영해야 함)",
  members: MEMBERS,
  tasteRows: [
    { id: 61, name: "이색 팝업 전시", category: "전시,미술관", status: "visited", rating: 4.9, confirmed_tags: ["이색적인", "사진 찍기 좋은"], wanted_by_ids: [], place_preferences: [{ user_id: "m1", kind: "pick" }, { user_id: "m2", kind: "pick" }], is_regular: false, first_visit_date: "2026-06-15", created_at: "2026-06-15T10:00:00Z" },
    { id: 62, name: "독립 서점 전시공간", category: "전시,미술관", status: "wishlist", rating: null, confirmed_tags: ["이색적인"], wanted_by_ids: ["m1", "m2"], place_preferences: [], is_regular: false, first_visit_date: null, created_at: "2026-08-01T10:00:00Z" },
  ],
  memories: [
    { place_id: 61, author: "서연", mood_tag: "❤️ 좋았어요", content: "이런 특이한 전시 또 가고 싶어요", date: "2026-06-15", created_at: "2026-06-15T12:00:00Z" },
  ],
  place: {
    name: "강남 팝업스토어",
    category: "전시,미술관",
    address: "서울 강남구 역삼동",
    description: "이색 체험형 팝업",
    tags: [],
    ...GANGNAM,
  },
  candidates: [
    // 가깝지만 취향과 무관
    { id: "c_near_irrelevant1", name: "강남 프랜차이즈 카페", category: "카페", address: "서울 강남구 역삼동", ...near(GANGNAM, 150, 100) },
    { id: "c_near_irrelevant2", name: "강남 노래연습장", category: "노래방", address: "서울 강남구 역삼동", ...near(GANGNAM, 200, -150) },
    // 멀지만(홍대, 직선 약 14km) 취향과 강하게 연결
    { id: "c_far_relevant", name: "홍대 이색 체험 전시관", category: "전시,미술관", address: "서울 마포구 서교동", ...near(HONGDAE, 200, 200) },
  ],
};

// ── 케이스 8: 부적합한 가까운 후보 ────────────────────────────
const case8: Fixture = {
  key: "irrelevant_near_candidate",
  title: "부적합한 가까운 후보",
  probe: "가깝다는 이유만으로 취향과 무관한 후보를 추천 이유로 포장하지 않는지",
  members: MEMBERS,
  tasteRows: [
    { id: 71, name: "조용한 갤러리 카페", category: "카페", status: "visited", rating: 4.7, confirmed_tags: ["조용한", "전시형 공간"], wanted_by_ids: [], place_preferences: [{ user_id: "m1", kind: "pick" }, { user_id: "m2", kind: "pick" }], is_regular: true, first_visit_date: "2026-03-20", created_at: "2026-03-20T10:00:00Z" },
  ],
  memories: [
    { place_id: 71, author: "민준", mood_tag: "❤️ 좋았어요", content: "조용하고 그림 보면서 얘기하기 좋아요", date: "2026-03-20", created_at: "2026-03-20T12:00:00Z" },
    { place_id: 71, author: "서연", mood_tag: "❤️ 좋았어요", content: "이런 데 자주 오고 싶어요", date: "2026-03-20", created_at: "2026-03-20T13:00:00Z" },
  ],
  place: {
    name: "이태원 조용한 카페",
    category: "카페",
    address: "서울 용산구 이태원동",
    description: null,
    tags: [],
    ...ITAEWON,
  },
  candidates: [
    // 매우 가깝지만(150m) 취향과 정반대
    { id: "c_near_bad", name: "이태원 대형 클럽", category: "술집,클럽", address: "서울 용산구 이태원동", ...near(ITAEWON, 100, 100) },
    { id: "c_near_bad2", name: "이태원 시끄러운 펍", category: "술집,바", address: "서울 용산구 이태원동", ...near(ITAEWON, 150, -100) },
    // 조금 더 멀지만(700m) 취향과 맞음
    { id: "c_match", name: "이태원 조용한 갤러리", category: "전시,미술관", address: "서울 용산구 이태원동", ...near(ITAEWON, 500, 500) },
  ],
};

export const FIXTURES: Fixture[] = [case1, case2, case3, case4, case5, case6, case7, case8];
export { NOW };
