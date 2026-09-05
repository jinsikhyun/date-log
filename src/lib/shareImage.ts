import { captureCard, type CaptureEngine } from "@/lib/shareCapture";

/** 고정 카드 비교 후 선택한 로컬 후보. 모바일 실기기 확인 전 운영 배포 보류. */
export function captureElement(
  el: HTMLElement,
  engine: CaptureEngine = "html-to-image",
  opts?: { pixelRatio?: number },
): Promise<Blob> {
  return captureCard(el, engine, opts);
}

/** 파일명에 쓸 수 있게 다듬는다. 한글은 유지하고 공백은 하이픈으로, 위험한 문자만 제거. */
export function toFilenameSlug(name: string): string {
  return name
    .trim()
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "place";
}

/** Blob 을 파일로 저장 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** navigator.share + canShare({files}) 로 이미지 파일 공유가 가능한 환경인가 */
export function canShareImage(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return false;
  try {
    const probe = new File([new Blob([""])], "probe.png", {
      type: "image/png",
    });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** OS 공유 시트 열기 (이미지 파일 하나만). 사용자가 취소하면 AbortError 를 던진다.
 *  title/text 를 같이 넘기면 일부 공유 대상(특히 macOS "복사")이 이미지를
 *  두 번 처리하는 경우가 있어 files 만 전달한다. */
export async function shareImage(
  blob: Blob,
  filename: string,
): Promise<void> {
  const file = new File([blob], filename, { type: "image/png" });
  await navigator.share({ files: [file] });
}
