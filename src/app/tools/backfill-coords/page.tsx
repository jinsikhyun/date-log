"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { geocode, keywordSearchFirst } from "@/lib/kakao";

type Row = { id: number; name: string; address: string; status: string };
type Result = {
  id: number;
  name: string;
  outcome: "address" | "keyword" | "failed";
  lat?: number;
  lng?: number;
};

/**
 * 일회성 좌표 보정 도구 (/tools/backfill-coords).
 * lat/lng 가 비어 있는 장소를 주소 지오코딩 → 실패 시 장소명 검색으로 채운다.
 * 카카오 SDK 가 브라우저에서만 동작하므로 Node 스크립트가 아니라 이 페이지로 처리한다.
 */
export default function BackfillCoordsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("places")
        .select("id, name, address, status")
        .or("lat.is.null,lng.is.null")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) setErr(error.message);
      else setRows((data ?? []) as Row[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async () => {
    if (!rows || running) return;
    setRunning(true);
    setErr(null);
    const acc: Result[] = [];
    for (const r of rows) {
      let hit = r.address.trim()
        ? await geocode(r.address).catch(() => null)
        : null;
      let outcome: Result["outcome"] = hit ? "address" : "failed";
      if (!hit) {
        hit = await keywordSearchFirst(r.name).catch(() => null);
        if (hit) outcome = "keyword";
      }
      if (hit) {
        const { error } = await supabase
          .from("places")
          .update({ lat: hit.lat, lng: hit.lng })
          .eq("id", r.id);
        if (error) {
          acc.push({ id: r.id, name: r.name, outcome: "failed" });
        } else {
          acc.push({
            id: r.id,
            name: r.name,
            outcome,
            lat: hit.lat,
            lng: hit.lng,
          });
        }
      } else {
        acc.push({ id: r.id, name: r.name, outcome: "failed" });
      }
      setResults([...acc]);
    }
    setRunning(false);
    setDone(true);
  };

  const failed = results.filter((r) => r.outcome === "failed");

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-5">
        <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">
          좌표 보정 도구
        </h1>
        <p className="mt-1 text-sm text-muted-2">
          위경도가 비어 있는 장소를 주소·장소명으로 지오코딩해 채웁니다.
          일회성으로만 쓰세요.
        </p>
        <Link
          href="/courses"
          className="mt-2 inline-block text-xs font-medium text-accent hover:underline"
        >
          ← 코스로 돌아가기
        </Link>
      </div>

      {err && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
          {err}
        </p>
      )}

      {rows === null ? (
        <p className="text-sm text-muted">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl bg-accent-soft p-4 text-sm text-accent">
          좌표가 비어 있는 장소가 없어요. 보정할 게 없습니다. ✅
        </p>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm font-medium">
              좌표 없는 장소 <b>{rows.length}</b>곳
            </p>
            <button
              type="button"
              onClick={run}
              disabled={running || done}
              className="rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition-colors hover:bg-ink-hover disabled:opacity-60"
            >
              {running
                ? `보정 중… (${results.length}/${rows.length})`
                : done
                  ? "완료"
                  : "좌표 보정 시작"}
            </button>
          </div>

          <ul className="divide-y divide-border rounded-xl bg-card ring-1 ring-border">
            {rows.map((r) => {
              const res = results.find((x) => x.id === r.id);
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="truncate text-xs text-muted-3">{r.address}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold">
                    {!res ? (
                      <span className="text-muted-3">대기</span>
                    ) : res.outcome === "address" ? (
                      <span className="text-accent">주소로 성공</span>
                    ) : res.outcome === "keyword" ? (
                      <span className="text-accent">이름검색 성공</span>
                    ) : (
                      <span className="text-red-600">실패</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          {done && (
            <div className="mt-4 rounded-xl bg-accent-soft p-4 text-sm text-accent">
              보정 완료 — 성공 {results.length - failed.length}곳 / 실패{" "}
              {failed.length}곳.
              {failed.length > 0 && (
                <>
                  <br />
                  실패(수동으로 주소 수정 필요):{" "}
                  <b>{failed.map((f) => `${f.name}(#${f.id})`).join(", ")}</b>
                </>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
