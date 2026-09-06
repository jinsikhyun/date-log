// src/app/api/special-days/route.ts
// ─────────────────────────────────────────────────────────────
// 한국천문연구원 특일 정보 조회 → 오늘의 절기/연휴 트리거 판정.
// - KASI_SERVICE_KEY 는 서버 전용(NEXT_PUBLIC_ 아님).
// - 천문연 API 는 XML 응답이라 의존성 없이 정규식으로 item 필드만 뽑는다.
//   (item 구조가 <dateKind>..<dateName>..<isHoliday>..<locdate> 로 단순해 안전)
// - 특일 정보는 연/월 단위로 거의 안 바뀌므로 하루(24h) 캐싱.
//
// 응답: {
//   date: "2026-12-22",
//   solarTerm: "동지" | null,
//   holiday: { pattern, streak, name } | null,
// }
// (문구 선택·CTA 는 통합 판정 로직/클라이언트가 이 결과로 결정)
// ─────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  solarTermToday,
  holidayVerdict,
  type SpecialDayItem,
  type DatelogSolarTerm,
  type HolidayVerdict,
} from "@/lib/specialDays";

const BASE =
  "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 하루

interface SpecialDaysResult {
  date: string;
  solarTerm: DatelogSolarTerm | null;
  holiday: HolidayVerdict | null;
  cachedAt: number;
}

const cache = new Map<string, SpecialDaysResult>();

/**
 * 천문연 XML 에서 <item>...</item> 블록마다 필요한 4개 필드를 뽑는다.
 * XML 라이브러리 없이 처리 — item 이 평평한 구조라 정규식으로 충분.
 */
function parseItems(xml: string): SpecialDayItem[] {
  const items: SpecialDayItem[] = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const b of blocks) {
    const pick = (tag: string) => {
      const m = b.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
      return m ? m[1].trim() : "";
    };
    const locdateStr = pick("locdate");
    if (!locdateStr) continue;
    items.push({
      dateKind: pick("dateKind"),
      dateName: pick("dateName"),
      isHoliday: pick("isHoliday"),
      locdate: Number(locdateStr),
    });
  }
  return items;
}

/** 천문연 특일 API 한 번 호출 → item 배열. resultCode 오류면 throw. */
async function fetchSpecial(
  op: "getRestDeInfo" | "get24DivisionsInfo",
  serviceKey: string,
  solYear: number,
  solMonth?: number,
): Promise<SpecialDayItem[]> {
  // serviceKey 는 발급 시 이미 URL-encoded 형태(Encoding 키)라 그대로 붙인다.
  // solMonth 는 2자리(01~12).
  const params = new URLSearchParams({
    solYear: String(solYear),
    numOfRows: "50",
  });
  if (solMonth) params.set("solMonth", String(solMonth).padStart(2, "0"));

  const url = `${BASE}/${op}?serviceKey=${serviceKey}&${params.toString()}`;
  // 공공데이터포털 API는 커넥션이 간헐적으로 느리거나 끊길 수 있어 1회 재시도한다.
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new KasiError(res.status);

  const xml = await res.text();
  // 인증 실패 등은 200에 resultCode 로 오는 경우가 있어 본문도 확인.
  const codeMatch = xml.match(/<resultCode>([\s\S]*?)<\/resultCode>/);
  const code = codeMatch ? codeMatch[1].trim() : "";
  if (code && code !== "00") {
    // 30: 서비스키 미등록/오류, 22: 트래픽 초과 등
    throw new KasiError(code === "30" || code === "31" ? 401 : 502);
  }
  return parseItems(xml);
}

class KasiError extends Error {
  constructor(public status: number) {
    super(`KASI responded ${status}`);
  }
}

/** 커넥션 타임아웃 등 일시적 네트워크 오류에 대비해 1회만 재시도한다. */
async function fetchWithRetry(url: string, attempts = 2): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, { cache: "no-store" });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const serviceKey = process.env.KASI_SERVICE_KEY;
  if (!serviceKey) {
    console.error("[special-days] KASI_SERVICE_KEY 가 설정되지 않았어요.");
    return NextResponse.json(
      { error: "특일 정보 기능이 아직 설정되지 않았어요." },
      { status: 500 },
    );
  }

  // 오늘(KST). UTC 기준 시각에 +9h 한 뒤 반드시 getUTC* 로만 읽는다 — 서버 로컬
  // 타임존이 이미 KST(예: 로컬 개발 macOS)면 getFullYear 등 로컬 getter는 9시간을
  // 중복 적용해 날짜가 하루 밀린다(서버 TZ가 UTC 인 배포 환경에서만 우연히 맞음).
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const year = nowKst.getUTCFullYear();
  const month = nowKst.getUTCMonth() + 1;
  const day = nowKst.getUTCDate();
  const today = year * 10000 + month * 100 + day;

  const cacheKey = String(today);
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
    return NextResponse.json(hit);
  }

  try {
    // 절기: 그 해 전체(24개)에서 오늘 것 필터. 연휴: 이번달+앞뒤달 걸쳐 계산해야
    // 월 경계 연휴(예: 12/31~1/1)를 놓치지 않는다. 여기선 이번달+다음달만 봐도
    // 대부분 커버되지만, 안전하게 전달·당·익월 3개월치 공휴일을 모은다.
    const [terms, ...holidayMonths] = await Promise.all([
      fetchSpecial("get24DivisionsInfo", serviceKey, year),
      fetchSpecial("getRestDeInfo", serviceKey, year, month),
      fetchSpecial(
        "getRestDeInfo",
        serviceKey,
        month === 12 ? year + 1 : year,
        month === 12 ? 1 : month + 1,
      ),
      fetchSpecial(
        "getRestDeInfo",
        serviceKey,
        month === 1 ? year - 1 : year,
        month === 1 ? 12 : month - 1,
      ),
    ]);

    // 공휴일 Set + 명칭 맵 (isHoliday==='Y' 만)
    const holidays = new Set<number>();
    const names = new Map<number, string>();
    for (const it of holidayMonths.flat()) {
      if (it.isHoliday === "Y") {
        holidays.add(it.locdate);
        names.set(it.locdate, it.dateName);
      }
    }

    const result: SpecialDaysResult = {
      date: `${String(today).slice(0, 4)}-${String(today).slice(4, 6)}-${String(today).slice(6, 8)}`,
      solarTerm: solarTermToday(terms, today),
      holiday: holidayVerdict(holidays, names, today),
      cachedAt: Date.now(),
    };
    cache.set(cacheKey, result);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof KasiError && err.status === 401) {
      console.error("[special-days] KASI 인증 실패 — 서비스키 확인 필요.");
      return NextResponse.json(
        { error: "특일 정보 인증에 문제가 있어요. 잠시 후 다시 시도해 주세요." },
        { status: 502 },
      );
    }
    console.error("[special-days] 오류:", err);
    return NextResponse.json(
      { error: "특일 정보를 가져오지 못했어요." },
      { status: 502 },
    );
  }
}
