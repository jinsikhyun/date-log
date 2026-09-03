"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  type CourseWithStops,
  courseDistanceKm,
  sortedStops,
  walkMinutes,
} from "@/lib/courses";
import { categoryStyle } from "@/lib/places";
import { CourseForm, type CourseFormInput } from "@/components/CourseForm";
import { AnniversaryPlanBanner } from "@/components/AnniversaryPlanBanner";
import { useAnniversaries } from "@/hooks/useAnniversaries";
import { nextAnniversary } from "@/lib/anniversaries";

const COURSE_LIST_SELECT =
  "id, title, concept, created_at, course_places(order_index, places(id, name, category, address, image_url, lat, lng, status))";

const POLICY_HINT =
  "저장 권한이 없거나 세션이 만료됐어요. 다시 로그인하거나 커플 연결 상태를 확인해 주세요.";

const fmtDate = (d: string) => d.slice(0, 10).replace(/-/g, ".");

export function CoursesView() {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseWithStops[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const anniversaries = useAnniversaries();
  const upcomingAnniversary = nextAnniversary(
    anniversaries.filter((event) => event.kind !== "first-record"),
  );

  const openAnniversaryPlan = () => {
    setShowForm(true);
    window.requestAnimationFrame(() => {
      document.getElementById("course-planner")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

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

    // "이번 코스에만 추가"로 만든 장소들 — 이제 코스 id 가 있으니 연결 (코스 삭제 시 함께 삭제)
    if (input.courseOnlyPlaceIds && input.courseOnlyPlaceIds.length > 0) {
      const { error: linkErr } = await supabase
        .from("places")
        .update({ owning_course_id: course.id })
        .in("id", input.courseOnlyPlaceIds);
      if (linkErr) console.error("[courses] course_only 링크 실패:", linkErr);
    }

    // 방금 만든 코스 상세로 이동 (임베딩/좌표는 거기서 정확히 로드)
    setShowForm(false);
    router.push(`/courses/${course.id}`);
  }, [router]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
            데이트 코스
          </h1>
          <p className="mt-1 text-sm text-muted-2">
            {loading ? "불러오는 중…" : `코스 ${courses.length}개`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-foreground px-5 py-[11px] text-sm font-semibold text-background transition-colors hover:bg-ink-hover"
        >
          {showForm ? "폼 닫기" : "코스 만들기"}
        </button>
      </div>

      {upcomingAnniversary && (
        <AnniversaryPlanBanner event={upcomingAnniversary} onPlan={openAnniversaryPlan} />
      )}

      {showForm && (
        <div id="course-planner" className="scroll-mt-24">
          <CourseForm
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
            submitLabel="코스 저장"
          />
        </div>
      )}

      {loadError && (
        <div className="mb-6 rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="grid gap-[22px] sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-56 animate-pulse rounded-[20px] bg-[#efe7d6]"
            />
          ))}
        </div>
      ) : courses.length === 0 && !loadError ? (
        <p className="rounded-[20px] bg-card p-12 text-center text-sm text-muted-2 ring-1 ring-border">
          아직 만든 코스가 없어요. “코스 만들기”로 첫 코스를 짜보세요.
        </p>
      ) : (
        <div className="grid gap-[22px] sm:grid-cols-2">
          {courses.map((course) => {
            const stops = sortedStops(course);
            const km = courseDistanceKm(stops);
            return (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                className="group flex h-full flex-col gap-3 rounded-[20px] bg-card px-[26px] py-6 ring-1 ring-border transition duration-200 hover:ring-accent-border hover:shadow-[0_16px_32px_-22px_rgba(40,70,70,0.5)]"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="min-w-0 flex-1 truncate text-[19px] font-extrabold tracking-[-0.01em]">
                    {course.title}
                  </h2>
                  <span className="shrink-0 text-[11px] text-muted-3">
                    {fmtDate(course.created_at)}
                  </span>
                </div>
                {course.concept && (
                  <p className="line-clamp-1 text-[13px] text-muted-2">
                    {course.concept}
                  </p>
                )}

                <ol className="flex flex-col gap-1.5">
                  {stops.slice(0, 4).map((s, i) => (
                    <li
                      key={s.places!.id}
                      className="flex items-center gap-2 text-[13px]"
                    >
                      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-background text-[10px] font-bold text-muted-2">
                        {i + 1}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${categoryStyle(
                          s.places!.category,
                        )}`}
                      >
                        {s.places!.category}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {s.places!.name}
                      </span>
                    </li>
                  ))}
                  {stops.length > 4 && (
                    <li className="pl-[26px] text-[11px] text-muted-3">
                      +{stops.length - 4}곳 더
                    </li>
                  )}
                </ol>

                <div className="mt-auto flex min-h-8 items-center justify-between gap-2 border-t border-background pt-3 text-[12px] font-medium text-muted-2">
                  <span className="whitespace-nowrap">
                    {km > 0 ? `총 ${km.toFixed(1)}km` : `장소 ${stops.length}곳`}
                    {km > 0 && (
                      <span className="ml-2 whitespace-nowrap">
                        도보 {walkMinutes(km)}분
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 whitespace-nowrap font-bold text-accent transition-colors group-hover:text-accent-hover">
                    코스 열기 →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
