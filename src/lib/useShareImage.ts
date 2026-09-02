"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import {
  captureElement,
  downloadBlob,
  canShareImage,
  shareImage,
} from "@/lib/shareImage";

export type SharePhase = "idle" | "capturing" | "ready" | "sharing";

/**
 * "이미지로 저장/공유" 상태 머신. targetRef 는 캡처 대상(화면 밖 카드)을 가리킨다.
 * ref.current 는 capture()(비동기 핸들러) 안에서만 읽는다 — 렌더 중엔 접근 안 함.
 */
export function useShareImage(
  targetRef: RefObject<HTMLElement | null>,
  filename: string,
) {
  const [phase, setPhase] = useState<SharePhase>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 이 훅을 쓰는 컴포넌트는 데이터 로드 후에만 렌더돼 SSR 을 안 타므로 바로 확인해도 안전
  const [shareable] = useState(() => canShareImage());

  // 한 번의 동작이 정확히 한 번만 실행되도록 (StrictMode 이중호출 / 더블클릭 방지).
  //  - capturingRef: 캡처가 시작되면 true, reset() 전까지 유지 → 모달 한 번 열림당 캡처 1회
  //  - lastDownloadRef: 마지막 다운로드 시각 → 1초 내 재호출은 무시 (클릭 1회 = 파일 1개)
  const capturingRef = useRef(false);
  const lastDownloadRef = useRef(0);
  const lastShareRef = useRef(0);
  const sharingRef = useRef(false);
  const generationRef = useRef(0);
  useEffect(() => () => { generationRef.current += 1; }, []);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const capture = async () => {
    if (capturingRef.current) return; // 이미 캡처했거나 캡처 중 → 무시
    capturingRef.current = true;
    const generation = ++generationRef.current;
    setError(null);
    setPhase("capturing");
    try {
      const el = targetRef.current;
      if (!el) throw new Error("카드를 준비하지 못했어요.");
      const b = await captureElement(el);
      if (generation !== generationRef.current) return;
      setBlob(b);
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(b);
      });
      setPhase("ready");
    } catch (e) {
      if (generation !== generationRef.current) return;
      console.error("[share] 캡처 실패:", e);
      setError(e instanceof Error ? e.message : "이미지를 만들지 못했어요.");
      setPhase("idle");
      capturingRef.current = false; // 실패 시엔 재시도 가능하도록 해제
    }
    // 성공 시엔 해제하지 않는다 — reset()(모달 재오픈) 전까지 재캡처 차단
  };

  const download = () => {
    const now = Date.now();
    if (!blob || now - lastDownloadRef.current < 1000) return; // 1초 내 재호출 무시
    lastDownloadRef.current = now;
    downloadBlob(blob, filename);
  };

  const share = async () => {
    const now = Date.now();
    if (!blob || sharingRef.current || now - lastShareRef.current < 1500) return;
    lastShareRef.current = now;
    sharingRef.current = true;
    const generation = generationRef.current;
    setPhase("sharing");
    setError(null);
    try {
      await shareImage(blob, filename);
      if (generation !== generationRef.current) return;
      setPhase("ready");
    } catch (e) {
      if (generation !== generationRef.current) return;
      if (e instanceof Error && e.name === "AbortError") {
        setPhase("ready"); // 사용자가 공유 시트를 닫음 — 오류 아님
      } else {
        console.error("[share] 공유 실패:", e);
        setError("공유하지 못했어요. 다운로드로 저장해 보세요.");
        setPhase("ready");
      }
    } finally {
      if (generation === generationRef.current) sharingRef.current = false;
    }
  };

  const reset = useCallback(() => {
    generationRef.current += 1;
    capturingRef.current = false;
    sharingRef.current = false;
    lastDownloadRef.current = 0;
    setPhase("idle");
    setBlob(null);
    setError(null);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  }, []);

  return { phase, previewUrl, error, shareable, capture, download, share, reset };
}
