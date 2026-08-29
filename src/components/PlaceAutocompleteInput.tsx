"use client";

import { useEffect, useRef, useState } from "react";
import { ensureKakaoLoaded } from "@/lib/kakao";

/**
 * 카카오 장소 검색 자동완성이 붙은 텍스트 입력.
 * 타이핑하면(300ms 디바운스) 드롭다운으로 후보를 보여주고, 선택 시 onPick 으로 항목을 넘긴다.
 * SDK 로드 실패 시엔 그냥 평범한 입력창으로 동작한다.
 */
export function PlaceAutocompleteInput({
  value,
  onChange,
  onPick,
  id,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (item: kakao.maps.services.PlacesSearchResultItem) => void;
  id?: string;
  placeholder?: string;
  className?: string;
}) {
  const svcRef = useRef<kakao.maps.services.Places | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<
    kakao.maps.services.PlacesSearchResultItem[]
  >([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
    if (!appKey) return;
    let cancelled = false;
    ensureKakaoLoaded(appKey)
      .then(() => {
        if (!cancelled) svcRef.current = new window.kakao.maps.services.Places();
      })
      .catch((err: unknown) => {
        console.warn("[PlaceAutocompleteInput] 장소검색 로드 실패:", err);
      });
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const search = (keyword: string) => {
    const svc = svcRef.current;
    const q = keyword.trim();
    if (!svc || q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    svc.keywordSearch(
      q,
      (data, status) => {
        setSearching(false);
        if (status === window.kakao.maps.services.Status.OK && data.length > 0) {
          setSuggestions(data.slice(0, 6));
          setOpen(true);
        } else {
          setSuggestions([]);
          setOpen(false);
        }
      },
      { size: 6 },
    );
  };

  const handleChange = (v: string) => {
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 300);
  };

  return (
    <div className="relative" ref={boxRef}>
      <input
        id={id}
        className={className}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onKeyDown={(e) => {
          // 폼 안에서 Enter 로 실수 제출되는 것 방지
          if (e.key === "Enter") e.preventDefault();
        }}
        placeholder={placeholder}
        autoComplete="off"
      />
      {searching && (
        <span className="absolute right-3 top-2 text-xs text-muted">
          검색 중…
        </span>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-xl border border-border bg-white py-1 shadow-lg">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  onPick(s);
                  setOpen(false);
                  setSuggestions([]);
                }}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-stone-50"
              >
                <span className="text-sm font-medium">{s.place_name}</span>
                <span className="text-xs text-muted">
                  {s.road_address_name || s.address_name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
