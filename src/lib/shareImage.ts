// 화면 밖에 숨겨둔 카드를 html2canvas 로 PNG 캡처 → 다운로드 / OS 공유 시트.
// html2canvas 는 버튼 클릭 시에만 동적 import (SSR 회피 + 번들 분리).

/** 요소를 PNG Blob 으로 캡처. */
export async function captureElement(el: HTMLElement): Promise<Blob> {
  const html2canvas = (await import("html2canvas")).default;

  // 레티나 대응: 최소 2배, 최대 3배 (모서리 매끄럽게 + 글자 선명하게)
  const dpr =
    typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const scale = Math.min(Math.max(2, dpr), 3);

  const canvas = await html2canvas(el, {
    // ⚠️ null 이면 투명 → 뷰어/PNG 에서 검게 보이고 라운드 코너 바깥도 검게 나옴.
    //    카드 실제 배경색(흰색)으로 명시.
    backgroundColor: "#ffffff",
    scale,
    useCORS: true, // 대표 사진(Supabase public 버킷)에 CORS 헤더 있음
    logging: false,
    // 캡처 영역을 정확히 카드 렌더 크기로 고정 (우측 여백 방지).
    // 카드 루트가 width:400 고정이라 offsetWidth 는 항상 400.
    width: el.offsetWidth,
    height: el.offsetHeight,
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
