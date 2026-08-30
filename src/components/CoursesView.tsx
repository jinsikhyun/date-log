"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  type CourseWithStops,
  sortedStops,
} from "@/lib/courses";
import { CourseForm, type CourseFormInput } from "@/components/CourseForm";

const COURSE_LIST_SELECT =
  "id, title, concept, created_at, course_places(order_index, places(id, name, category, address, image_url, lat, lng, status))";

const POLICY_HINT =
  "저장 권한이 없거나 세션이 만료됐어요. 다시 로그인하거나 커플 연결 상태를 확인해 주세요.";

function coverImage(course: CourseWithStops): string | null {
  const stops = sortedStops(course);
  return stops.find((s) => s.places?.image_url)?.places?.image_url ?? null;
}

export function CoursesView() {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseWithStops[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("courses")
        .select(COURSE_LIST_SELECT)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("[courses] 조회 실패:", error);
        const missing =
          error.code === "PGRST205" || /does not exist/i.test(error.message);
        setLoadError(
          missing
            ? "courses 테이블이 아직 없어요. supabase/courses.sql 을 Supabase SQL Editor 에서 실행하세요."
            : `코스를 불러오지 못했어요: ${error.message}`,
        );
      } else {
        setCourses((data ?? []) as unknown as CourseWithStops[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreate = useCallback(async (input: CourseFormInput) => {
    const { data: course, error: cErr } = await supabase
      .from("courses")
      .insert({ title: input.title.trim(), concept: input.concept.trim() || null })
      .select("id, title, concept, created_at")
      .single();

    if (cErr) {
      console.error("[courses] 생성 실패:", cErr);
      throw new Error(cErr.message);
    }
    if (!course) throw new Error(`코스가 저장되지 않았어요. ${POLICY_HINT}`);

    const rows = input.placeIds.map((place_id, i) => ({
      course_id: course.id,
      place_id,
      order_index: i,
    }));
    const { data: cpData, error: cpErr } = await supabase
      .from("course_places")
      .insert(rows)
      .select("id");

    if (cpErr) {
      console.error("[course_places] 저장 실패:", cpErr);
      // 코스만 만들어지고 장소가 안 붙는 어중간한 상태 방지 — 되돌린다
      await supabase.from("courses").delete().eq("id", course.id);
      throw new Error(cpErr.message);
    }
    if (!cpData || cpData.length === 0) {
      await supabase.from("courses").delete().eq("id", course.id);
      throw new Error(`코스 장소가 저장되지 않았어요. ${POLICY_HINT}`);
    }

    // 방금 만든 코스 상세로 이동 (임베딩/좌표는 거기서 정확히 로드)
    setShowForm(false);
    router.push(`/courses/${course.id}`);
  }, [router]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">데이트 코스</h1>
          <p className="mt-1.5 text-sm text-muted">
            {loading ? "불러오는 중…" : `코스 ${courses.length}개`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-foreground px-4 py-1.5 text-sm font-semibold text-background"
        >
          {showForm ? "폼 닫기" : "코스 만들기"}
        </button>
      </div>

      {showForm && (
        <CourseForm
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
          submitLabel="코스 저장"
        />
      )}

      {loadError && (
        <div className="mb-6 rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-56 animate-pulse rounded-3xl bg-stone-200/70"
            />
          ))}
        </div>
      ) : courses.length === 0 && !loadError ? (
        <p className="rounded-3xl bg-card p-12 text-center text-sm text-muted ring-1 ring-border/70">
          아직 만든 코스가 없어요. “코스 만들기”로 첫 코스를 짜보세요.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {courses.map((course) => {
            const count = sortedStops(course).length;
            const cover = coverImage(course);
            return (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                className="group flex flex-col overflow-hidden rounded-3xl bg-card ring-1 ring-border/70 transition duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-accent/10"
              >
                <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-stone-200 to-stone-300">
                  {cover ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={cover}
                      alt={course.title}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-stone-400">
                      사진 준비 중
                    </span>
                  )}
                  <span className="absolute left-4 top-4 z-[1] rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-foreground/80">
                    장소 {count}곳
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-5">
                  <h2 className="text-lg font-bold leading-snug">
                    {course.title}
                  </h2>
                  {course.concept && (
                    <p className="line-clamp-2 text-sm text-foreground/75">
                      {course.concept}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
