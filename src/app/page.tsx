import { Suspense } from "react";
import { HomeView } from "@/components/HomeView";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-7 sm:px-10 sm:py-8">
      {/* HomeView 가 useSearchParams 를 쓰므로 Suspense 경계 필요 */}
      <Suspense fallback={null}>
        <HomeView />
      </Suspense>
    </main>
  );
}
