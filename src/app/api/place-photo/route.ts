import { createClient } from "@/lib/supabase/server";
import { PHOTO_BUCKET, validPhotoPath } from "@/lib/photoUrls";

export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Vary": "Cookie",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; sandbox",
};

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path");
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
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(path);
  if (error || !data) return new Response(null, { status: 404, headers });
  if (!["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(data.type)) {
    return new Response(null, { status: 415, headers });
  }
  return new Response(data, { headers: { ...headers, "Content-Type": data.type } });
}
