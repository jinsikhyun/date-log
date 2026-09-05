/** Stable storage references are persisted; display URLs always recheck the session. */
export const PHOTO_BUCKET = "place-photos";
const REFERENCE_PREFIX = `storage://${PHOTO_BUCKET}/`;

export function validPhotoPath(path: string): boolean {
  return path.length > 0 && path.length <= 1024 &&
    !/[\\\x00-\x1f\x7f?#%]/.test(path) &&
    path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

export function photoPath(value: string, projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): string | null {
  let path: string;
  if (value.startsWith(REFERENCE_PREFIX)) {
    path = value.slice(REFERENCE_PREFIX.length);
  } else {
    if (!projectUrl) return null;
    try {
      const url = new URL(value);
      if (url.origin !== new URL(projectUrl).origin) return null;
      const prefix = `/storage/v1/object/public/${PHOTO_BUCKET}/`;
      if (!url.pathname.startsWith(prefix)) return null;
      path = decodeURIComponent(url.pathname.slice(prefix.length));
    } catch { return null; }
  }
  return validPhotoPath(path) ? path : null;
}

const DISPLAY_WIDTHS = new Set([160, 320, 640, 960, 1280]);

export function validPhotoWidth(value: unknown): number | null {
  const width = typeof value === "string" ? Number(value) : value;
  return typeof width === "number" && DISPLAY_WIDTHS.has(width) ? width : null;
}

export function photoDisplayUrl(value: string | undefined, width?: number): string | undefined {
  if (!value) return undefined;
  const path = photoPath(value);
  if (path) {
    const params = new URLSearchParams({ path });
    const safeWidth = validPhotoWidth(width);
    if (safeWidth) params.set("w", String(safeWidth));
    return `/api/place-photo?${params.toString()}`;
  }
  // A malformed internal reference must never be sent to a public endpoint.
  if (value.startsWith("storage://")) return undefined;
  return value;
}
