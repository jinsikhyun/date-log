// AI_RECOMMENDATION_HANDOFF.md §6 확정 태그 체계.
// UI 검증 단계이므로 DB 컬럼(`places.tags`)은 아직 만들지 않았고, 이 파일은
// 프런트에서 쓰는 정적 태그 사전과 카테고리별 추천 순서만 정의한다.

export type TagGroupName = "분위기" | "목적" | "공간" | "음식·메뉴" | "시간·상황";

export interface TagGroup {
  name: TagGroupName;
  tags: string[];
}

export const TAG_GROUPS: TagGroup[] = [
  { name: "분위기", tags: ["조용한", "감성적인", "편안한", "고급스러운", "이색적인"] },
  {
    name: "목적",
    tags: ["대화하기 좋은", "특별한 날", "사진 찍기 좋은", "일상 데이트", "오래 머물기 좋은"],
  },
  { name: "공간", tags: ["전망 좋은", "아늑한", "넓은", "전시형 공간", "야외 좌석"] },
  {
    name: "음식·메뉴",
    tags: ["커피·음료 중심", "디저트", "술", "가벼운 식사", "든든한 식사", "매운 음식"],
  },
  { name: "시간·상황", tags: ["낮 데이트", "저녁 데이트", "야경", "비 오는 날", "주말"] },
];

export const ALL_TAGS: string[] = TAG_GROUPS.flatMap((g) => g.tags);

export const RECOMMENDED_MIN_TAGS = 3;
export const RECOMMENDED_MAX_TAGS = 5;
export const MAX_SELECTED_TAGS = 8;

// 카테고리별로 먼저 보여줄 6~8개. 목록에 없는 카테고리는 DEFAULT_SUGGESTED_TAGS를 쓴다.
const CATEGORY_SUGGESTED_TAGS: Record<string, string[]> = {
  카페: [
    "조용한",
    "감성적인",
    "대화하기 좋은",
    "커피·음료 중심",
    "디저트",
    "오래 머물기 좋은",
    "아늑한",
    "전망 좋은",
  ],
  맛집: [
    "든든한 식사",
    "가벼운 식사",
    "매운 음식",
    "일상 데이트",
    "특별한 날",
    "편안한",
    "저녁 데이트",
    "넓은",
  ],
  술집: [
    "술",
    "저녁 데이트",
    "편안한",
    "대화하기 좋은",
    "아늑한",
    "야경",
    "주말",
    "특별한 날",
  ],
  바: [
    "술",
    "고급스러운",
    "야경",
    "저녁 데이트",
    "특별한 날",
    "이색적인",
    "전망 좋은",
    "대화하기 좋은",
  ],
  사진: [
    "사진 찍기 좋은",
    "이색적인",
    "야외 좌석",
    "전망 좋은",
    "낮 데이트",
    "감성적인",
    "주말",
    "넓은",
  ],
  전시: [
    "전시형 공간",
    "이색적인",
    "사진 찍기 좋은",
    "조용한",
    "감성적인",
    "낮 데이트",
    "대화하기 좋은",
    "편안한",
  ],
};

const DEFAULT_SUGGESTED_TAGS = [
  "편안한",
  "감성적인",
  "대화하기 좋은",
  "일상 데이트",
  "조용한",
  "사진 찍기 좋은",
  "낮 데이트",
  "주말",
];

/** 장소 카테고리와 맥락에 맞춰 먼저 노출할 추천 태그 6~8개를 고른다. */
export function suggestedTagsForCategory(category?: string | null): string[] {
  if (category && CATEGORY_SUGGESTED_TAGS[category]) {
    return CATEGORY_SUGGESTED_TAGS[category];
  }
  return DEFAULT_SUGGESTED_TAGS;
}
