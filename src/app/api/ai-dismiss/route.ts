// src/app/api/ai-dismiss/route.ts
// ─────────────────────────────────────────────────────────────
// AI 추천 "관심 없어요"(6단계) 기록 · 사유 변경 · 취소.
// - POST   { candidateId, mode, reason?, originLat?, originLng? } → 행 생성(즉시 숨김).
// - PATCH  { id, reason }                                          → 사유 변경(+ 만료 재계산).
// - DELETE { id }                                                  → 취소(행 삭제).
// 만료 시각(expires_at)은 클라이언트가 아니라 여기서 src/lib/recommendationDismissal.ts 정책으로
// 계산한다 — 기간 정책이 한 곳에만 있도록. RLS 가 본인 행만 읽고 쓰게 하므로(개인 귀속) 이
// 라우트는 user_id 를 따로 검사하지 않고 DB 정책에 맡긴다(설정 안 됐으면 insert 자체가 실패).
// 미저장·미클릭은 기록하지 않는다 — 이 라우트는 명시적 버튼 클릭에서만 호출된다.
// ─────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import {
  DISMISS_REASONS,
  dismissalExpiresAt,
} from "@/lib/recommendationDismissal";

const TABLE = "ai_recommend_dismissals";

const ReasonSchema = z.enum(DISMISS_REASONS).nullable();

const CreateSchema = z.object({
  candidateId: z.string().trim().min(1).max(80),
  mode: z.enum(["place_detail", "course"]),
  reason: ReasonSchema.optional(),
  originLat: z.number().finite().min(-90).max(90).optional(),
  originLng: z.number().finite().min(-180).max(180).optional(),
});

const UpdateSchema = z.object({
  id: z.number().int().positive(),
  reason: ReasonSchema,
});

const DeleteSchema = z.object({
  id: z.number().int().positive(),
});

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function parseBody<S extends z.ZodTypeAny>(req: NextRequest, schema: S): Promise<z.infer<S> | null> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return null;
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function isMissingTable(code: string | undefined) {
  // PGRST205 = 테이블 없음(마이그레이션 미적용). 사용자에게 원인을 그대로 알린다.
  return code === "PGRST205" || code === "42P01";
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await parseBody(req, CreateSchema);
  if (!body) return NextResponse.json({ error: "요청 정보가 올바르지 않아요." }, { status: 400 });

  const reason = body.reason ?? null;
  const expiresAt = dismissalExpiresAt(reason);
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: user.id,
      candidate_id: body.candidateId,
      mode: body.mode,
      reason,
      origin_lat: body.originLat ?? null,
      origin_lng: body.originLng ?? null,
      expires_at: expiresAt.toISOString(),
    })
    .select("id, expires_at")
    .single();

  if (error) {
    console.error("[ai-dismiss] insert 실패:", error.code, error.message);
    return NextResponse.json(
      {
        error: isMissingTable(error.code)
          ? "\"관심 없어요\" 저장소가 아직 준비되지 않았어요."
          : "숨기지 못했어요. 잠시 후 다시 시도해 주세요.",
      },
      { status: 500 },
    );
  }
  return NextResponse.json({ id: data.id, expiresAt: data.expires_at });
}

export async function PATCH(req: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await parseBody(req, UpdateSchema);
  if (!body) return NextResponse.json({ error: "요청 정보가 올바르지 않아요." }, { status: 400 });

  // 사유가 바뀌면 그 사유의 기간으로 만료를 "지금 기준" 다시 계산한다(처음 누른 시각이 아니라).
  const expiresAt = dismissalExpiresAt(body.reason);
  const { data, error } = await supabase
    .from(TABLE)
    .update({ reason: body.reason, expires_at: expiresAt.toISOString() })
    .eq("id", body.id)
    .select("id, expires_at")
    .maybeSingle();

  if (error) {
    console.error("[ai-dismiss] update 실패:", error.code, error.message);
    return NextResponse.json({ error: "사유를 저장하지 못했어요." }, { status: 500 });
  }
  // RLS 로 남의 행은 0건 매치 → 404 로 구분(존재 여부를 숨길 필요는 없다 — id 는 본인 세션이 방금 받은 값).
  if (!data) return NextResponse.json({ error: "숨긴 기록을 찾지 못했어요." }, { status: 404 });
  return NextResponse.json({ id: data.id, expiresAt: data.expires_at });
}

export async function DELETE(req: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await parseBody(req, DeleteSchema);
  if (!body) return NextResponse.json({ error: "요청 정보가 올바르지 않아요." }, { status: 400 });

  const { error } = await supabase.from(TABLE).delete().eq("id", body.id);
  if (error) {
    console.error("[ai-dismiss] delete 실패:", error.code, error.message);
    return NextResponse.json({ error: "취소하지 못했어요." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
