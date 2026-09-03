"use client";

import { useEffect, useRef, useState } from "react";
import { ShareCard } from "./ShareCard";
import { CourseShareCard } from "./CourseShareCard";
import { ShareImageModal } from "./ShareImageModal";
import { captureElement, downloadBlob } from "@/lib/shareImage";
import type { CaptureEngine } from "@/lib/shareCapture";
import type { Place } from "@/lib/places";

const photo = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#e3ece8"/><circle cx="400" cy="240" r="130" fill="#36585a"/><rect x="180" y="430" width="440" height="60" fill="#c9a46a"/></svg>',
);
const basePlace: Place = {
  id: 1, name: "서촌에서 함께 발견한 아주 긴 이름의 작은 커피집 — 긴장소명공백없이도끝까지표시되는지확인",
  category: "카페", address: "서울 종로구 테스트길 12, 창가 옆 작은 자리",
  description: "첫 번째 줄: 비 오는 날 함께 마신 따뜻한 커피.\n두 번째 줄: 우산을 접고 오래 앉아 나눈 이야기.\n세 번째 줄: 마지막 문장과 아래 date.log까지 잘리지 않아야 해요.",
  rating: 4.5, image_url: photo, image_captured_date: "2025-06-28", first_visit_date: "2025-06-28",
  naver_map_link: null, kakao_map_link: null, lat: null, lng: null, status: "visited",
  wanted_by: null, wanted_by_ids: [], added_by: "테스트", favorite_by: [], is_regular: false,
  memory_count: 0, created_at: "2025-06-28T00:00:00Z", via_course: false, tags: [],
};
const stops = Array.from({ length: 12 }, (_, i) => ({ id: i + 1,
  name: i === 1 ? "아주긴이름공백없이도옆의카테고리를밀어내지않아야하는전시공간" : `${i + 1}번째 함께 걷는 서촌의 장소`,
  category: i % 2 ? "전시" : "카페" }));
const coords = new Map(stops.map((s, i) => [s.id, i === 3 ? null : { lat: 37.575 + i * .001, lng: 126.97 }]));
type Result = { label: string; url: string; blob: Blob; hash: string };

export function ShareCaptureQA() {
  const placeRef = useRef<HTMLDivElement>(null);
  const courseRef = useRef<HTMLDivElement>(null);
  const urls = useRef<string[]>([]);
  const [mode, setMode] = useState("photo");
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const place = { ...basePlace, image_url: mode === "none" ? null : mode === "broken" ? "/__share_missing__.png" : photo };
  useEffect(() => () => urls.current.forEach(url => URL.revokeObjectURL(url)), []);
  async function compare() {
    if (busy) return;
    setBusy(true); setError(""); setResults([]);
    urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current = [];
    try {
      const output: Result[] = [];
      for (const [name, node] of [["장소", placeRef.current], ["코스", courseRef.current]] as const) {
        if (!node) throw new Error("카드를 찾지 못했어요.");
        for (const engine of ["html2canvas", "html-to-image"] as CaptureEngine[]) {
          const blob = await captureElement(node, engine);
          const url = URL.createObjectURL(blob); urls.current.push(url);
          const hash = crypto.subtle
            ? [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))]
              .map(x => x.toString(16).padStart(2, "0")).join("")
            : "HTTPS 또는 localhost에서 확인 가능";
          output.push({ label: `${name}-${engine}`, url, blob, hash });
          setResults([...output]);
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : "캡처 실패"); }
    finally { setBusy(false); }
  }
  return <main className="space-y-5 p-6">
    <h1 className="text-xl font-bold">공유 카드 비교 · 고정 fixture v1</h1>
    <p>DB 저장 없음. 개발 환경 전용. 12개 코스 번호·긴 이름·여러 줄 설명을 비교해요.</p>
    <label>사진 상태 <select value={mode} disabled={busy} onChange={e => { setMode(e.target.value); setResults([]); setError(""); }}>
      <option value="photo">사진 있음</option><option value="none">사진 없음</option><option value="broken">사진 로딩 실패</option>
    </select></label>
    <button disabled={busy} onClick={() => void compare()} className="rounded-xl bg-accent p-3 text-white">
      {busy ? "비교 중…" : "두 엔진 비교"}
    </button>
    <div className="flex items-center gap-2">실제 모달 테스트
      <ShareImageModal key={mode} filename="share-fixture-place.png" renderCard={ref => <ShareCard ref={ref} place={place} />} />
    </div>
    {error && <p role="alert">{error}</p>}
    <div className="flex flex-wrap items-start gap-5">
      <ShareCard ref={placeRef} place={place} />
      <CourseShareCard ref={courseRef} title="우리의 길고 여유로운 서촌 산책 코스" concept={"아침부터 저녁까지 천천히 걸어요.\n마지막 12번 장소와 워터마크까지 확인해요."} stops={stops} coords={coords} />
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      {results.map(result => <section key={result.label}>
        <h2>{result.label}</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={result.url} alt={result.label} style={{ width: 400, maxWidth: "100%" }} />
        <p className="break-all text-xs">PNG {result.blob.size} bytes · SHA-256 {result.hash}</p>
        <button onClick={() => downloadBlob(result.blob, `${result.label}.png`)}>표시된 원본 PNG 저장</button>
      </section>)}
    </div>
  </main>;
}
