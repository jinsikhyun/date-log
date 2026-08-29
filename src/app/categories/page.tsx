import type { Metadata } from "next";
import { CategoriesManager } from "@/components/CategoriesManager";

export const metadata: Metadata = {
  title: "카테고리 관리 — date.log",
};

export default function CategoriesPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <CategoriesManager />
    </main>
  );
}
