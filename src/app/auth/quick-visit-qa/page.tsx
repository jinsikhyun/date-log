import { notFound } from "next/navigation";
import { QuickVisitPreview } from "@/components/QuickVisitPreview";

export default function QuickVisitQAPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return <QuickVisitPreview />;
}
