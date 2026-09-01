"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  geocode,
  kakaoDirectionsFromTo,
  keywordSearchFirst,
} from "@/lib/kakao";
import { categoryStyle, statusBadgeClass, statusLabel } from "@/lib/places";
import {
  type CourseWithStops,
  haversineKm,
  sortedStops,
  walkMinutes,
} from "@/lib/courses";
import { CourseForm, type CourseFormInput } from "@/components/CourseForm";
import { CourseMap, type MapStop } from "@/components/CourseMap";
import { ShareCourseButton } from "@/components/ShareCourseButton";

const COURSE_DETAIL_SELECT =
  "id, title, concept, created_at, course_places(id, order_index, places(id, name, category, address, image_url, lat, lng, status))";

const POLICY_HINT =
  "저장 권한이 없거나 세션이 만료됐어요. 다시 로그인하거나 커플 연결 상태를 확인해 주세요.";

type Coord = { lat: number; lng: number };

function Connector({
  a,
  b,
  loading,
  fromName,
  toName,
}: {
  a: Coord | null;
  b: Coord | null;
  loading: boolean;
  fromName: string;
  toName: string;
}) {
  if (loading) {
    return <div className="py-1.5 pl-4 text-xs text-muted">↓ 계산 중…</div>;
  }
  if (!a || !b) {
    return (
      <div className="py-1.5 pl-4 text-xs text-muted">
        ↓ 거리 계산 불가 (좌표 없음)
      </div>
    );
  }
  const km = haversineKm(a, b);
  return (
    <div className="flex items-center gap-2 py-1.5 pl-4 text-xs text-muted">
      <span aria-hidden>↓</span>
      <span>
        직선거리 {km.toFixed(km < 1 ? 2 : 1)}km · 도보 약 {walkMinutes(km)}분
      </span>
      <a
        href={kakaoDirectionsFromTo(
          { name: fromName, lat: a.lat, lng: a.lng },
          { name: toName, lat: b.lat, lng: b.lng },
        )}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full bg-background px-2 py-0.5 font-medium text-muted-2 transition-colors hover:brightness-95"
      >
        길찾기
      </a>
    </div>
  );
}

export function CourseDetail({ id }: { id: number }) {
  const router = useRouter();
  const [course, setCourse] = useState<CourseWithStops | null>(null);
  const [coords, setCoords] = useState<Map<number, Coord | null>>(new Map());
  const [coordsLoading, setCoordsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setError("코스를 찾을 수 없어요.");
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      const { data, error: qErr } = await supabase
        .from("courses")
        .select(COURSE_DETAIL_SELECT)
        .eq("id", id)
        .single();
      if (cancelled) return;

      if (qErr || !data) {
        setError(
          qErr?.code === "PGRST116"
            ? "코스를 찾을 수 없어요."
            : `코스를 불러오지 못했어요: ${qErr?.message ?? "알 수 없는 오류"}`,
        );
        setLoading(false);
        return;
      }

      const c = data as unknown as CourseWithStops;
      setCourse(c);
      setLoading(false);

      // 좌표: 저장된 lat/lng 우선, 없으면 주소 지오코딩
      const stops = sortedStops(c);
      if (stops.length === 0) return;
      setCoordsLoading(true);
      try {
        const entries = await Promise.all(
          stops.map(async (s) => {
            const p = s.places!;
            if (p.lat != null && p.lng != null) {
              return [p.id, { lat: p.lat, lng: p.lng }] as const;
            }
            // 주소 지오코딩 → 실패 시 장소명 검색 폴백
            const hit =
              (await geocode(p.address).catch(() => null)) ??
              (await keywordSearchFirst(p.name).catch(() => null));
            return [p.id, hit] as const;
          }),
        );
        if (!cancelled) setCoords(new Map(entries));
      } finally {
        if (!cancelled) setCoordsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleEdit = useCallback(
    async (input: CourseFormInput) => {
      const { data: upd, error: upErr } = await supabase
        .from("courses")
        .update({
          title: input.title.trim(),
          concept: input.concept.trim() || null,
        })
        .eq("id", id)
        .select("id");
      if (upErr) throw new Error(upErr.message);
      if (!upd || upd.length === 0) {
        throw new Error(`수정이 반영되지 않았어요. ${POLICY_HINT}`);
      }

      // 순서/구성은 통째로 교체 (지웠다 다시 넣기)
      const { error: delErr } = await supabase
        .from("course_places")
        .delete()
        .eq("course_id", id);
      if (delErr) throw new Error(delErr.message);

      const rows = input.placeIds.map((place_id, i) => ({
        course_id: id,
        place_id,
        order_index: i,
      }));
      const { error: insErr } = await supabase
        .from("course_places")
        .insert(rows);
      if (insErr) throw new Error(insErr.message);

      // "이번 코스에만" 장소는 saveNewPlace 가 courseId 로 바로 연결하지만, 혹시 대비
      if (input.courseOnlyPlaceIds && input.courseOnlyPlaceIds.length > 0) {
        await supabase
          .from("places")
          .update({ owning_course_id: id })
          .in("id", input.courseOnlyPlaceIds);
      }

      // 임베딩 + 좌표를 다시 계산하는 게 간단해서 새로고침
      window.location.reload();
    },
    [id],
  );

  const handleDelete = useCallback(async () => {
    if (!course) return;
    const ok = window.confirm(
      `'${course.title}' 코스를 삭제할까요?\n코스에 담긴 장소 연결도 함께 지워지지만, 장소 자체는 남아요. 되돌릴 수 없어요.`,
    );
    if (!ok) return;

    setDeleting(true);
    const { data, error: delErr } = await supabase
      .from("courses")
      .delete()
      .eq("id", id)
      .select("id");

    if (delErr) {
      setDeleting(false);
      window.alert(`삭제하지 못했어요: ${delErr.message}`);
      return;
    }
    if (!data || data.length === 0) {
      setDeleting(false);
      window.alert(`삭제되지 않았어요. ${POLICY_HINT}`);
      return;
    }
    router.push("/courses");
  }, [id, course, router]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-[20px] bg-[#efe7d6]" />
        <div className="h-64 animate-pulse rounded-[20px] bg-[#efe7d6]" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="rounded-[20px] bg-card p-10 text-center ring-1 ring-border">
        <p className="text-sm text-muted">{error ?? "코스를 찾을 수 없어요."}</p>
        <Link
          href="/courses"
          className="mt-5 inline-block rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white"
        >
          코스 목록으로
        </Link>
      </div>
    );
  }

  const stops = sortedStops(course);
  const formInitial: CourseFormInput = {
    title: course.title,
    concept: course.concept ?? "",
    placeIds: stops.map((s) => s.places!.id),
  };
  const mapStops: MapStop[] = stops
    .map((s) => {
      const p = s.places!;
      const c = coords.get(p.id);
      return c
        ? {
            id: p.id,
            name: p.name,
            category: p.category,
            status: p.status,
            lat: c.lat,
            lng: c.lng,
          }
        : null;
    })
    .filter((x): x is MapStop => x != null);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/courses"
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-accent"
        >
          ← 코스 목록
        </Link>
        {!editing && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-full bg-background px-3.5 py-1.5 text-sm font-medium text-muted-2 transition-colors hover:brightness-95"
            >
              수정
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-full bg-red-50 px-3.5 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60"
            >
              {deleting ? "삭제 중…" : "삭제"}
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <CourseForm
          initial={formInitial}
          courseId={id}
          submitLabel="수정 저장"
          onSubmit={handleEdit}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <header className="rounded-[20px] bg-card p-6 ring-1 ring-border sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-extrabold tracking-[-0.02em]">{course.title}</h1>
            {stops.length > 0 && (
              <div className="shrink-0 pt-1">
                <ShareCourseButton
                  title={course.title}
                  concept={course.concept}
                  stops={stops.map((s) => ({
                    id: s.places!.id,
                    name: s.places!.name,
                    category: s.places!.category,
                  }))}
                  coords={coords}
                />
              </div>
            )}
          </div>
          {course.concept && (
            <p className="mt-2 text-sm leading-relaxed text-foreground/80">
              {course.concept}
            </p>
          )}
          <p className="mt-3 text-xs text-muted">장소 {stops.length}곳</p>
        </header>
      )}

      {!editing && (
        <>
          {/* 동선 지도 — 좌표 있는 장소가 2곳 이상이면 그것만으로도 그린다 */}
          {stops.length >= 2 &&
            (coordsLoading && mapStops.length < 2 ? (
              <div className="flex h-[360px] items-center justify-center rounded-[20px] bg-[#e6decf] text-sm text-muted-2 sm:h-[440px]">
                동선 계산 중…
              </div>
            ) : mapStops.length >= 2 ? (
              <div className="space-y-2">
                <CourseMap stops={mapStops} />
                {mapStops.length < stops.length && (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                    일부 장소({stops.length - mapStops.length}곳)는 위치 정보가
                    없어 동선에서 제외됐어요.
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
                좌표를 찾은 장소가 부족해 동선을 그릴 수 없어요. 각 장소 상세에서
                주소를 확인해 주세요.
              </p>
            ))}

          {/* 순서 + 거리/시간 */}
          <section className="space-y-1">
            <h2 className="mb-3 text-lg font-bold">코스 순서</h2>
            {stops.length === 0 ? (
              <p className="rounded-[20px] bg-card p-10 text-center text-sm text-muted-2 ring-1 ring-border">
                이 코스에 담긴 장소가 없어요. “수정”에서 장소를 추가해 보세요.
              </p>
            ) : (
              stops.map((s, i) => {
                const p = s.places!;
                return (
                  <Fragment key={p.id}>
                    <article className="flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-border">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
                        {i + 1}
                      </span>
                      {p.image_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={p.image_url}
                          alt={p.name}
                          loading="lazy"
                          className="h-12 w-12 shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <span className="h-12 w-12 shrink-0 rounded-xl bg-gradient-to-br from-stone-200 to-stone-300" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {p.status === "course_only" ? (
                            // 코스 전용 장소는 상세 페이지가 없음 (오직 이 코스 안에서만)
                            <span className="truncate font-semibold">
                              {p.name}
                            </span>
                          ) : (
                            <Link
                              href={`/places/${p.id}`}
                              className="truncate font-semibold transition-colors hover:text-accent"
                            >
                              {p.name}
                            </Link>
                          )}
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${categoryStyle(
                              p.category,
                            )}`}
                          >
                            {p.category}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(
                              p.status,
                            )}`}
                          >
                            {statusLabel(p.status)}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted">{p.address}</p>
                      </div>
                    </article>
                    {i < stops.length - 1 && (
                      <Connector
                        a={coords.get(p.id) ?? null}
                        b={coords.get(stops[i + 1].places!.id) ?? null}
                        loading={coordsLoading}
                        fromName={p.name}
                        toName={stops[i + 1].places!.name}
                      />
                    )}
                  </Fragment>
                );
              })
            )}
          </section>
        </>
      )}
    </div>
  );
}
