"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/lib/supabase/client";
import {
  categoryStyle,
  naverMapSearchUrl,
  placeInputToRow,
  type PlaceRowInput,
  statusBadgeClass,
  statusLabel,
} from "@/lib/places";
import { geocode, keywordSearchFirst } from "@/lib/kakao";
import { haversineKm } from "@/lib/courses";
import { PlaceAutocompleteInput } from "@/components/PlaceAutocompleteInput";
import { useAuth } from "@/components/AuthProvider";
import { useCategories } from "@/components/CategoriesProvider";
import { GptMark } from "@/components/GptMark";

export interface CourseFormInput {
  title: string;
  concept: string;
  placeIds: number[]; // 코스 내 순서대로
  // "이번 코스에만 추가"로 만든 장소들 — 코스 생성/저장 후 owning_course_id 를 채워야 함
  courseOnlyPlaceIds?: number[];
}

interface PickPlace {
  id: number;
  name: string;
  category: string;
  status: string; // 'visited' | 'wishlist'
  lat: number | null;
  lng: number | null;
  address: string;
  tags: string[];
}
type Coord = { lat: number; lng: number };

interface AiCourseRec {
  kakaoPlaceId: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  distanceMeters: number | null;
  reason: string;
  matchedTags: string[];
  kakaoMapUrl: string | null;
}

const NEAR_KM = 2; // "이 근처" 기준 반경
const AI_INITIAL_COUNT = 3;
const AI_MAX_COUNT = 5; // AI_RECOMMENDATION_HANDOFF.md §2

function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

const EMPTY: CourseFormInput = { title: "", concept: "", placeIds: [] };

const PICK_COLUMNS = "id, name, category, status, lat, lng, address, tags";

const fieldClass =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-accent";
const labelClass = "text-xs font-medium text-muted";

const blankRow = (over: Partial<PlaceRowInput>): PlaceRowInput => ({
  name: "",
  category: "",
  address: "",
  naver_map_link: "",
  kakao_map_link: "",
  rating: "",
  first_visit_date: "",
  description: "",
  image_url: "",
  image_captured_date: "",
  lat: "",
  lng: "",
  status: "visited",
  wanted_by_ids: [],
  added_by: "",
  tags: [],
  ...over,
});

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(
        status,
      )}`}
    >
      {statusLabel(status)}
    </span>
  );
}

export function CourseForm({
  onSubmit,
  onCancel,
  initial,
  courseId,
  submitLabel = "저장",
}: {
  onSubmit: (input: CourseFormInput) => Promise<void>;
  onCancel: () => void;
  initial?: CourseFormInput;
  courseId?: number; // 수정 화면이면 이 코스의 id (course_only 장소를 바로 연결)
  submitLabel?: string;
}) {
  const { authorName, coupleMembers } = useAuth();
  const { categories, orderNames } = useCategories();
  const base = initial ?? EMPTY;
  const [title, setTitle] = useState(base.title);
  const [concept, setConcept] = useState(base.concept);
  const [placeIds, setPlaceIds] = useState<number[]>(base.placeIds);
  const [allPlaces, setAllPlaces] = useState<PickPlace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 기준점(첫 장소). 한 번 정해지면 이 코스를 짜는 동안 고정 — 장소를 더 넣거나
  // 순서를 바꿔도 안 바뀜. 선택을 전부 비우면 초기화.
  const [anchorId, setAnchorId] = useState<number | null>(
    base.placeIds[0] ?? null,
  );
  const [anchorCoord, setAnchorCoord] = useState<Coord | null | undefined>(
    undefined,
  ); // undefined=해석 중, null=좌표 못 구함
  const [candCoords, setCandCoords] = useState<Map<number, Coord | null>>(
    new Map(),
  );
  const [farExpanded, setFarExpanded] = useState(false);
  const geoCache = useRef(new Map<number, Coord | null>());
  // "이번 코스에만 추가"로 만든 장소 중 아직 owning_course_id 가 안 채워진 것 (코스 생성 시)
  const [courseOnlyPending, setCourseOnlyPending] = useState<number[]>([]);

  // "+ 새 장소 추가" 미니 폼
  const [addingNew, setAddingNew] = useState(false);
  const [nName, setNName] = useState("");
  const [nCategory, setNCategory] = useState("");
  const [nAddress, setNAddress] = useState("");
  const [nLat, setNLat] = useState("");
  const [nLng, setNLng] = useState("");
  const [nKakao, setNKakao] = useState("");
  const [nWantedByIds, setNWantedByIds] = useState<string[]>([]);
  const [nSaving, setNSaving] = useState(false);
  const [nError, setNError] = useState<string | null>(null);

  // AI 추천 (코스에 장소가 1개 이상일 때부터) — 기본 접힘, 명시적으로 펼칠 때만 호출(유료 API)
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAll, setAiAll] = useState<AiCourseRec[] | null>(null);
  const [aiShowAll, setAiShowAll] = useState(false);
  const [aiAddingId, setAiAddingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // course_only 장소는 후보에서 제외. 단 수정 중인 코스 소유의 course_only 는
      // "코스 순서" 목록 렌더용으로 포함해야 한다.
      let q = supabase.from("places").select(PICK_COLUMNS);
      q = courseId
        ? q.or(`status.neq.course_only,owning_course_id.eq.${courseId}`)
        : q.neq("status", "course_only");
      const { data, error: qErr } = await q.order("name");
      if (cancelled) return;
      if (qErr) {
        setError(`장소 목록을 불러오지 못했어요: ${qErr.message}`);
      } else {
        setAllPlaces((data ?? []) as PickPlace[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const byId = useMemo(() => {
    const m = new Map<number, PickPlace>();
    allPlaces.forEach((p) => m.set(p.id, p));
    return m;
  }, [allPlaces]);

  /** 장소 좌표: 저장된 lat/lng 우선, 없으면 주소 지오코딩 (캐시) */
  const resolveCoord = useCallback(
    async (p: PickPlace): Promise<Coord | null> => {
      const cached = geoCache.current.get(p.id);
      if (cached !== undefined) return cached;
      let c: Coord | null = null;
      if (p.lat != null && p.lng != null) {
        c = { lat: p.lat, lng: p.lng };
      } else if (p.address) {
        try {
          c = await geocode(p.address);
        } catch {
          c = null;
        }
      }
      geoCache.current.set(p.id, c);
      return c;
    },
    [],
  );

  // 기준점 좌표 해석
  useEffect(() => {
    if (anchorId == null) return;
    const p = byId.get(anchorId);
    if (!p) return;
    let cancelled = false;
    (async () => {
      const c = await resolveCoord(p);
      if (!cancelled) setAnchorCoord(c);
    })();
    return () => {
      cancelled = true;
    };
  }, [anchorId, byId, resolveCoord]);

  // 기준점이 잡히면 후보 장소들 좌표를 채워 거리 계산
  useEffect(() => {
    if (!anchorCoord || allPlaces.length === 0) return;
    let cancelled = false;
    (async () => {
      const m = new Map<number, Coord | null>();
      for (const p of allPlaces) {
        m.set(p.id, await resolveCoord(p));
      }
      if (!cancelled) setCandCoords(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [anchorCoord, allPlaces, resolveCoord]);

  const selected = placeIds
    .map((id) => byId.get(id))
    .filter((p): p is PickPlace => p != null);
  // 후보 = 아직 안 담긴 장소. course_only 는 절대 후보에 안 뜬다(오직 소유 코스 안에서만).
  const available = allPlaces.filter(
    (p) => !placeIds.includes(p.id) && p.status !== "course_only",
  );

  // 기준점 + 거리 계산이 준비됐는지
  const split = anchorId != null && !!anchorCoord && candCoords.size > 0;

  const distKm = (id: number): number | null => {
    const c = candCoords.get(id);
    if (!c || !anchorCoord) return null;
    return haversineKm(anchorCoord, c);
  };

  const nearAvail = split
    ? available.filter((p) => {
        const d = distKm(p.id);
        return d != null && d <= NEAR_KM;
      })
    : [];
  const nearIds = new Set(nearAvail.map((p) => p.id));
  const farAvail = split
    ? available.filter((p) => !nearIds.has(p.id)) // 2km 초과 + 좌표 못 구한 곳
    : [];

  /** 장소 목록을 카테고리 순서대로 그룹핑 (데이터 있는 카테고리만) */
  const groupByCat = (list: PickPlace[]) => {
    const cats = orderNames(list.map((p) => p.category));
    return cats
      .map((cat) => ({ cat, items: list.filter((p) => p.category === cat) }))
      .filter((g) => g.items.length > 0);
  };

  const addToCourse = (id: number) => {
    setPlaceIds((ids) => [...ids, id]);
    setAnchorId((cur) => cur ?? id); // 첫 장소면 기준점, 이미 있으면 유지
  };

  const removeFromCourse = (id: number) => {
    const next = placeIds.filter((x) => x !== id);
    setPlaceIds(next);
    if (next.length === 0) {
      setAnchorId(null);
      setAnchorCoord(undefined);
      setCandCoords(new Map());
      setFarExpanded(false);
    }
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= placeIds.length) return;
    setPlaceIds((ids) => {
      const nx = [...ids];
      const [x] = nx.splice(from, 1);
      nx.splice(to, 0, x);
      return nx;
    });
  };

  const resetNewForm = () => {
    setAddingNew(false);
    setNName("");
    setNCategory("");
    setNAddress("");
    setNLat("");
    setNLng("");
    setNKakao("");
    setNWantedByIds([]);
    setNError(null);
  };

  /** mode: "wishlist" = 가고 싶은 곳에도 추가 / "course_only" = 이번 코스에만 */
  const saveNewPlace = async (mode: "wishlist" | "course_only") => {
    setNError(null);
    if (!nName.trim() || !nCategory || !nAddress.trim()) {
      setNError("장소명, 카테고리, 주소를 입력해 주세요.");
      return;
    }
    if (!authorName) {
      setNError("프로필 이름이 없어요. 설정에서 이름을 먼저 정해 주세요.");
      return;
    }
    const courseOnly = mode === "course_only";
    setNSaving(true);
    try {
      // 좌표가 없으면 저장 전에 채운다 (주소 → 지오코딩, 실패 시 장소명 검색).
      // 코스 동선 지도가 이 장소를 그릴 수 있도록.
      let lat = nLat;
      let lng = nLng;
      if ((!lat || !lng) && nAddress.trim()) {
        const hit =
          (await geocode(nAddress).catch(() => null)) ??
          (await keywordSearchFirst(nName).catch(() => null));
        if (hit) {
          lat = String(hit.lat);
          lng = String(hit.lng);
        }
      }
      const { data, error: insErr } = await supabase
        .from("places")
        .insert({
          ...placeInputToRow(
            blankRow({
              name: nName,
              category: nCategory,
              address: nAddress,
              lat,
              lng,
              kakao_map_link: nKakao,
              status: courseOnly ? "course_only" : "wishlist",
              wanted_by_ids: courseOnly ? [] : nWantedByIds,
              added_by: authorName,
            }),
          ),
          via_course: courseOnly,
          // 수정 화면이면 코스 id 를 바로 연결, 생성 화면이면 저장 후 채운다
          owning_course_id: courseOnly ? (courseId ?? null) : null,
        })
        .select(PICK_COLUMNS)
        .single();
      if (insErr) throw new Error(insErr.message);

      const created = data as PickPlace;
      setAllPlaces((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      addToCourse(created.id);
      if (courseOnly && courseId == null) {
        setCourseOnlyPending((prev) => [...prev, created.id]);
      }
      resetNewForm();
    } catch (err) {
      setNError(
        err instanceof Error ? err.message : "새 장소 저장에 실패했어요.",
      );
    } finally {
      setNSaving(false);
    }
  };

  /** AI 추천 — 코스의 마지막 장소를 기준점으로 가까운 후보를 찾고, 코스 전체 맥락으로 재정렬한다. */
  const loadAiRecommendations = useCallback(async () => {
    if (selected.length === 0) return;
    const origin = selected[selected.length - 1];
    setAiLoading(true);
    setAiError(null);
    setAiShowAll(false);
    try {
      const coord = await resolveCoord(origin);
      if (!coord) {
        setAiError("마지막 장소의 좌표를 찾을 수 없어서 추천을 만들 수 없어요.");
        return;
      }
      const candRes = await fetch("/api/kakao-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: origin.category,
          tags: origin.tags,
          lat: coord.lat,
          lng: coord.lng,
          excludeAddress: origin.address,
          radiusMeters: NEAR_KM * 1000,
          limit: 12,
        }),
      });
      const candJson = await candRes.json();
      if (!candRes.ok) {
        throw new Error(candJson?.error || "근처 후보를 가져오지 못했어요.");
      }
      const candidates = candJson.candidates ?? [];
      if (candidates.length === 0) {
        setAiAll([]);
        return;
      }

      const recRes = await fetch("/api/ai-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "course",
          place: {
            name: origin.name,
            category: origin.category,
            address: origin.address,
            tags: origin.tags,
            lat: coord.lat,
            lng: coord.lng,
          },
          courseStops: selected.map((p) => ({
            name: p.name,
            category: p.category,
            tags: p.tags,
          })),
          candidates,
          count: AI_MAX_COUNT,
        }),
      });
      const recJson = await recRes.json();
      if (!recRes.ok) {
        throw new Error(recJson?.error || "추천을 가져오지 못했어요.");
      }
      setAiAll(recJson.recommendations ?? []);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "추천을 가져오지 못했어요.");
    } finally {
      setAiLoading(false);
    }
  }, [selected, resolveCoord]);

  const toggleAi = () => {
    setAiOpen((o) => !o);
    if (!aiOpen && aiAll === null && !aiLoading) void loadAiRecommendations();
  };

  /** AI 추천 카드의 "+ 코스에 추가" — 새 장소로 저장(이번 코스에만) 후 바로 코스에 담는다. */
  const addAiCandidate = async (rec: AiCourseRec) => {
    if (!authorName) {
      setAiError("프로필 이름이 없어요. 설정에서 이름을 먼저 정해 주세요.");
      return;
    }
    setAiAddingId(rec.kakaoPlaceId);
    setAiError(null);
    try {
      const { data, error: insErr } = await supabase
        .from("places")
        .insert({
          ...placeInputToRow(
            blankRow({
              name: rec.name,
              category: rec.category,
              address: rec.address,
              lat: String(rec.lat),
              lng: String(rec.lng),
              kakao_map_link: rec.kakaoMapUrl ?? "",
              status: "course_only",
              added_by: authorName,
              // AI가 이 후보를 고른 근거(matchedTags)를 그대로 저장 — 다음 추천 때
              // "커플이 선호해온 태그"로 다시 프롬프트에 들어가 취향을 좁혀준다.
              tags: rec.matchedTags,
            }),
          ),
          via_course: true,
          owning_course_id: courseId ?? null,
        })
        .select(PICK_COLUMNS)
        .single();
      if (insErr) throw new Error(insErr.message);

      const created = data as PickPlace;
      setAllPlaces((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      addToCourse(created.id);
      if (courseId == null) {
        setCourseOnlyPending((prev) => [...prev, created.id]);
      }
      // 추가된 후보는 목록에서 지워서 중복 클릭을 막는다.
      setAiAll((prev) => (prev ?? []).filter((r) => r.kakaoPlaceId !== rec.kakaoPlaceId));
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : "장소 저장에 실패했어요.",
      );
    } finally {
      setAiAddingId(null);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("코스 이름은 필수예요.");
      return;
    }
    if (placeIds.length === 0) {
      setError("장소를 하나 이상 추가해 주세요.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        title,
        concept,
        placeIds,
        courseOnlyPlaceIds: courseOnlyPending,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했어요.");
    } finally {
      setSaving(false);
    }
  };

  // 렌더 헬퍼 (중첩 컴포넌트 아님 — 매 렌더 새로 만들지 않도록 함수로 호출)
  const pickButton = (p: PickPlace) => (
    <button
      key={p.id}
      type="button"
      onClick={() => addToCourse(p.id)}
      className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600 transition-colors hover:bg-accent/10 hover:text-accent"
    >
      + {p.name}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${statusBadgeClass(
          p.status,
        )}`}
      >
        {statusLabel(p.status)}
      </span>
    </button>
  );

  const categoryGroups = (list: PickPlace[]) => (
    <div className="flex flex-col gap-3">
      {groupByCat(list).map((g) => (
        <div key={g.cat} className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold text-muted">{g.cat}</p>
          <div className="flex flex-wrap gap-1.5">
            {g.items.map(pickButton)}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-8 grid gap-4 rounded-3xl bg-card p-6 ring-1 ring-border/70"
    >
      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="cf-title">
          코스 이름 *
        </label>
        <input
          id="cf-title"
          className={fieldClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 서촌 골목 산책 코스"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="cf-concept">
          컨셉 / 설명
        </label>
        <textarea
          id="cf-concept"
          className={`${fieldClass} min-h-20 resize-y`}
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          placeholder="어떤 하루를 보내는 코스인지 한두 문장으로"
        />
      </div>

      {/* 선택된 장소 (순서대로) */}
      <div className="flex flex-col gap-2">
        <span className={labelClass}>코스 순서 ({selected.length})</span>
        {selected.length === 0 ? (
          <p className="rounded-xl bg-stone-50 px-3 py-4 text-center text-xs text-muted">
            아래에서 장소를 눌러 추가하세요.
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {selected.map((p, i) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${categoryStyle(p.category)}`}>{p.category}</span>
                <StatusBadge status={p.status} />
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, i - 1)}
                    disabled={i === 0}
                    aria-label="위로"
                    className="rounded-md px-1.5 py-0.5 text-sm text-stone-500 hover:bg-stone-100 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, i + 1)}
                    disabled={i === selected.length - 1}
                    aria-label="아래로"
                    className="rounded-md px-1.5 py-0.5 text-sm text-stone-500 hover:bg-stone-100 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeFromCourse(p.id)}
                    aria-label="빼기"
                    className="rounded-md px-1.5 py-0.5 text-sm text-red-500 hover:bg-red-50"
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* AI 추천 — 코스에 장소가 1개 이상 담긴 시점부터. 기본 접힘. */}
      {selected.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={toggleAi}
            aria-expanded={aiOpen}
            className="group flex w-full items-center justify-between rounded-2xl border border-[#10a37f]/25 bg-[linear-gradient(110deg,#f0faf6_0%,#fffaf2_72%)] px-4 py-3 text-left shadow-[0_10px_24px_-22px_rgba(16,163,127,0.8)] transition duration-200 hover:border-[#10a37f]/45"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#10a37f] text-white shadow-sm">
                <GptMark className="h-[18px] w-[18px]" />
              </span>
              <span>
                <span className="block text-xs font-bold text-foreground sm:text-sm">
                  AI 추천 · 다음은 어디로 갈까요?
                </span>
                <span className="mt-0.5 block text-[10px] font-medium text-[#39816f]">
                  우리의 취향을 담은 추천 · GPT-5.6 Luna
                </span>
              </span>
            </span>
            <span
              aria-hidden
              className={`ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/80 text-[10px] text-[#0d8065] ring-1 ring-[#10a37f]/15 transition-transform ${aiOpen ? "rotate-180" : ""}`}
            >
              ▾
            </span>
          </button>

          {aiOpen && (
            <div className="rounded-2xl border border-[#10a37f]/20 bg-[linear-gradient(180deg,#fbfffd_0%,#ffffff_26%)] p-3 shadow-[0_12px_28px_-26px_rgba(16,163,127,0.75)]">
              {aiLoading && (
                <p className="text-xs font-medium text-[#39816f]">✦ 코스에 어울리는 장소를 찾는 중…</p>
              )}
              {aiError && (
                <p className="text-xs font-medium text-red-600">{aiError}</p>
              )}
              {!aiLoading && !aiError && aiAll && aiAll.length === 0 && (
                <p className="text-xs text-muted">
                  주변에서 추천할 만한 새 장소를 찾지 못했어요.
                </p>
              )}

              {aiAll && aiAll.length > 0 && (
                <>
                  <ul className="flex flex-col gap-2">
                    {aiAll
                      .slice(0, aiShowAll ? AI_MAX_COUNT : AI_INITIAL_COUNT)
                      .map((r) => (
                        <li
                          key={r.kakaoPlaceId}
                          className="flex flex-col gap-2 rounded-xl border border-[#10a37f]/15 bg-white px-3 py-3 shadow-[0_8px_20px_-20px_rgba(16,163,127,0.8)]"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${categoryStyle(
                                r.category,
                              )}`}
                            >
                              {r.category}
                            </span>
                            <span className="shrink-0 rounded-full bg-[#10a37f] px-2 py-0.5 text-[10px] font-semibold text-white">
                              ✦ AI
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                              {r.name}
                            </span>
                            {r.distanceMeters != null && (
                              <span className="shrink-0 text-[11px] text-muted">
                                {fmtDist(r.distanceMeters)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs leading-relaxed text-foreground/70">
                            {r.reason}
                          </p>
                          <div className="flex items-center justify-between gap-2">
                            <a
                              href={naverMapSearchUrl(r.name, r.address)}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`${r.name} 네이버 지도 정보`}
                              className="rounded-full bg-[#03C75A] px-3 py-1 text-[11px] font-semibold text-white transition hover:brightness-95"
                            >
                              정보 ↗
                            </a>
                            <button
                              type="button"
                              onClick={() => void addAiCandidate(r)}
                              disabled={aiAddingId === r.kakaoPlaceId}
                              className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                            >
                              {aiAddingId === r.kakaoPlaceId
                                ? "추가 중…"
                                : "+ 코스에 추가"}
                            </button>
                          </div>
                        </li>
                      ))}
                  </ul>
                  <div className="mt-2 flex items-center justify-center gap-2">
                    {!aiShowAll && aiAll.length > AI_INITIAL_COUNT && (
                      <button
                        type="button"
                        onClick={() => setAiShowAll(true)}
                        className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-medium text-stone-600 hover:bg-stone-200"
                      >
                        더보기
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void loadAiRecommendations()}
                      disabled={aiLoading}
                      className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-medium text-stone-600 hover:bg-stone-200 disabled:opacity-60"
                    >
                      다시 추천받기
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* 추가할 장소 (다녀온 곳 + 위시리스트 전부, 카테고리별 그룹) */}
      <div className="flex flex-col gap-3">
        <span className={labelClass}>장소 추가</span>

        {anchorId != null && !split && available.length > 0 && (
          <p className="text-[11px] text-muted">이 근처 장소 계산 중…</p>
        )}

        {split ? (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold text-foreground/80">
                이 근처{" "}
                <span className="font-medium text-muted">
                  ({NEAR_KM}km 이내 · {nearAvail.length})
                </span>
              </p>
              {nearAvail.length === 0 ? (
                <p className="rounded-xl bg-stone-50 px-3 py-3 text-center text-xs text-muted">
                  기준점 {NEAR_KM}km 안에 아직 안 담은 장소가 없어요.
                </p>
              ) : (
                categoryGroups(nearAvail)
              )}
            </div>

            {farAvail.length > 0 && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setFarExpanded((v) => !v)}
                  className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-xs font-medium text-muted transition-colors hover:text-accent"
                >
                  <span>먼 지역 장소 더보기 ({farAvail.length}개)</span>
                  <span
                    className={`transition-transform ${
                      farExpanded ? "rotate-180" : ""
                    }`}
                  >
                    ▾
                  </span>
                </button>
                {farExpanded && categoryGroups(farAvail)}
              </div>
            )}
          </>
        ) : (
          categoryGroups(available)
        )}

        {/* + 새 장소 추가 — 항상 맨 마지막 */}
        {!addingNew && (
          <div>
            <button
              type="button"
              onClick={() => setAddingNew(true)}
              className="rounded-full border border-dashed border-accent/60 px-3 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent/10"
            >
              + 새 장소 추가
            </button>
          </div>
        )}

        {addingNew && (
          <div className="mt-1 flex flex-col gap-2 rounded-xl border border-border bg-stone-50 p-3">
            <p className="text-xs text-muted">
              새 장소가 이 코스에 바로 담겨요. 저장 방식은 아래에서 골라요.
            </p>
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="cf-new-name">
                장소명 *
              </label>
              <PlaceAutocompleteInput
                id="cf-new-name"
                className={fieldClass}
                value={nName}
                placeholder="예: 런던 베이글 뮤지엄"
                onChange={setNName}
                onPick={(item) => {
                  setNName(item.place_name);
                  setNAddress(item.road_address_name || item.address_name);
                  setNLat(item.y);
                  setNLng(item.x);
                  setNKakao(item.place_url || "");
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="cf-new-cat">
                카테고리 *
              </label>
              <select
                id="cf-new-cat"
                className={fieldClass}
                value={nCategory}
                onChange={(e) => setNCategory(e.target.value)}
              >
                <option value="">선택</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="cf-new-addr">
                주소 *
              </label>
              <input
                id="cf-new-addr"
                className={fieldClass}
                value={nAddress}
                onChange={(e) => setNAddress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
                placeholder="서울 종로구 ..."
              />
            </div>
            {coupleMembers.some((m) => m.display_name?.trim()) && (
              <div className="flex flex-col gap-1.5">
                <span className={labelClass}>누가 가고 싶어요?</span>
                <div className="flex flex-wrap gap-2">
                  {coupleMembers.filter((m) => m.display_name?.trim()).map((m) => {
                    const on = nWantedByIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setNWantedByIds((ids) =>
                          on ? ids.filter((id) => id !== m.id) : [...ids, m.id]
                        )}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 transition-colors ${on ? "bg-accent/10 text-accent ring-accent/50" : "bg-white text-stone-500 ring-border hover:text-accent"}`}
                      >
                        {m.display_name}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted">
                  ‘가고 싶은 곳에 추가’할 때 표시와 ‘누가’ 필터에 반영돼요.
                </p>
              </div>
            )}
            {nError && (
              <p className="text-xs font-medium text-red-600">{nError}</p>
            )}
            <p className="text-[11px] text-muted">이 장소를 어떻게 저장할까요?</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => saveNewPlace("wishlist")}
                disabled={nSaving}
                className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                {nSaving ? "저장 중…" : "가고 싶은 곳에 추가"}
              </button>
              <button
                type="button"
                onClick={() => saveNewPlace("course_only")}
                disabled={nSaving}
                className="rounded-full bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                {nSaving ? "저장 중…" : "이번 코스에만 추가"}
              </button>
              <button
                type="button"
                onClick={resetNewForm}
                disabled={nSaving}
                className="rounded-full bg-stone-200 px-4 py-1.5 text-xs font-medium text-stone-600"
              >
                취소
              </button>
            </div>
            <p className="text-[11px] text-muted">
              · <b>가고 싶은 곳</b>: /가고싶은 곳 목록에도 뜨고, 코스를 지워도
              남아요.
              <br />· <b>이번 코스에만</b>: 이 코스 안에서만 보이고, 코스를
              지우면 같이 삭제돼요.
            </p>
          </div>
        )}
      </div>

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
        >
          {saving ? "저장 중…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-full bg-stone-100 px-5 py-2 text-sm font-medium text-stone-600"
        >
          취소
        </button>
      </div>
    </form>
  );
}
