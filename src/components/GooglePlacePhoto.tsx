"use client";

// GOOGLE_PLACES_PHOTO_FEATURE_HANDOFF.md §7 — 사용자 사진이 없는 장소의 Google 자동 대표사진
// (위시리스트·다녀온 곳 공통, course_only는 제외).
// 화면에 실제로 보일 때만(IntersectionObserver) /api/place-google-photo 를 호출한다.
// 사용자 사진이 있으면 이 컴포넌트를 아예 렌더링하지 않는 게 호출자의 책임(우선순위는
// PlaceCard/WishlistView/PlaceDetail 쪽에서 place.image_url 유무로 분기).

import { useEffect, useRef, useState } from "react";

export interface GooglePlacePhotoData {
  dataUrl: string;
  attribution: { displayName: string; uri: string } | null;
  googleMapsUri: string | null;
}

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; data: GooglePlacePhotoData }
  | { kind: "empty" }; // no_match 또는 error — 기존 placeholder로 대체

// 같은 페이지 세션 안에서 같은 장소를 다시 조회하지 않기 위한 메모리 캐시일 뿐,
// 새로고침하면 사라진다(사진 자체를 영속 저장하는 게 아니다 — 정책 §3 원칙 준수).
const sessionCache = new Map<number, GooglePlacePhotoData | null>();

export function GooglePlacePhoto({
  placeId,
  alt,
  imgClassName = "h-full w-full object-cover",
  placeholder,
  allowRetry = false,
}: {
  placeId: number;
  alt: string;
  imgClassName?: string;
  placeholder: React.ReactNode;
  /** 상세 화면처럼 명시적 재시도가 자연스러운 곳만 true — 목록 카드에는 자동 재시도 UI를 두지 않는다(§7). */
  allowRetry?: boolean;
}) {
  const cached = sessionCache.get(placeId);
  const [state, setState] = useState<FetchState>(
    cached === undefined ? { kind: "idle" } : cached ? { kind: "ok", data: cached } : { kind: "empty" },
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  // 마운트 시점에 이미 세션 캐시 결과가 있었으면 다시 관찰·조회하지 않는다. state.kind를
  // effect 의존성에 넣으면 안 된다 — load()의 setState({kind:"loading"})가 그 즉시 이
  // effect를 재실행시키고, cleanup이 진행 중인 fetch의 cancelled를 true로 만들어 응답이
  // 도착해도 setState가 무시되는 자기 자신을 취소하는 버그가 생긴다(실제로 재현·확인함).
  const skippedInitially = useRef(cached !== undefined);

  useEffect(() => {
    if (skippedInitially.current) return;
    const el = rootRef.current;
    if (!el) return;
    let cancelled = false;

    const load = async () => {
      setState({ kind: "loading" });
      try {
        const res = await fetch("/api/place-google-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placeId }),
        });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json?.status === "ok" && typeof json.dataUrl === "string") {
          const data: GooglePlacePhotoData = {
            dataUrl: json.dataUrl,
            attribution: json.attribution ?? null,
            googleMapsUri: json.googleMapsUri ?? null,
          };
          sessionCache.set(placeId, data);
          setState({ kind: "ok", data });
        } else {
          sessionCache.set(placeId, null);
          setState({ kind: "empty" });
        }
      } catch {
        if (cancelled) return;
        sessionCache.set(placeId, null);
        setState({ kind: "empty" });
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          void load();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [placeId, retryTick]);

  if (state.kind === "ok") {
    const { data } = state;
    return (
      <div ref={rootRef} className="relative h-full w-full">
        <a
          href={data.googleMapsUri ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${alt} — Google Maps 사진 원본 보기`}
          className="block h-full w-full"
          onClick={(e) => {
            if (!data.googleMapsUri) e.preventDefault();
          }}
        >
          {/* data URL — next/image 최적화 대상이 아니라 일반 img 사용 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.dataUrl} alt={alt} className={imgClassName} />
        </a>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/65 to-transparent px-2.5 py-1.5 text-[10px] font-medium text-white">
          <span>Google Maps 사진</span>
          {data.attribution?.displayName ? (
            data.attribution.uri ? (
              <a
                href={data.attribution.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="pointer-events-auto truncate underline decoration-white/50 opacity-90 hover:opacity-100"
              >
                {data.attribution.displayName}
              </a>
            ) : (
              <span className="truncate opacity-90">{data.attribution.displayName}</span>
            )
          ) : null}
        </div>
      </div>
    );
  }

  if (state.kind === "empty") {
    if (!allowRetry) return <>{placeholder}</>;
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-[#f5f3ef]">
        {placeholder}
        <button
          type="button"
          onClick={() => {
            setRetryTick((t) => t + 1);
            setState({ kind: "idle" });
          }}
          className="absolute bottom-2 right-2 z-[1] rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-muted-2 shadow-sm transition hover:text-accent"
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative flex h-full w-full items-center justify-center bg-[#f5f3ef]">
      {state.kind === "loading" ? (
        <span className="text-xs text-muted-2">장소 사진을 불러오는 중…</span>
      ) : (
        placeholder
      )}
    </div>
  );
}
