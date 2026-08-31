"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ensureKakaoLoaded } from "@/lib/kakao";
import {
  attachBadgeHandlers,
  createCategoryBadge,
  placeInfoContent,
} from "@/lib/mapBadge";

export interface MapStop {
  id: number;
  name: string;
  category: string;
  status: string;
  lat: number;
  lng: number;
}

type LoadStatus = "loading" | "ready" | "error";

/** 정거장을 카테고리 뱃지로 찍고 Polyline 으로 이어 동선을 보여준다. */
export function CourseMap({ stops }: { stops: MapStop[] }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const overlaysRef = useRef<kakao.maps.CustomOverlay[]>([]);
  const lineRef = useRef<kakao.maps.Polyline | null>(null);
  const infoRef = useRef<kakao.maps.InfoWindow | null>(null);
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  const [status, setStatus] = useState<LoadStatus>(
    appKey ? "loading" : "error",
  );

  // 지도 1회 초기화
  useEffect(() => {
    if (!appKey) return;
    let cancelled = false;
    ensureKakaoLoaded(appKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new window.kakao.maps.Map(containerRef.current, {
          center: new window.kakao.maps.LatLng(37.5786, 126.97),
          level: 5,
        });
        infoRef.current = new window.kakao.maps.InfoWindow({
          content: "",
          removable: true,
        });
        window.kakao.maps.event.addListener(mapRef.current, "click", () =>
          infoRef.current?.close(),
        );
        setStatus("ready");
      })
      .catch((err: unknown) => {
        console.error("[CourseMap] 초기화 실패:", err);
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [appKey]);

  // stops 변경 시 마커 + 선 다시 그리기
  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;
    const { kakao } = window;
    const map = mapRef.current;

    infoRef.current?.close();
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    lineRef.current?.setMap(null);
    lineRef.current = null;

    if (stops.length === 0) return;

    const path = stops.map((s) => new kakao.maps.LatLng(s.lat, s.lng));

    if (path.length >= 2) {
      lineRef.current = new kakao.maps.Polyline({
        path,
        strokeWeight: 4,
        strokeColor: "#36585a",
        strokeOpacity: 0.9,
        strokeStyle: "solid",
        map,
      });
    }

    stops.forEach((s, i) => {
      // 홈 지도와 동일한 카테고리 원형 뱃지 (다녀온 곳 실선 / 위시리스트 점선)
      const el = createCategoryBadge(s);
      el.title = s.name;
      attachBadgeHandlers(
        el,
        () => {
          infoRef.current?.setContent(placeInfoContent(s.name, s.category));
          infoRef.current?.setPosition(path[i]);
          infoRef.current?.open(map);
        },
        () => router.push(`/places/${s.id}`),
      );

      const overlay = new kakao.maps.CustomOverlay({
        position: path[i],
        content: el,
        map,
        yAnchor: 0.5,
        xAnchor: 0.5,
        zIndex: 3,
      });
      overlaysRef.current.push(overlay);
    });

    const bounds = new kakao.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    map.setBounds(bounds);
  }, [stops, status, router]);

  return (
    <div className="relative overflow-hidden rounded-3xl ring-1 ring-border/70">
      <div
        ref={containerRef}
        className="h-[360px] w-full bg-stone-200 sm:h-[440px]"
        role="application"
        aria-label="코스 동선 지도"
      />
      {status !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center bg-stone-100/85 p-6 text-center">
          <p className="text-sm text-muted">
            {status === "loading"
              ? "지도 불러오는 중…"
              : "지도를 불러오지 못했어요 (콘솔 확인)."}
          </p>
        </div>
      )}
    </div>
  );
}
