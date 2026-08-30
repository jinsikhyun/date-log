import type { Metadata } from "next";
import { OnboardingView } from "@/components/OnboardingView";

export const metadata: Metadata = {
  title: "커플 연결 — date.log",
};

export default function OnboardingPage() {
  return (
    <main className="mx-auto max-w-sm px-5 py-12 sm:py-16">
      <OnboardingView />
    </main>
  );
}
