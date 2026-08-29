import type { Metadata } from "next";
import { CoursesView } from "@/components/CoursesView";

export const metadata: Metadata = {
  title: "데이트 코스 — date.log",
};

export default function CoursesPage() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <CoursesView />
    </main>
  );
}
