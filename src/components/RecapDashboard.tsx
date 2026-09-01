"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { statusLabel } from "@/lib/places";
import { daysTogether } from "@/lib/recap";
import { useAuth } from "@/components/AuthProvider";
import { withSubjectParticle } from "@/lib/korean";

type PlaceRow = {
  id: number;
  name: string;
  status: string;
  image_url: string | null;
  added_by: string | null;
  first_visit_date: string | null;
};
type MemRow = {
  id: number;
  place_id: number;
  photo_urls: string[];
  author: string | null;
  content: string | null;
};

const fmtDate = (d: string) => d.split("-").join(".");

function HighlightCard({
  label,
  placeId,
  name,
  sub,
}: {
  label: string;
  placeId: number | null;
  name: string | null;
  sub?: string;
}) {
  const body = (
    <>
      <p className="text-xs font-medium text-muted">{label}</p>
      {name ? (
        <p className="mt-1.5 text-lg font-bold leading-snug">
          {name}
          {sub && (
            <span className="ml-1.5 text-sm font-semibold text-accent">
              {sub}
            </span>
          )}
        </p>
      ) : (
        <p className="mt-1.5 text-sm text-muted">아직 없어요</p>
      )}
    </>
  );

  const cls = "block rounded-[20px] bg-card p-5 ring-1 ring-border";
  return placeId != null ? (
    <Link
      href={`/places/${placeId}`}
      className={`${cls} transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent/10`}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function RecapDashboard() {
  const { profile, ready, coupleMembers } = useAuth();

  const [places, setPlaces] = useState<PlaceRow[] | null>(null);
  const [memories, setMemories] = useState<MemRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 레이스에서 러너 아이콘을 누르면 그 사람이 등록한 것 목록을 펼침
  const [openRunner, setOpenRunner] = useState<string | null>(null);

  // 커플 구성원 이름(created_at 오름차순). 레이스 레인 이름 = added_by 매칭 기준.
  const runners = useMemo(
    () => [
      ...new Set(
        coupleMembers
          .map((m) => m.display_name?.trim())
          .filter((n): n is string => !!n),
      ),
    ],
    [coupleMembers],
  );

  // 관계 시작일 (undefined=로딩 중, null=미설정, string=설정됨)
  const [startDate, setStartDate] = useState<string | null | undefined>(
    undefined,
  );
  useEffect(() => {
    // /recap 은 미들웨어가 커플 연결을 보장하므로 couple_id 는 사실상 항상 있다.
    if (!ready || !profile?.couple_id) return;
    let cancelled = false;
    supabase
      .from("couples")
      .select("start_date")
      .eq("id", profile.couple_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setStartDate((data?.start_date as string | null) ?? null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ready, profile?.couple_id]);

  // 함께한 지 N일째 — 1분마다 강제 리렌더해서 자정 넘어가면 자동으로 +1
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const days = startDate ? daysTogether(startDate) : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pRes, mRes] = await Promise.all([
        supabase
          .from("places")
          .select("id, name, status, image_url, added_by, first_visit_date")
          .neq("status", "course_only"), // 코스 전용 장소는 통계에서 제외
        supabase
          .from("memories")
          .select("id, place_id, photo_urls, author, content"),
      ]);
      if (cancelled) return;
      if (pRes.error || mRes.error) {
        setError(
          `데이터를 불러오지 못했어요: ${
            pRes.error?.message ?? mRes.error?.message
          }`,
        );
        return;
      }
      setPlaces((pRes.data ?? []) as PlaceRow[]);
      setMemories((mRes.data ?? []) as MemRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    if (!places || !memories) return null;

    const visited = places.filter((p) => p.status === "visited");
    const wishlist = places.filter((p) => p.status === "wishlist");
    const photoCount =
      places.filter((p) => p.image_url).length +
      memories.reduce((s, m) => s + (m.photo_urls?.length ?? 0), 0);

    // 추억 최다 장소
    const byPlace = new Map<number, number>();
    memories.forEach((m) =>
      byPlace.set(m.place_id, (byPlace.get(m.place_id) ?? 0) + 1),
    );
    let topPid = -1;
    let topCnt = 0;
    byPlace.forEach((cnt, pid) => {
      if (cnt > topCnt) {
        topCnt = cnt;
        topPid = pid;
      }
    });
    const tp = places.find((p) => p.id === topPid);
    const topPlace = tp ? { id: tp.id, name: tp.name, count: topCnt } : null;

    // 우리의 첫 기록 (visited 중 first_visit_date 가장 빠른)
    const dated = visited
      .filter((p) => p.first_visit_date)
      .sort((a, b) => (a.first_visit_date! < b.first_visit_date! ? -1 : 1));
    const firstRecord = dated[0]
      ? {
          id: dated[0].id,
          name: dated[0].name,
          date: dated[0].first_visit_date!,
        }
      : null;

    // 레이스 — 커플 구성원 display_name 별로 added_by 개수
    const race: Record<string, number> = {};
    runners.forEach((n) => {
      race[n] = places.filter((p) => p.added_by === n).length;
    });
    const max = Math.max(...runners.map((n) => race[n] ?? 0), 1);

    return {
      visited: visited.length,
      wishlist: wishlist.length,
      memories: memories.length,
      photoCount,
      topPlace,
      firstRecord,
      race,
      max,
    };
  }, [places, memories, runners]);

  const placeById = useMemo(
    () => new Map((places ?? []).map((p) => [p.id, p])),
    [places],
  );
  const runnerPlaces =
    openRunner && places
      ? places.filter((p) => p.added_by === openRunner)
      : [];
  const runnerMems =
    openRunner && memories
      ? memories.filter((m) => m.author === openRunner)
      : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
          우리의 기록
        </h1>
        <p className="mt-1 text-sm text-muted-2">숫자로 돌아보는 우리</p>
      </div>

      {/* 함께한 지 N일째 — 티일 채움 히어로 */}
      <div className="rounded-[20px] bg-accent p-8 text-center text-[#eff4f1]">
        {startDate === undefined ? (
          <div className="mx-auto h-14 w-44 animate-pulse rounded-xl bg-white/20" />
        ) : startDate === null ? (
          <>
            <p className="text-sm font-medium text-white/80">함께한 지</p>
            <p className="mt-2 text-base font-bold">
              관계 시작일을 설정해주세요
            </p>
            <Link
              href="/settings"
              className="mt-3 inline-block rounded-full bg-[#fffcf5] px-4 py-1.5 text-xs font-semibold text-accent transition-opacity hover:opacity-90"
            >
              설정에서 입력하기 →
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-white/80">함께한 지</p>
            <p className="mt-1 text-[44px] font-extrabold tracking-[-0.03em] sm:text-6xl">
              {(days ?? 0).toLocaleString()}
              <span className="ml-1 text-2xl font-bold text-white/85">
                일째
              </span>
            </p>
            <p className="mt-2 text-xs text-white/70">
              {fmtDate(startDate)}부터
            </p>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {!stats && !error ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-2xl bg-[#efe7d6]"
              />
            ))}
          </div>
          <div className="h-40 animate-pulse rounded-[20px] bg-[#efe7d6]" />
        </div>
      ) : stats ? (
        <>
          {/* 핵심 숫자 4개 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["다녀온 곳", stats.visited],
                ["가고 싶은 곳", stats.wishlist],
                ["남긴 추억", stats.memories],
                ["사진", stats.photoCount],
              ] as const
            ).map(([label, n]) => (
              <div
                key={label}
                className="rounded-2xl bg-card p-4 text-center ring-1 ring-border"
              >
                <p className="text-[32px] font-extrabold leading-none tracking-[-0.03em]">
                  {n}
                </p>
                <p className="mt-1.5 text-[11px] font-medium text-muted-2">
                  {label}
                </p>
              </div>
            ))}
          </div>

          {/* 베스트 하이라이트 (장소 클릭 시 상세로) */}
          <div className="grid gap-3 sm:grid-cols-2">
            <HighlightCard
              label="추억이 가장 많은 곳"
              placeId={stats.topPlace?.id ?? null}
              name={stats.topPlace?.name ?? null}
              sub={
                stats.topPlace ? `추억 ${stats.topPlace.count}개` : undefined
              }
            />
            <HighlightCard
              label="우리의 첫 기록"
              placeId={stats.firstRecord?.id ?? null}
              name={stats.firstRecord?.name ?? null}
              sub={
                stats.firstRecord
                  ? fmtDate(stats.firstRecord.date)
                  : undefined
              }
            />
          </div>

          {/* 누가 더 많이 등록했을까 — 레이스 ({A} 티일 vs {B} 앰버) */}
          {runners.length > 0 && (
            <div className="rounded-[20px] bg-card p-5 ring-1 ring-border sm:p-6">
              <p className="text-sm font-bold">누가 더 많이 등록했을까 🏃</p>
              <p className="mt-0.5 text-[11px] text-muted-2">
                러너를 누르면 그 사람이 등록한 목록을 볼 수 있어요
              </p>
              <div className="mt-5 space-y-7">
                {runners.map((name, ri) => {
                  const count = stats.race[name] ?? 0;
                  const pct = 4 + (count / stats.max) * 86; // 4%~90%
                  const labelPct = Math.min(84, Math.max(16, pct));
                  const runnerBg = ri === 0 ? "bg-accent" : "bg-amber";
                  const ringCol = ri === 0 ? "ring-accent" : "ring-amber";
                  return (
                    <div key={name}>
                      <div className="relative h-14 rounded-full bg-[#efe7d6]">
                        <span
                          aria-hidden
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-xl"
                        >
                          🏁
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenRunner((r) => (r === name ? null : name))
                          }
                          aria-pressed={openRunner === name}
                          aria-label={`${name} 등록 목록 보기`}
                          className={`absolute top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-lg text-white shadow transition-shadow hover:shadow-lg ${runnerBg} ${
                            openRunner === name
                              ? `ring-2 ring-offset-2 ${ringCol}`
                              : ""
                          }`}
                          style={{
                            left: `${pct}%`,
                            animation:
                              "recap-runner-bounce 0.6s ease-in-out infinite",
                          }}
                        >
                          🏃
                        </button>
                      </div>
                      <div className="relative mt-1.5 h-4">
                        <p
                          className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-muted-2"
                          style={{ left: `${labelPct}%` }}
                        >
                          {name} · {count}곳
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {openRunner && (
                <div className="mt-5 border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold">
                      {withSubjectParticle(openRunner)} 등록한 것
                    </p>
                    <button
                      type="button"
                      onClick={() => setOpenRunner(null)}
                      className="text-xs text-muted transition-colors hover:text-accent"
                    >
                      닫기
                    </button>
                  </div>

                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    {/* 추가한 장소 */}
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-muted">
                        추가한 장소 {runnerPlaces.length}곳
                      </p>
                      {runnerPlaces.length === 0 ? (
                        <p className="text-xs text-muted">없어요</p>
                      ) : (
                        <ul className="space-y-1">
                          {runnerPlaces.map((p) => (
                            <li key={p.id}>
                              <Link
                                href={`/places/${p.id}`}
                                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-background"
                              >
                                <span className="min-w-0 flex-1 truncate font-medium">
                                  {p.name}
                                </span>
                                <span className="shrink-0 text-[11px] text-muted">
                                  {statusLabel(p.status)}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* 작성한 추억 */}
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-muted">
                        작성한 추억 {runnerMems.length}개
                      </p>
                      {runnerMems.length === 0 ? (
                        <p className="text-xs text-muted">없어요</p>
                      ) : (
                        <ul className="space-y-1">
                          {runnerMems.map((m) => {
                            const pl = placeById.get(m.place_id);
                            return (
                              <li key={m.id}>
                                <Link
                                  href={`/places/${m.place_id}`}
                                  className="block rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-background"
                                >
                                  <span className="line-clamp-1 text-foreground/85">
                                    {m.content?.trim() || "(내용 없음)"}
                                  </span>
                                  <span className="text-[11px] text-muted">
                                    {pl ? pl.name : "(삭제된 장소)"}
                                  </span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
