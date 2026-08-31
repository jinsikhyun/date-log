import type { Metadata } from "next";
import { CoursesView } from "@/components/CoursesView";

export const metadata: Metadata = {
  title: "데이트 코스 — date.log",
};

export default function CoursesPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-7 sm:px-10 sm:py-8">
      <CoursesView />
    </main>
  );
}
