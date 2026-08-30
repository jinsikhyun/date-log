"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
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
  shareTitle?: string,
) {
  const [phase, setPhase] = useState<SharePhase>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 이 훅을 쓰는 컴포넌트는 데이터 로드 후에만 렌더돼 SSR 을 안 타므로 바로 확인해도 안전
  const [shareable] = useState(() => canShareImage());

  // 한 번의 동작이 정확히 한 번만 실행되도록 (StrictMode 이중호출 / 더블클릭 방지)
  const capturingRef = useRef(false);
  const downloadingRef = useRef(false);
  const sharingRef = useRef(false);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const capture = async () => {
    if (capturingRef.current) return; // 이미 캡처 중이면 무시
    capturingRef.current = true;
    setError(null);
    setPhase("capturing");
    try {
      const el = targetRef.current;
      if (!el) throw new Error("카드를 준비하지 못했어요.");
      const b = await captureElement(el);
      setBlob(b);
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(b);
      });
      setPhase("ready");
    } catch (e) {
      console.error("[share] 캡처 실패:", e);
      setError(e instanceof Error ? e.message : "이미지를 만들지 못했어요.");
      setPhase("idle");
    } finally {
      capturingRef.current = false;
    }
  };

  const download = () => {
    if (!blob || downloadingRef.current) return; // 클릭 한 번에 파일 하나만
    downloadingRef.current = true;
    downloadBlob(blob, filename);
    window.setTimeout(() => {
      downloadingRef.current = false;
    }, 700);
  };

  const share = async () => {
    if (!blob || sharingRef.current) return;
    sharingRef.current = true;
    setPhase("sharing");
    setError(null);
    try {
      await shareImage(blob, filename, { title: shareTitle });
      setPhase("ready");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setPhase("ready"); // 사용자가 공유 시트를 닫음 — 오류 아님
      } else {
        console.error("[share] 공유 실패:", e);
        setError("공유하지 못했어요. 다운로드로 저장해 보세요.");
        setPhase("ready");
      }
    } finally {
      sharingRef.current = false;
    }
  };

  const reset = () => {
    setPhase("idle");
    setBlob(null);
    setError(null);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  };

  return { phase, previewUrl, error, shareable, capture, download, share, reset };
}
