"use client";

import {
  AiRecommendationCard,
  type AiRecommendedPlace,
} from "@/components/AiRecommendationCard";

const SAMPLE_RECOMMENDATIONS: AiRecommendedPlace[] = [
  {
    id: "preview-1",
    name: "오설록 티하우스 북촌점",
    category: "카페",
    address: "서울 종로구 북촌로 45",
    reason:
      "차분한 한옥 분위기와 오래 대화하기 좋은 좌석이 지금 보고 있는 장소의 감성과 잘 어울려요.",
    tags: ["조용한", "오래 머물기 좋은", "낮 데이트"],
    distanceLabel: "1.4km",
    imageUrl: "/brand-app-icon.png",
    kakaoMapUrl:
      "https://map.kakao.com/link/search/%EC%98%A4%EC%84%A4%EB%A1%9D%20%ED%8B%B0%ED%95%98%EC%9A%B0%EC%8A%A4%20%EB%B6%81%EC%B4%8C%EC%A0%90",
  },
  {
    id: "preview-2",
    name: "텅 성수 스페이스",
    category: "전시",
    address: "서울 성동구 성수이로 82",
    reason:
      "전시와 카페를 한 번에 즐길 수 있어 감성적인 사진 데이트를 이어가기 좋은 곳이에요.",
    tags: ["전시형 공간", "사진 찍기 좋은", "이색적인"],
    distanceLabel: "12km",
    imageUrl: null,
    kakaoMapUrl:
      "https://map.kakao.com/link/search/%ED%85%85%20%EC%84%B1%EC%88%98%20%EC%8A%A4%ED%8E%98%EC%9D%B4%EC%8A%A4",
  },
  {
    id: "preview-3",
    name: "남산 와이너리",
    category: "바",
    address: "서울 용산구 회나무로 10",
    reason:
      "조용한 저녁과 가벼운 술을 선호한 기록이 많아서 특별한 날의 마무리 장소로 골랐어요.",
    tags: ["저녁 데이트", "술", "특별한 날"],
    distanceLabel: "5.8km",
    imageUrl: null,
    kakaoMapUrl:
      "https://map.kakao.com/link/search/%EB%82%A8%EC%82%B0%20%EC%99%80%EC%9D%B4%EB%84%88%EB%A6%AC",
  },
];

export function AiRecommendationPreview() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="rounded-[28px] bg-surface p-5 ring-1 ring-border-strong sm:p-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-accent">UI 미리보기 · 1단계</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-[-0.02em]">
              이런 곳은 어때요?
            </h1>
            <p className="mt-2 text-sm text-muted-2">
              우리의 기록과 이 장소의 분위기를 함께 보고 골랐어요.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background"
          >
            다시 추천받기
          </button>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SAMPLE_RECOMMENDATIONS.map((place) => (
            <AiRecommendationCard key={place.id} place={place} />
          ))}
        </div>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-3">
          추천은 취향을 바탕으로 한 제안이에요. 방문 전 영업시간과 최신 정보를
          지도에서 확인해 주세요.
        </p>
      </div>
    </main>
  );
}

