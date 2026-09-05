export type CaptureEngine = "html2canvas" | "html-to-image";

function timeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  })]).finally(() => clearTimeout(timer));
}

async function imageData(src: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(src, { signal: controller.signal, mode: "cors", credentials: "same-origin" });
    if (!response.ok) throw new Error("image response failed");
    const blob = await response.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const image = new Image();
    image.src = data;
    await timeout(image.decode(), 12000, "image decode timeout");
    if (!image.naturalWidth) throw new Error("empty image");
    return data;
  } catch {
    throw new Error("사진을 불러오지 못해 저장을 중단했어요. 연결 상태와 사진을 확인한 뒤 다시 시도해 주세요.");
  } finally { clearTimeout(timer); }
}

/** 캡처용 복제본에 실제 사진을 미리 내장한다. 원본 DOM은 변경하지 않는다.
 * 이미지 누락을 조용히 무시하는 캡처 라이브러리의 기본 동작을 피한다. */
async function preparedClone(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement;
  const originals = [source, ...source.querySelectorAll<HTMLElement>("*")];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  const cache = new Map<string, Promise<string>>();
  const load = (url: string) => {
    if (!cache.has(url)) cache.set(url, imageData(url));
    return cache.get(url)!;
  };
  await Promise.all(originals.map(async (node, index) => {
    const copy = copies[index];
    if (node instanceof HTMLImageElement) {
      const src = node.currentSrc || node.src;
      if (!src) throw new Error("사진 주소가 없어 저장할 수 없어요.");
      const img = copy as HTMLImageElement;
      img.removeAttribute("srcset");
      img.removeAttribute("sizes");
      img.loading = "eager";
      img.src = await load(src);
    }
    let bg = getComputedStyle(node).backgroundImage;
    const matches = [...bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)];
    for (const match of matches) bg = bg.replace(match[0], `url("${await load(match[1])}")`);
    if (matches.length) copy.style.backgroundImage = bg;
  }));
  return clone;
}

/** 엔진 비교용 공통 준비 단계. html2canvas는 비교 기준으로만 남긴다. */
export async function captureCard(
  source: HTMLElement,
  engine: CaptureEngine,
  opts?: { pixelRatio?: number },
): Promise<Blob> {
  await timeout(document.fonts.ready, 12000, "글꼴 로딩이 오래 걸려요. 잠시 후 다시 시도해 주세요.");
  const clone = await preparedClone(source);
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, { position: "fixed", left: "-10000px", top: "0", pointerEvents: "none" });
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const width = Math.ceil(clone.getBoundingClientRect().width);
    const height = Math.ceil(Math.max(clone.getBoundingClientRect().height, clone.scrollHeight));
    if (!width || !height || height > 8000) throw new Error("카드가 너무 길거나 크기를 확인할 수 없어요. 내용을 나눠서 공유해 주세요.");
    // 모바일 메모리 사용 상한: 최대 2배, 12MP 이하.
    // opts.pixelRatio 가 주어지면(정확한 출력 픽셀 크기가 필요한 카드) 자동 계산을 건너뛴다.
    const scale = opts?.pixelRatio ?? Math.min(2, Math.sqrt(12000000 / (width * height)));
    const render = async () => {
      if (engine === "html-to-image") {
        const { toBlob } = await import("html-to-image");
        const blob = await toBlob(clone, { width, height, pixelRatio: scale, backgroundColor: "#ffffff", preferredFontFormat: "woff2" });
        if (!blob?.size) throw new Error("이미지를 만들지 못했어요.");
        return blob;
      }
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(clone, { width, height, scale, backgroundColor: "#ffffff", useCORS: true, logging: false });
      return new Promise<Blob>((resolve, reject) => canvas.toBlob(
        b => b?.size ? resolve(b) : reject(new Error("이미지를 만들지 못했어요.")), "image/png"));
    };
    return await timeout(render(), 30000, "이미지 생성이 오래 걸려 중단했어요. 다시 시도해 주세요.");
  } finally { host.remove(); }
}
