import type { Metadata } from "next";
import { RecapDashboard } from "@/components/RecapDashboard";

export const metadata: Metadata = {
  title: "우리의 기록 — date.log",
};

export default function RecapPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <RecapDashboard />
    </main>
  );
}
