"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { type Place, categoryStyle } from "@/lib/places";
import { ensureKakaoLoaded } from "@/lib/kakao";
import type { KakaoCandidate } from "@/lib/kakaoSearch";
import {
  attachBadgeHandlers,
  createCandidateBadge,
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
  dimmedPlaces = [],
  candidates = [],
  userPos,
  onSelectPlace,
  onSelectCandidate,
  onBoundsChanged,
  fitBounds = true,
  focusLat,
  focusLng,
  focusedPlaceId,
  focusedCandidateId,
}: {
  /** 실선 마커로 그릴 장소. 검색 모드가 아니면 기존처럼 전부, 검색 모드면 매칭된 것만. */
  places: Place[];
  /** 검색에서 빠진 우리 장소 — 흐리게(0.25) + 클릭 불가. 저장된 좌표만 쓰고 지오코딩은 하지 않는다. */
  dimmedPlaces?: Place[];
  /** 아직 저장 안 한 카카오 후보 — 점선 마커. */
  candidates?: KakaoCandidate[];
  userPos?: { lat: number; lng: number } | null;
  /** 주어지면 places 마커 클릭 시 정보창/상세이동 대신 이걸 호출(지도 아래 카드 표시용). */
  onSelectPlace?: (place: Place) => void;
  /** 카카오 후보 마커 클릭 → 카드에 표시. */
  onSelectCandidate?: (candidate: KakaoCandidate) => void;
  /** 지도 이동/줌이 멈췄을 때(최초 로드 포함) 현재 bounds 를 알려준다. */
  onBoundsChanged?: (bounds: kakao.maps.LatLngBounds) => void;
  /** false 면 마커가 바뀌어도 지도를 움직이지 않는다 — 카드 열람 중 뷰포트 유지용. */
  fitBounds?: boolean;
  /** 선택된 항목의 좌표 — 주어지면 지도를 여기로 이동(panTo)한다. 객체 대신 원시값 두 개로 받아 불필요한 재실행을 피한다. */
  focusLat?: number | null;
  focusLng?: number | null;
  /** 이 id 의 장소/후보 마커를 강조 표시한다. */
  focusedPlaceId?: number | null;
  focusedCandidateId?: string | null;
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
  // focusLat/Lng 로 인한 panTo 는 프로그램적 이동이라 "사용자가 팬했다"는 다시-검색
  // 신호(staleBounds)로 잘못 잡히면 안 된다 — 바로 다음 idle 한 번만 무시한다.
  const suppressNextIdleRef = useRef(false);
  // 최신 콜백을 이벤트 리스너에서 항상 참조하기 위한 ref
  // (idle 리스너는 지도 초기화 시 한 번만 붙고, 마커 클릭 핸들러는 마커 재생성을 피하려고 ref 로 참조)
  const onBoundsChangedRef = useRef(onBoundsChanged);
  const onSelectPlaceRef = useRef(onSelectPlace);
  const onSelectCandidateRef = useRef(onSelectCandidate);
  useEffect(() => {
    onBoundsChangedRef.current = onBoundsChanged;
    onSelectPlaceRef.current = onSelectPlace;
    onSelectCandidateRef.current = onSelectCandidate;
  });

  const [status, setStatus] = useState<LoadStatus>("loading");

  // 선택된 항목으로 지도 이동 (마커 강조는 아래 마커 동기화 effect 에서 처리)
  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map || focusLat == null || focusLng == null) return;
    suppressNextIdleRef.current = true;
    map.panTo(new window.kakao.maps.LatLng(focusLat, focusLng));
  }, [status, focusLat, focusLng]);

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
        kakao.maps.event.addListener(mapRef.current, "idle", () => {
          if (suppressNextIdleRef.current) {
            suppressNextIdleRef.current = false;
            return;
          }
          onBoundsChangedRef.current?.(mapRef.current!.getBounds());
        });

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

  // 2) places/dimmedPlaces/candidates 변경 시 마커 동기화
  //    (places 는 좌표 캐시 우선 + 없으면 주소 지오코딩, dimmedPlaces/candidates 는 이미 있는 좌표만 사용)
  useEffect(() => {
    if (status !== "ready" || !mapRef.current || !geocoderRef.current) return;

    const { kakao } = window;
    const map = mapRef.current;
    const geocoder = geocoderRef.current;
    let cancelled = false;

    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    if (places.length === 0 && dimmedPlaces.length === 0 && candidates.length === 0) {
      return;
    }

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
      if (fitBounds && (placed > 0 || userPos)) map.setBounds(bounds);
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
      const highlighted = focusedPlaceId === place.id;
      if (highlighted) {
        el.style.boxShadow = "0 0 0 4px rgba(37,99,235,0.35), 0 1px 3px rgba(0,0,0,0.25)";
        el.style.transform = "scale(1.15)";
      }
      attachBadgeHandlers(
        el,
        () => {
          // 마커 위 말풍선(최소 정보)은 항상 뜬다. 검색 모드면 지도 아래 카드도 함께 연다.
          infoRef.current?.setContent(
            placeInfoContent(place.name, place.category),
          );
          infoRef.current?.setPosition(pos);
          infoRef.current?.open(map);
          onSelectPlaceRef.current?.(place);
        },
        () => {
          // onSelectPlace 가 주어진 동안(지도 검색 모드)은 더블클릭도 상세 이동하지 않는다.
          if (!onSelectPlaceRef.current) router.push(`/places/${place.id}`);
        },
      );

      const overlay = new kakao.maps.CustomOverlay({
        position: pos,
        content: el,
        map,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: highlighted ? 10 : 3,
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

      const addrCandidates = addressCandidates(place.address);
      const tryNext = (i: number) => {
        if (cancelled) return;
        if (i >= addrCandidates.length) {
          console.warn(
            `[KakaoMap] 주소 지오코딩 실패: "${place.name}" — ${place.address}`,
          );
          if (--pending === 0) finalize();
          return;
        }
        geocoder.addressSearch(addrCandidates[i], (results, s) => {
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

    // 검색에서 빠진 우리 장소 — 흐리게 + 클릭 불가. 지오코딩까지 하진 않는다(저장된 좌표만).
    dimmedPlaces.forEach((p) => {
      if (cancelled) return;
      if (p.lat == null || p.lng == null) return;
      const pos = new kakao.maps.LatLng(p.lat, p.lng);
      const el = createCategoryBadge(p);
      el.style.opacity = "0.25";
      el.style.pointerEvents = "none";
      const overlay = new kakao.maps.CustomOverlay({
        position: pos,
        content: el,
        map,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 1,
      });
      overlaysRef.current.push(overlay);
      bounds.extend(pos);
    });

    // 카카오 검색 후보 — 좌표가 이미 있어 지오코딩 대기 없이 바로 그린다.
    candidates.forEach((c) => {
      if (cancelled) return;
      const pos = new kakao.maps.LatLng(c.lat, c.lng);
      const el = createCandidateBadge(c.category);
      const highlighted = focusedCandidateId === c.kakaoId;
      if (highlighted) {
        el.style.boxShadow = "0 0 0 4px rgba(37,99,235,0.35), 0 1px 3px rgba(0,0,0,0.25)";
        el.style.transform = "scale(1.15)";
      }
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        infoRef.current?.setContent(placeInfoContent(c.name, c.category));
        infoRef.current?.setPosition(pos);
        infoRef.current?.open(map);
        onSelectCandidateRef.current?.(c);
      });
      const overlay = new kakao.maps.CustomOverlay({
        position: pos,
        content: el,
        map,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: highlighted ? 10 : 4,
      });
      overlaysRef.current.push(overlay);
      bounds.extend(pos);
    });

    return () => {
      cancelled = true;
    };
  }, [
    places,
    dimmedPlaces,
    candidates,
    status,
    userPos,
    router,
    fitBounds,
    focusedPlaceId,
    focusedCandidateId,
  ]);

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
