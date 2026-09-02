import { notFound } from "next/navigation";
import { TagSelectorPreview } from "@/components/TagSelectorPreview";

export default function TagSelectQAPage() {
  // 고정 더미 상태만 사용하며 운영 빌드에서는 접근 불가.
  if (process.env.NODE_ENV !== "development") notFound();
  return <TagSelectorPreview />;
}
