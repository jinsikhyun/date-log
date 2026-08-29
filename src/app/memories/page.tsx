import type { Metadata } from "next";
import { MemoriesFeed } from "@/components/MemoriesFeed";

export const metadata: Metadata = {
  title: "추억 모아보기 — date.log",
};

export default function MemoriesPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <MemoriesFeed />
    </main>
  );
}
