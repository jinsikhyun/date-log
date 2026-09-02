import { notFound } from "next/navigation";
import { CoupleCalendar } from "@/components/CoupleCalendar";

export default function CalendarQAPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-8">
      <div className="mx-auto max-w-2xl">
        <p className="mb-4 text-center text-xs font-medium text-muted">
          캘린더 디자인 미리보기 · 샘플 기록
        </p>
        <CoupleCalendar startDate="2025-06-28" preview />
      </div>
    </main>
  );
}
