import type { ComponentProps } from "react";
import { photoDisplayUrl, photoPath } from "@/lib/photoUrls";

/** Plain image element so lightboxes and share capture retain native behavior. */
export default function PhotoImage({ src, alt, displayWidth, sizes, style, ...props }: ComponentProps<"img"> & { displayWidth?: 160 | 320 | 640 | 960 | 1280 }) {
  const displaySrc = typeof src === "string" ? photoDisplayUrl(src, displayWidth) : src;
  const internal = typeof src === "string" && photoPath(src) != null;
  const responsive = internal && displayWidth === 640;
  const preview = internal && typeof src === "string" ? photoDisplayUrl(src, 160) : undefined;
  // eslint-disable-next-line @next/next/no-img-element
  return <img
    decoding="async"
    {...props}
    alt={alt ?? ""}
    src={displaySrc}
    srcSet={responsive && typeof src === "string" ? `${photoDisplayUrl(src, 640)} 640w, ${photoDisplayUrl(src, 960)} 960w` : undefined}
    sizes={responsive ? (sizes ?? "(max-width: 640px) 100vw, 33vw") : sizes}
    style={{
      ...style,
      ...(preview ? {
        backgroundImage: `url("${preview}")`,
        backgroundPosition: "center",
        backgroundSize: "cover",
      } : {}),
    }}
  />;
}
