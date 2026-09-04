import type { ComponentProps } from "react";
import { photoDisplayUrl } from "@/lib/photoUrls";

/** Plain image element so lightboxes and share capture retain native behavior. */
export default function PhotoImage({ src, alt, ...props }: ComponentProps<"img">) {
  const displaySrc = typeof src === "string" ? photoDisplayUrl(src) : src;
  // eslint-disable-next-line @next/next/no-img-element
  return <img decoding="async" {...props} alt={alt ?? ""} src={displaySrc} />;
}
