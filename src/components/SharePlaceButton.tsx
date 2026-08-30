"use client";

import type { Place } from "@/lib/places";
import { ShareCard } from "@/components/ShareCard";
import { ShareImageModal } from "@/components/ShareImageModal";

export function SharePlaceButton({ place }: { place: Place }) {
  const filename = `datelog-${(place.name || "place")
    .trim()
    .replace(/\s+/g, "-")}.png`;

  return (
    <ShareImageModal
      filename={filename}
      shareTitle={place.name}
      renderCard={(ref) => <ShareCard ref={ref} place={place} />}
    />
  );
}
