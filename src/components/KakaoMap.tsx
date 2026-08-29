"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { type Place, categoryStyle } from "@/lib/places";
import { ensureKakaoLoaded } from "@/lib/kakao";
import {
  attachBadgeHandlers,
  createCategoryBadge,
  placeInfoContent,
} from "@/lib/mapBadge";

type LoadStatus = "loading" | "ready" | "error";

/** "…26 지하1층", "…31 1층, 2층" 같은 꼬리표를 떼어 지오코딩 성공률을 높인다 */
function addressCandidates(raw: string): string[] {
  const cleaned = raw
    .replace(/\s*,.*$/, "")
    .replace(/\s*(지하\s*\d*\s*층|\d+\s*층|\d+\s*호).*$/, "")
    .trim();
  return cleaned && cleaned !== raw ? [raw, cleaned] : [raw];
}

export function KakaoMap({
  places,
  userPos,
}: {
  places: Place[];
  userPos?: { lat: number; lng: number } | null;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const geocoderRef = useRef<kakao.maps.services.Geocoder | null>(null);
  const infoRef = useRef<kakao.maps.InfoWindow | null>(null);
  const overlaysRef = useRef<kakao.maps.CustomOverlay[]>([]);
  // 주소 → 좌표 캐시 (place 추가 시 전체 재지오코딩 방지)
  const coordCacheRef = useRef<Map<string, { lat: number; lng: number }>>(
    new Map(),
  );

  const [status, setStatus] = useState<LoadStatus>("loading");

  // 1) SDK + 지도 1회 초기화
  useEffect(() => {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
    if (!appKey) {
      console.error(
        "[KakaoMap] 환경변수 NEXT_PUBLIC_KAKAO_MAP_KEY 가 비어 있습니다.\n" +
          "- .env.local 값 확인 후 dev 서버를 재시작하세요.",
      );
      setStatus("error");
      return;
    }

    let cancelled = false;

    ensureKakaoLoaded(appKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const { kakao } = window;

        mapRef.current = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(37.5786, 126.97), // 서촌 부근
          level: 5,
        });
        geocoderRef.current = new kakao.maps.services.Geocoder();
        infoRef.current = new kakao.maps.InfoWindow({
          content: "",
          removable: true,
        });
        kakao.maps.event.addListener(mapRef.current, "click", () =>
          infoRef.current?.close(),
        );

        setStatus("ready");
      })
      .catch((err: unknown) => {
        const detail = err instanceof Error ? err.message : String(err);
        console.error(
          `[KakaoMap] 초기화 실패: ${detail}\n` +
            "체크리스트:\n" +
            " 1) 카카오 개발자 콘솔 > 앱 키의 'JavaScript 키' 가 .env.local 값과 일치하는가\n" +
            " 2) 콘솔 > 앱 설정 > 플랫폼 > Web 에 http://localhost:3000 이 등록됐는가\n" +
            " 3) 콘솔 > 제품 설정 > 카카오맵 사용 설정이 ON 인가\n" +
            " 4) 광고 차단기/사내 네트워크가 dapi.kakao.com 을 막고 있지 않은가",
        );
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // 2) places 변경 시 마커 동기화 (좌표 캐시 우선, 없으면 주소 지오코딩)
  useEffect(() => {
    if (status !== "ready" || !mapRef.current || !geocoderRef.current) return;

    const { kakao } = window;
    const map = mapRef.current;
    const geocoder = geocoderRef.current;
    let cancelled = false;

    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    if (places.length === 0) return;

    const bounds = new kakao.maps.LatLngBounds();
    let pending = places.length;
    let placed = 0;

    // "내 위치" 파란 점 (위치 권한 허용 시)
    if (userPos) {
      const upos = new kakao.maps.LatLng(userPos.lat, userPos.lng);
      const dot = document.createElement("div");
      dot.title = "내 위치";
      dot.style.cssText =
        "width:16px;height:16px;border-radius:9999px;background:#2563eb;" +
        "border:3px solid #fff;box-shadow:0 0 0 4px rgba(37,99,235,.25);";
      const ov = new kakao.maps.CustomOverlay({
        position: upos,
        content: dot,
        map,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 5,
      });
      overlaysRef.current.push(ov);
      bounds.extend(upos);
    }

    const finalize = () => {
      if (cancelled) return;
      if (placed > 0 || userPos) map.setBounds(bounds);
      if (placed < places.length) {
        console.warn(
          `[KakaoMap] ${places.length}곳 중 ${placed}곳만 지도에 표시됨 (나머지는 주소 변환 실패).`,
        );
      }
    };

    const addMarker = (place: Place, lat: number, lng: number) => {
      if (cancelled) return;
      const pos = new kakao.maps.LatLng(lat, lng);

      // 카카오 기본 핀 대신 카테고리 원형 뱃지 (CustomOverlay)
      const el = createCategoryBadge(place);
      attachBadgeHandlers(
        el,
        () => {
          infoRef.current?.setContent(
            placeInfoContent(place.name, place.category),
          );
          infoRef.current?.setPosition(pos);
          infoRef.current?.open(map);
        },
        () => router.push(`/places/${place.id}`),
      );

      const overlay = new kakao.maps.CustomOverlay({
        position: pos,
        content: el,
        map,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 3,
      });
      overlaysRef.current.push(overlay);
      bounds.extend(pos);
      placed += 1;
    };

    places.forEach((place) => {
      // 1) DB 에 저장된 좌표(장소 검색 자동완성으로 채워짐) 가 있으면 그대로 사용
      if (place.lat != null && place.lng != null) {
        addMarker(place, place.lat, place.lng);
        if (--pending === 0) finalize();
        return;
      }

      const cached = coordCacheRef.current.get(place.address);
      if (cached) {
        addMarker(place, cached.lat, cached.lng);
        if (--pending === 0) finalize();
        return;
      }

      const candidates = addressCandidates(place.address);
      const tryNext = (i: number) => {
        if (cancelled) return;
        if (i >= candidates.length) {
          console.warn(
            `[KakaoMap] 주소 지오코딩 실패: "${place.name}" — ${place.address}`,
          );
          if (--pending === 0) finalize();
          return;
        }
        geocoder.addressSearch(candidates[i], (results, s) => {
          if (cancelled) return;
          if (s === kakao.maps.services.Status.OK && results.length > 0) {
            const lat = parseFloat(results[0].y);
            const lng = parseFloat(results[0].x);
            coordCacheRef.current.set(place.address, { lat, lng });
            addMarker(place, lat, lng);
            if (--pending === 0) finalize();
          } else {
            tryNext(i + 1);
          }
        });
      };
      tryNext(0);
    });

    return () => {
      cancelled = true;
    };
  }, [places, status, userPos, router]);

  const categoriesInView = [...new Set(places.map((p) => p.category))];

  return (
    <div className="relative overflow-hidden rounded-3xl ring-1 ring-border/70">
      <div
        ref={containerRef}
        className="h-[420px] w-full bg-stone-200 sm:h-[520px]"
        role="application"
        aria-label="장소 지도"
      />

      {status !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-stone-100/85 p-6 text-center">
          {status === "loading" ? (
            <p className="text-sm text-muted">지도 불러오는 중…</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-red-700">
                지도를 불러오지 못했어요
              </p>
              <p className="max-w-xs text-xs leading-relaxed text-muted">
                브라우저 개발자 콘솔(F12)에 원인과 체크리스트를 출력했어요.
              </p>
            </>
          )}
        </div>
      )}

      {status === "ready" && categoriesInView.length > 0 && (
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-1.5">
          {categoriesInView.map((category) => (
            <span
              key={category}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${categoryStyle(
                category,
              )}`}
            >
              {category}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
