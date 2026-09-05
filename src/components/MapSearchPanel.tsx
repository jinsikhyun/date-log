"use client";

import { useState } from "react";
import { type Place } from "@/lib/places";
import { categoryIcon, categoryStyle } from "@/lib/categories";
import { type KakaoCandidate } from "@/lib/kakaoSearch";

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" aria-hidden="true" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

function PinIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-border/70 bg-background/60 px-4 py-2 text-[11px] font-semibold text-muted-2">
      {children}
    </div>
  );
}

/** 우리 기록 한 줄 — 카테고리 뱃지 + 이름 + 주소·별점 + 상태칩 */
function SavedRow({ place, onSelect }: { place: Place; onSelect: () => void }) {
  const visited = place.status === "visited";
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 border-b border-border/70 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-black/[0.03]"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${categoryStyle(place.category)}`}
      >
        {categoryIcon(place.category)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{place.name}</span>
        <span className="block truncate text-xs text-muted-2">
          {place.address}
          {visited && place.rating != null && ` · ★ ${place.rating}`}
        </span>
      </span>

      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
          visited ? "bg-accent/10 text-accent" : "bg-amber-100 text-amber-800"
        }`}
      >
        {visited ? "다녀온 곳" : "가고 싶은 곳"}
      </span>
    </button>
  );
}

/** 아직 기록에 없는 곳 한 줄 — 점선 핀 + 이름 + 주소·거리 + 추가 */
function CandidateRow({
  candidate,
  expanded,
  saving,
  error,
  onSelect,
  onToggleAdd,
  onAdd,
}: {
  candidate: KakaoCandidate;
  expanded: boolean;
  saving: boolean;
  error: string | null;
  onSelect: () => void;
  onToggleAdd: () => void;
  onAdd: (status: "visited" | "wishlist") => void;
}) {
  return (
    <div className="border-b border-border/70 last:border-b-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-muted-2">
            <PinIcon className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{candidate.name}</span>
            <span className="block truncate text-xs text-muted-2">
              {candidate.address}
              {candidate.distanceMeters != null && ` · ${formatDistance(candidate.distanceMeters)}`}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={onToggleAdd}
          aria-expanded={expanded}
          className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-muted ring-1 ring-border transition-colors hover:text-accent hover:ring-accent/50"
        >
          {expanded ? "취소" : "추가"}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-3 pl-16">
          <div className="flex gap-2">
            {([["visited", "다녀온 곳"], ["wishlist", "가고 싶은 곳"]] as const).map(
              ([status, label]) => (
                <button
                  key={status}
                  type="button"
                  disabled={saving}
                  onClick={() => onAdd(status)}
                  className="flex-1 rounded-xl bg-foreground px-3 py-2 text-xs font-semibold text-background transition-colors disabled:opacity-60"
                >
                  {saving ? "저장 중…" : label}
                </button>
              ),
            )}
          </div>
          {error && (
            <p role="alert" className="mt-2 text-xs font-medium text-red-600">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function formatDistance(m: number): string {
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
}

export function MapSearchPanel({
  query,
  onQueryChange,
  onSubmit,
  loading,
  savedResults,
  candidates,
  outOfBounds,
  staleArea,
  onSearchArea,
  onSelectPlace,
  onSelectCandidate,
  onAddCandidate,
}: {
  query: string;
  onQueryChange: (next: string) => void;
  onSubmit: () => void;
  loading: boolean;
  savedResults: Place[];
  candidates: KakaoCandidate[];
  outOfBounds: boolean;
  staleArea: boolean;
  onSearchArea: () => void;
  onSelectPlace: (place: Place) => void;
  onSelectCandidate: (candidate: KakaoCandidate) => void;
  onAddCandidate: (
    candidate: KakaoCandidate,
    status: "visited" | "wishlist",
  ) => Promise<void>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const hasQuery = query.trim().length > 0;
  // 검색어가 없으면(예: "이 근처 둘러보기") 리스트를 아예 안 띄운다 — 후보는 지도의
  // 점선 마커로만 보여주고, 클릭하면 지도 아래 카드(이름·링크 포함)로 확인한다.
  const visibleSaved = hasQuery ? savedResults : [];
  const hasResults = hasQuery && (visibleSaved.length > 0 || candidates.length > 0);

  const handleAdd = async (c: KakaoCandidate, status: "visited" | "wishlist") => {
    setSavingId(c.kakaoId);
    setErrorId(null);
    setErrorMessage(null);
    try {
      await onAddCandidate(c, status);
      setExpandedId(null); // 성공했을 때만 접는다
    } catch (err) {
      setErrorId(c.kakaoId); // 펼친 채로 두고 그 행에 오류 표시
      setErrorMessage(
        err instanceof Error ? err.message : "저장하지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 rounded-full bg-card px-3 py-2 ring-1 ring-border focus-within:ring-accent">
        <SearchIcon className="h-4 w-4 shrink-0 text-muted-2" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={(e) => {
            setComposing(false);
            onQueryChange((e.target as HTMLInputElement).value);
          }}
          onKeyDown={(e) => {
            // 일부 브라우저(특히 모바일)는 조합 중 Enter 에서 isComposing 이 안 잡힐 때가 있어
            // composing state 를 같이 확인한다 — 조합 확정 Enter 가 검색 제출로 새는 것 방지.
            if (e.key === "Enter" && !composing && !e.nativeEvent.isComposing) onSubmit();
          }}
          placeholder="새로 가보고 싶은 곳 검색"
          aria-label="지도에서 장소 검색"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-2"
        />
        {hasQuery && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label="검색어 지우기"
            className="shrink-0 text-muted-2 transition-colors hover:text-accent"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" aria-hidden="true" className="h-3.5 w-3.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {staleArea && (
        <div className="mt-1.5 flex justify-center">
          <button
            type="button"
            onClick={onSearchArea}
            className="rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background shadow-sm"
          >
            {hasQuery ? "이 지역에서 다시 검색" : "이 근처 둘러보기"}
          </button>
        </div>
      )}

      {hasQuery && (loading || hasResults) && (
        <div className="mt-2 overflow-hidden rounded-2xl bg-card ring-1 ring-border">
          {loading && (
            <p className="px-4 py-6 text-center text-sm text-muted">찾는 중…</p>
          )}

          {!loading && visibleSaved.length > 0 && (
            <>
              <SectionLabel>우리 기록</SectionLabel>
              {visibleSaved.map((p) => (
                <SavedRow key={p.id} place={p} onSelect={() => onSelectPlace(p)} />
              ))}
            </>
          )}

          {!loading && candidates.length > 0 && (
            <>
              <SectionLabel>
                아직 기록에 없는 곳
                {outOfBounds && " · 지도 밖에서 찾았어요"}
              </SectionLabel>
              {candidates.map((c) => (
                <CandidateRow
                  key={c.kakaoId}
                  candidate={c}
                  expanded={expandedId === c.kakaoId}
                  saving={savingId === c.kakaoId}
                  error={errorId === c.kakaoId ? errorMessage : null}
                  onSelect={() => onSelectCandidate(c)}
                  onToggleAdd={() =>
                    setExpandedId((prev) => (prev === c.kakaoId ? null : c.kakaoId))
                  }
                  onAdd={(status) => void handleAdd(c, status)}
                />
              ))}
            </>
          )}
        </div>
      )}

      {!loading && hasQuery && !hasResults && (
        <p className="mt-2 rounded-2xl bg-card px-4 py-6 text-center text-sm text-muted ring-1 ring-border">
          맞는 곳을 찾지 못했어요. 지도를 옮기고 다시 검색해 보세요.
        </p>
      )}
    </div>
  );
}
