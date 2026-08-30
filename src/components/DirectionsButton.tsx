"use client";

import { useEffect, useState } from "react";
import { geocode, kakaoDirectionsTo } from "@/lib/kakao";

/**
 * "길찾기" 버튼 — 저장된 좌표가 있으면 바로, 없으면 주소를 지오코딩해서
 * 카카오맵 길찾기 URL(/link/to/이름,lat,lng)을 새 탭으로 연다.
 * 좌표를 못 구하면 렌더 안 함.
 */
export function DirectionsButton({
  name,
  lat,
  lng,
  address,
  className,
}: {
  name: string;
  lat: number | null;
  lng: number | null;
  address: string;
  className?: string;
}) {
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(
    lat != null && lng != null ? { lat, lng } : null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (coord || failed) return;
    let cancelled = false;
    geocode(address)
      .then((c) => {
        if (cancelled) return;
        if (c) setCoord(c);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [address, coord, failed]);

  if (failed) return null;
  if (!coord) {
    return (
      <span className={className} aria-disabled>
        길찾기
      </span>
    );
  }

  return (
    <a
      href={kakaoDirectionsTo({ name, lat: coord.lat, lng: coord.lng })}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      길찾기
    </a>
  );
}
