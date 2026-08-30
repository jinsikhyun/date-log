import type { Metadata } from "next";
import { NotificationsView } from "@/components/NotificationsView";

export const metadata: Metadata = {
  title: "우편함 — date.log",
};

export default function NotificationsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <NotificationsView />
    </main>
  );
}
