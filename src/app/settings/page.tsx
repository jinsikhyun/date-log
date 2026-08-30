import type { Metadata } from "next";
import { SettingsView } from "@/components/SettingsView";

export const metadata: Metadata = {
  title: "설정 — date.log",
};

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-md px-5 py-12 sm:py-16">
      <SettingsView />
    </main>
  );
}
