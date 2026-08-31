import type { Metadata } from "next";
import { RecapDashboard } from "@/components/RecapDashboard";

export const metadata: Metadata = {
  title: "우리의 기록 — date.log",
};

export default function RecapPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-7 sm:px-10 sm:py-8">
      <RecapDashboard />
    </main>
  );
}
