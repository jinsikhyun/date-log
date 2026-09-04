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

export function photoDisplayUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const path = photoPath(value);
  if (path) return `/api/place-photo?path=${encodeURIComponent(path)}`;
  // A malformed internal reference must never be sent to a public endpoint.
  if (value.startsWith("storage://")) return undefined;
  return value;
}
