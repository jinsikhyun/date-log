import type { Metadata } from "next";
import { MemoriesFeed } from "@/components/MemoriesFeed";

export const metadata: Metadata = {
  title: "추억 모아보기 — date.log",
};

export default function MemoriesPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-7 sm:px-10 sm:py-8">
      <MemoriesFeed />
    </main>
  );
}
