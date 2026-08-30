// 화면 밖에 숨겨둔 카드를 html2canvas 로 PNG 캡처 → 다운로드 / OS 공유 시트.
// html2canvas 는 버튼 클릭 시에만 동적 import (SSR 회피 + 번들 분리).

/** 요소를 PNG Blob 으로 캡처. scale 로 해상도를 올린다(레티나/스토리용). */
export async function captureElement(
  el: HTMLElement,
  scale = 3,
): Promise<Blob> {
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(el, {
    backgroundColor: null, // 카드 자체 배경을 그대로
    scale,
    useCORS: true, // 대표 사진(Supabase public 버킷)에 CORS 헤더 있음
    logging: false,
  });
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("이미지를 만들지 못했어요."))),
      "image/png",
    );
  });
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

/** OS 공유 시트 열기 (이미지 파일). 사용자가 취소하면 AbortError 를 던진다. */
export async function shareImage(
  blob: Blob,
  filename: string,
  opts?: { title?: string; text?: string },
): Promise<void> {
  const file = new File([blob], filename, { type: "image/png" });
  await navigator.share({
    files: [file],
    title: opts?.title,
    text: opts?.text,
  });
}
