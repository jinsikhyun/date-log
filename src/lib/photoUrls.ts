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

// Must match the "newly uploaded" branch of can_access_place_photo() in
// supabase/migrations/20260905010000_isolate_place_photos_by_couple.sql (without
// the thumbnail suffix). Only paths in this exact shape can have a pregenerated
// "-<width>.jpg" sibling; legacy flat filenames never do.
const NEW_FORMAT_PHOTO_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/;

export function isNewFormatPhotoPath(path: string): boolean {
  return NEW_FORMAT_PHOTO_PATH.test(path);
}

/** Storage path of the pregenerated thumbnail sibling for a new-format original path. */
export function thumbnailPath(path: string, width: number): string {
  return path.replace(/\.jpg$/, `-${width}.jpg`);
}

/** 공유 이미지 등, 리사이즈된 표시용 폭이 아니라 저장된 최대 화질 원본이 무조건 필요한
 * 곳에서 쓴다. Storage에 저장된 "원본"은 업로드 시 이미 가로 최대 1600px/quality 0.85로
 * 처리된 파일이며(src/lib/photos.ts), 그보다 더 높은 화질의 사본은 존재하지 않는다. */
export function photoOriginalUrl(value: string | undefined): string | undefined {
  return photoDisplayUrl(value);
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
