import { notFound } from "next/navigation";
import { CourseContextPreview } from "@/components/CourseContextPreview";

export default function CourseContextQAPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <CourseContextPreview />;
}
