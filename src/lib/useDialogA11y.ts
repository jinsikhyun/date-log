"use client";

import { type RefObject, useEffect, useRef } from "react";

/**
 * 모달 공용 접근성 배선: 열릴 때 내부로 focus 이동 + 포커스 트랩,
 * Escape 로 닫기, 닫히면 원래 트리거로 focus 복귀, body 스크롤 잠금.
 */
export function useDialogA11y(
  open: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>,
) {
  // ⚠️ ShareRatioModal/SharePreviewModal 은 open을 계속 true로 두고 조건부 렌더링(mount/unmount)로
  // 여닫는다 — open이 true→false로 바뀌는 걸 감지하는 if/else로는 복귀 코드가 절대 실행되지 않는다
  // (언마운트는 effect를 다시 안 돌리고 cleanup만 부른다). cleanup 함수로 복귀시켜야 두 방식
  // (boolean 토글형 모달 / 조건부 렌더링형 모달) 모두에서 동작한다.
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    return () => {
      triggerRef.current?.focus();
      triggerRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    const focusables = () =>
      container
        ? Array.from(
            container.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.offsetParent !== null)
        : [];

    const first = focusables()[0];
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, containerRef]);
}
