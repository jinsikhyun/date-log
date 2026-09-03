"use client";

import { VisitMoodPrompt } from "@/components/VisitMoodPrompt";

export function QuickVisitPreview() {
  return (
    <main className="min-h-screen bg-background px-4 py-12 text-foreground sm:px-8">
      <div className="mx-auto max-w-xl">
        <p className="mb-4 text-center text-xs font-medium text-muted">
          빠른 방문 기록 · 디자인 미리보기
        </p>
        <VisitMoodPrompt
          placeId={1}
          placeName="카멜커피 서촌점"
          onMood={() => undefined}
          onClose={() => undefined}
          preview
        />
      </div>
    </main>
  );
}
