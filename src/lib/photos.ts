// 대표 사진: 브라우저에서 리사이즈 + JPEG 변환 후 Supabase Storage 에 업로드.
//
//  - 원본이 큰 용량이어도 canvas 로 가로 최대 1600px 로 줄이고 JPEG 로 재인코딩한다.
//  - HEIC/HEIF 는 Safari 처럼 네이티브 디코딩이 되면 그대로, 안 되면(크롬 등) heic2any 로 변환한다.
//  - 성공 시 "place-photos" 버킷의 영구 Storage 참조를 돌려준다. 실패하면 throw.

import { supabase } from "@/lib/supabase/client";
import { thumbnailPath } from "@/lib/photoUrls";

const BUCKET = "place-photos";
const MAX_WIDTH = 1600;
const JPEG_QUALITY = 0.85;
// Must stay a subset of DISPLAY_WIDTHS in src/lib/photoUrls.ts and the width
// whitelist in supabase/migrations/20260905020000_allow_place_photo_thumbnails.sql.
const THUMBNAIL_WIDTHS = [160, 320, 640, 960, 1280];

function dateToLocalKey(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})[:/-](\d{2})[:/-](\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return null;
}

/** 원본 사진의 EXIF 촬영일을 YYYY-MM-DD로 반환. 메타데이터가 없거나 깨졌으면 null. */
export async function extractPhotoTakenDate(file: File): Promise<string | null> {
  try {
    const { parse } = await import("exifr");
    const metadata = (await parse(file, [
      "DateTimeOriginal",
      "CreateDate",
      "DateTimeDigitized",
    ])) as Record<string, unknown> | undefined;
    return dateToLocalKey(
      metadata?.DateTimeOriginal ??
        metadata?.CreateDate ??
        metadata?.DateTimeDigitized,
    );
  } catch {
    // SNS 저장본·스크린샷처럼 EXIF가 없는 사진은 기존 흐름으로 조용히 돌아간다.
    return null;
  }
}

/** 확장자나 MIME 로 HEIC/HEIF 판별 (iPhone 원본 사진) */
function isHeic(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

/** Blob → HTMLImageElement. EXIF 회전은 브라우저가 알아서 적용한다. */
function loadImage(src: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(src);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이 브라우저가 이미지를 디코딩하지 못했어요."));
    };
    img.src = url;
  });
}

/** 원본을 디코딩. 네이티브 실패 + HEIC 면 heic2any 로 JPEG 변환 후 재시도. */
async function decodeToImage(file: File): Promise<HTMLImageElement> {
  try {
    return await loadImage(file);
  } catch (err) {
    if (!isHeic(file)) throw err;
    // 크롬/파이어폭스: HEIC 네이티브 디코딩 불가 → libheif(wasm) 폴백. 필요할 때만 로드.
    const { default: heic2any } = await import("heic2any");
    const out = (await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.9,
    })) as Blob | Blob[];
    return loadImage(Array.isArray(out) ? out[0] : out);
  }
}

function validateImageFile(file: File) {
  if (!file.type.startsWith("image/") && !isHeic(file)) {
    throw new Error("이미지 파일만 올릴 수 있어요.");
  }
}

/** 디코딩된 이미지 → 가로 최대 maxWidth 로 축소한 JPEG Blob (업스케일 안 함) */
function resizeToJpeg(img: HTMLImageElement, maxWidth: number): Promise<Blob> {
  const scale = Math.min(1, maxWidth / img.naturalWidth);
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 변환할 수 없어요 (canvas 미지원).");
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("이미지를 JPEG 로 변환하지 못했어요."))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

/** File → 가로 최대 maxWidth 로 축소한 JPEG Blob */
export async function processImageToJpeg(
  file: File,
  maxWidth = MAX_WIDTH,
): Promise<Blob> {
  validateImageFile(file);
  const img = await decodeToImage(file);
  return resizeToJpeg(img, maxWidth);
}

/** 사진 1장을 리사이즈·JPEG 변환 후 place-photos 버킷에 올리고 영구 Storage 참조를 돌려준다.
 *  (장소 대표 사진, 추억 첨부 사진 공용)
 *  같은 디코딩 결과로 표시용 썸네일도 함께 만들어 나란히 올린다 — /api/place-photo가
 *  Supabase 변환 대신 이 파일들을 바로 서빙해 로딩을 빠르게 한다. */
export async function uploadPhoto(file: File): Promise<string> {
  validateImageFile(file);
  const img = await decodeToImage(file);
  const jpeg = await resizeToJpeg(img, MAX_WIDTH);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("로그인 후 사진을 올려 주세요.");
  const { data: profile, error: profileError } = await supabase
    .from("profiles").select("couple_id").eq("id", user.id).single();
  if (profileError || !profile?.couple_id) throw new Error("커플 연결을 확인해 주세요.");
  const path = `${profile.couple_id}/${user.id}/${crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, jpeg, { contentType: "image/jpeg", upsert: false });

  if (error) {
    // 버킷/스토리지 정책이 없으면 여기서 RLS 위반으로 실패한다.
    throw new Error(
      `업로드 실패: ${error.message} (로그인 상태와 사진 저장소 권한을 확인해 주세요. 예전 공개 권한 SQL은 재실행하지 마세요.)`,
    );
  }

  // Best-effort: 썸네일이 하나라도 실패해도 업로드 자체는 성공 처리한다.
  // /api/place-photo가 없는 썸네일은 온디맨드 변환→원본 순으로 폴백한다.
  await Promise.all(
    THUMBNAIL_WIDTHS.filter((w) => w < img.naturalWidth).map(async (w) => {
      try {
        const thumb = await resizeToJpeg(img, w);
        const { error: thumbError } = await supabase.storage
          .from(BUCKET)
          .upload(thumbnailPath(path, w), thumb, { contentType: "image/jpeg", upsert: false });
        if (thumbError) console.warn(`[uploadPhoto] ${w}px 썸네일 업로드 실패:`, thumbError.message);
      } catch (err) {
        console.warn(`[uploadPhoto] ${w}px 썸네일 생성 실패:`, err);
      }
    }),
  );

  return `storage://${BUCKET}/${path}`;
}
