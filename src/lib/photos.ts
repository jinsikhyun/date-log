// 대표 사진: 브라우저에서 리사이즈 + JPEG 변환 후 Supabase Storage 에 업로드.
//
//  - 원본이 큰 용량이어도 canvas 로 가로 최대 1600px 로 줄이고 JPEG 로 재인코딩한다.
//  - HEIC/HEIF 는 Safari 처럼 네이티브 디코딩이 되면 그대로, 안 되면(크롬 등) heic2any 로 변환한다.
//  - 성공 시 "place-photos" 버킷의 public URL 을 돌려준다. 실패하면 throw.

import { supabase } from "@/lib/supabase";

const BUCKET = "place-photos";
const MAX_WIDTH = 1600;
const JPEG_QUALITY = 0.85;

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

/** File → 가로 최대 maxWidth 로 축소한 JPEG Blob */
export async function processImageToJpeg(
  file: File,
  maxWidth = MAX_WIDTH,
): Promise<Blob> {
  if (!file.type.startsWith("image/") && !isHeic(file)) {
    throw new Error("이미지 파일만 올릴 수 있어요.");
  }

  const img = await decodeToImage(file);
  const scale = Math.min(1, maxWidth / img.naturalWidth);
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 변환할 수 없어요 (canvas 미지원).");
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("이미지를 JPEG 로 변환하지 못했어요.");
  return blob;
}

/** 사진 1장을 리사이즈·JPEG 변환 후 place-photos 버킷에 올리고 public URL 을 돌려준다.
 *  (장소 대표 사진, 추억 첨부 사진 공용) */
export async function uploadPhoto(file: File): Promise<string> {
  const jpeg = await processImageToJpeg(file);
  const path = `${crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, jpeg, { contentType: "image/jpeg", upsert: false });

  if (error) {
    // 버킷/스토리지 정책이 없으면 여기서 RLS 위반으로 실패한다.
    throw new Error(
      `업로드 실패: ${error.message} (supabase/storage_place_photos.sql 적용 여부를 확인해 주세요.)`,
    );
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("업로드는 됐지만 공개 URL 을 못 받았어요.");
  return data.publicUrl;
}
