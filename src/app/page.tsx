import { Suspense } from "react";
import { HomeView } from "@/components/HomeView";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      {/* HomeView 가 useSearchParams 를 쓰므로 Suspense 경계 필요 */}
      <Suspense fallback={null}>
        <HomeView />
      </Suspense>
    </main>
  );
}
