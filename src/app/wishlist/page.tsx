import type { Metadata } from "next";
import { WishlistView } from "@/components/WishlistView";

export const metadata: Metadata = {
  title: "가고 싶은 곳 — date.log",
};

export default function WishlistPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-7 sm:px-10 sm:py-8">
      <WishlistView />
    </main>
  );
}
