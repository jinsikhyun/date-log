"use client";

import { useState } from "react";
import { toFilenameSlug } from "@/lib/shareImage";
import { DEFAULT_SHARE_RATIO, type ShareRatio } from "@/lib/shareOutputs";
import { ShareRatioModal } from "@/components/ShareRatioModal";
import { SharePreviewModal } from "@/components/SharePreviewModal";
import { ShareCourseCard, type CourseShareStop } from "@/components/ShareCourseCard";

type Coord = { lat: number; lng: number };

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function todayStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function ShareCourseButton({
  title,
  concept,
  stops,
  coords,
}: {
  title: string;
  concept: string | null;
  stops: CourseShareStop[];
  coords: Map<number, Coord | null>;
}) {
  const [step, setStep] = useState<"closed" | "ratio" | "preview">("closed");
  const [ratio, setRatio] = useState<ShareRatio>(DEFAULT_SHARE_RATIO);

  const filename = `datelog-course-${toFilenameSlug(title)}-${todayStamp()}.png`;

  return (
    <>
      <button
        type="button"
        onClick={() => setStep("ratio")}
        aria-label="이미지로 공유"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600 transition-colors hover:bg-stone-200 hover:text-accent"
      >
        <ShareIcon />
      </button>

      {step === "ratio" && (
        <ShareRatioModal
          ratio={ratio}
          onChangeRatio={setRatio}
          onCancel={() => setStep("closed")}
          onPreview={() => setStep("preview")}
          renderCard={(r) => (
            <ShareCourseCard title={title} concept={concept} stops={stops} coords={coords} ratio={r} />
          )}
        />
      )}

      {step === "preview" && (
        <SharePreviewModal
          ratio={ratio}
          filename={filename}
          onChangeRatio={() => setStep("ratio")}
          onClose={() => setStep("closed")}
          renderCard={(ref, r) => (
            <ShareCourseCard ref={ref} title={title} concept={concept} stops={stops} coords={coords} ratio={r} />
          )}
        />
      )}
    </>
  );
}
