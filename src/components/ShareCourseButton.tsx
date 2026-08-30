"use client";

import { CourseShareCard, type ShareStop } from "@/components/CourseShareCard";
import { ShareImageModal } from "@/components/ShareImageModal";

type Coord = { lat: number; lng: number };

export function ShareCourseButton({
  title,
  concept,
  stops,
  coords,
}: {
  title: string;
  concept: string | null;
  stops: ShareStop[];
  coords: Map<number, Coord | null>;
}) {
  const filename = `datelog-course-${(title || "course")
    .trim()
    .replace(/\s+/g, "-")}.png`;

  return (
    <ShareImageModal
      filename={filename}
      renderCard={(ref) => (
        <CourseShareCard
          ref={ref}
          title={title}
          concept={concept}
          stops={stops}
          coords={coords}
        />
      )}
    />
  );
}
