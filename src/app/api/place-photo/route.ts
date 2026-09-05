import { createClient } from "@/lib/supabase/server";
import { PHOTO_BUCKET, isNewFormatPhotoPath, thumbnailPath, validPhotoPath, validPhotoWidth } from "@/lib/photoUrls";

export const dynamic = "force-dynamic";
const headers = {
  // The browser may reuse a photo for this session; shared/CDN caches may not.
  "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
  "Vary": "Cookie",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; sandbox",
};

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path");
  const width = validPhotoWidth(new URL(request.url).searchParams.get("w"));
  if (!path || !validPhotoPath(path)) {
    return new Response(null, { status: 400, headers });
  }
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response(null, { status: 401, headers });
  const { data: allowed, error: accessError } = await supabase.rpc(
    "can_access_place_photo", { p_name: path },
  );
  if (accessError) return new Response(null, { status: 503, headers });
  if (allowed !== true) return new Response(null, { status: 404, headers });
  // User session only: Storage RLS applies. Never use the service-role key here.
  const bucket = supabase.storage.from(PHOTO_BUCKET);
  let data, error;
  // Fastest path: a pregenerated thumbnail sibling, served with no per-request
  // transform work. Falls through when absent (legacy photo, or generation
  // failed at upload time) — RLS re-checks this exact object name regardless.
  if (width && isNewFormatPhotoPath(path)) {
    ({ data, error } = await bucket.download(thumbnailPath(path, width)));
  }
  if (error || !data) {
    ({ data, error } = await bucket.download(
      path,
      width ? { transform: { width, quality: 85, resize: "contain" } } : undefined,
    ));
  }
  // Image transformation may be unavailable on some Supabase plans. Keep the
  // photo usable without weakening access control; Storage RLS still applies.
  if ((error || !data) && width) {
    ({ data, error } = await bucket.download(path));
  }
  if (error || !data) return new Response(null, { status: 404, headers });
  if (!["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(data.type)) {
    return new Response(null, { status: 415, headers });
  }
  return new Response(data, { headers: { ...headers, "Content-Type": data.type } });
}
