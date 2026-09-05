import type { ComponentProps } from "react";
import { photoDisplayUrl } from "@/lib/photoUrls";

/** Plain image element so lightboxes and share capture retain native behavior. */
export default function PhotoImage({ src, alt, displayWidth, ...props }: ComponentProps<"img"> & { displayWidth?: 160 | 320 | 640 | 960 | 1280 }) {
  const displaySrc = typeof src === "string" ? photoDisplayUrl(src, displayWidth) : src;
  // eslint-disable-next-line @next/next/no-img-element
  return <img decoding="async" {...props} alt={alt ?? ""} src={displaySrc} />;
}
