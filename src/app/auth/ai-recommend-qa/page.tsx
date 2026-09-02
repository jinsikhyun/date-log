import { notFound } from "next/navigation";
import { AiRecommendationPreview } from "@/components/AiRecommendationPreview";

export default function AiRecommendQAPage() {
  // 고정 더미 데이터만 사용하며 운영 빌드에서는 접근 불가.
  if (process.env.NODE_ENV !== "development") notFound();
  return <AiRecommendationPreview />;
}

