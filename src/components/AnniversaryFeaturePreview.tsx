"use client";

import { AnniversaryPlanBanner } from "@/components/AnniversaryPlanBanner";

export function AnniversaryFeaturePreview() {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8);
  const date = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
  return (
    <div className="space-y-5">
      <p className="text-xs font-semibold text-muted">기념일 기능 미리보기 · 샘플 데이터</p>
      <AnniversaryPlanBanner
        event={{ date, kind: "birthday", label: "지민의 생일", icon: "🎂" }}
        onPlan={() => undefined}
      />
      <article className="rounded-[20px] bg-card p-5 ring-1 ring-border">
        <p className="text-xs text-muted-2">방문 장소의 자동 태그</p>
        <h2 className="mt-2 text-lg font-extrabold">기념일에 함께한 장소</h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["🎂 지민의 생일에 다녀왔어요", "💍 우리의 1주년에 다녀왔어요"].map((label) => (
            <span key={label} className="inline-flex w-fit rounded-full bg-[#fff3ee] px-2.5 py-1 text-[10px] font-semibold text-[#a85f50] ring-1 ring-[#e7b9ad]/50">{label}</span>
          ))}
        </div>
      </article>
    </div>
  );
}
