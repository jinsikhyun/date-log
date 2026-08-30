// 화면 밖에 숨겨둔 카드를 html2canvas 로 PNG 캡처 → 다운로드 / OS 공유 시트.
// html2canvas 는 버튼 클릭 시에만 동적 import (SSR 회피 + 번들 분리).

/** 요소 안의 모든 이미지(＜img＞ + 인라인 background-image url)가 로드될 때까지 대기 */
function waitForImages(el: HTMLElement): Promise<void> {
  const urls = new Set<string>();

  el.querySelectorAll("img").forEach((img) => {
    if (img.currentSrc || img.src) urls.add(img.currentSrc || img.src);
  });
  el.querySelectorAll<HTMLElement>("*").forEach((node) => {
    const bg = node.style?.backgroundImage;
    if (bg && bg.includes("url(")) {
      const m = bg.match(/url\(["']?(.+?)["']?\)/);
      if (m?.[1]) urls.add(m[1]);
    }
  });

  return Promise.all(
    [...urls].map(
      (src) =>
        new Promise<void>((resolve) => {
          const im = new Image();
          im.crossOrigin = "anonymous";
          const done = () => resolve();
          im.onload = done;
          im.onerror = done; // 실패해도 진행 (html2canvas 가 자체 처리)
          im.src = src;
          if (im.complete) resolve();
        }),
    ),
  ).then(() => undefined);
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

/** 요소를 PNG Blob 으로 캡처. */
export async function captureElement(el: HTMLElement): Promise<Blob> {
  const html2canvas = (await import("html2canvas")).default;

  // 레이아웃이 "최종 높이"로 잡힌 뒤에 캡처해야 하단이 안 잘린다:
  //  1) 폰트 로딩 완료 (폰트 늦게 뜨면 텍스트 크기 바뀌며 레이아웃 밀림)
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* noop */
    }
  }
  //  2) 카드 안 이미지 로드 완료
  await waitForImages(el);
  //  3) 브라우저가 레이아웃을 반영할 시간 (rAF 2회)
  await nextFrame();
  await nextFrame();

  // 레티나 대응: 최소 2배, 최대 3배 (모서리 매끄럽게 + 글자 선명하게)
  const dpr =
    typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const scale = Math.min(Math.max(2, dpr), 3);

  const canvas = await html2canvas(el, {
    // null 이면 투명 영역이 검게 나옴 → 카드 배경색(흰색) 명시
    backgroundColor: "#ffffff",
    scale,
    useCORS: true,
    logging: false,
    // 자동 감지에 의존하지 않고 명시 (하단 잘림 방지)
    width: el.offsetWidth,
    height: el.scrollHeight,
    windowHeight: el.scrollHeight,
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
