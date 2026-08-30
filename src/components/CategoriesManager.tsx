"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import {
  type Category,
  COLOR_NAMES,
  DEFAULT_COLOR,
  DEFAULT_ICON,
  colorClass,
} from "@/lib/categories";
import { useCategories } from "@/components/CategoriesProvider";

const fieldClass =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-accent";
const labelClass = "text-xs font-medium text-muted";

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLOR_NAMES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-2 ${
            value === c ? "ring-accent" : "ring-transparent"
          } ${colorClass(c)}`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

export function CategoriesManager() {
  const { categories, missing, refetch } = useCategories();

  const [busy, setBusy] = useState(false);

  // 추가 폼
  const [adding, setAdding] = useState(false);
  const [nName, setNName] = useState("");
  const [nIcon, setNIcon] = useState(DEFAULT_ICON);
  const [nColor, setNColor] = useState("blue");
  const [nErr, setNErr] = useState<string | null>(null);

  // 인라인 수정
  const [editId, setEditId] = useState<number | null>(null);
  const [eName, setEName] = useState("");
  const [eIcon, setEIcon] = useState(DEFAULT_ICON);
  const [eColor, setEColor] = useState(DEFAULT_COLOR);
  const [eErr, setEErr] = useState<string | null>(null);

  const startEdit = (c: Category) => {
    setEditId(c.id);
    setEName(c.name);
    setEIcon(c.icon);
    setEColor(c.color);
    setEErr(null);
  };

  const handleAdd = async () => {
    setNErr(null);
    const name = nName.trim();
    if (!name) {
      setNErr("이름을 입력해 주세요.");
      return;
    }
    if (categories.some((c) => c.name === name)) {
      setNErr("이미 있는 카테고리예요.");
      return;
    }
    setBusy(true);
    const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order), 0);
    const { error } = await supabase.from("categories").insert({
      name,
      icon: nIcon.trim() || DEFAULT_ICON,
      color: nColor,
      sort_order: maxOrder + 10,
    });
    setBusy(false);
    if (error) {
      setNErr(
        `저장 실패: ${error.message} (supabase/add-categories-table.sql 적용 여부 확인)`,
      );
      return;
    }
    setNName("");
    setNIcon(DEFAULT_ICON);
    setNColor("blue");
    setAdding(false);
    await refetch();
  };

  const handleSave = async (cat: Category) => {
    setEErr(null);
    const name = eName.trim();
    if (!name) {
      setEErr("이름을 입력해 주세요.");
      return;
    }
    if (name !== cat.name && categories.some((c) => c.name === name)) {
      setEErr("이미 있는 카테고리예요.");
      return;
    }
    setBusy(true);
    // 이름이 바뀌면 그 카테고리를 쓰던 장소들도 같이 갱신
    if (name !== cat.name) {
      const { error: pErr } = await supabase
        .from("places")
        .update({ category: name })
        .eq("category", cat.name);
      if (pErr) {
        setBusy(false);
        setEErr(`장소 갱신 실패: ${pErr.message}`);
        return;
      }
    }
    const { error } = await supabase
      .from("categories")
      .update({ name, icon: eIcon.trim() || DEFAULT_ICON, color: eColor })
      .eq("id", cat.id);
    setBusy(false);
    if (error) {
      setEErr(`저장 실패: ${error.message}`);
      return;
    }
    setEditId(null);
    await refetch();
  };

  const handleDelete = async (cat: Category) => {
    const { count } = await supabase
      .from("places")
      .select("id", { count: "exact", head: true })
      .eq("category", cat.name);

    const msg =
      count && count > 0
        ? `'${cat.name}' 카테고리를 삭제할까요?\n이 카테고리를 쓰는 장소 ${count}곳은 남지만 회색(기타 스타일)으로 표시돼요.`
        : `'${cat.name}' 카테고리를 삭제할까요?`;
    if (!window.confirm(msg)) return;

    setBusy(true);
    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", cat.id);
    setBusy(false);
    if (error) {
      window.alert(`삭제하지 못했어요: ${error.message}`);
      return;
    }
    await refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">카테고리 관리</h1>
          <p className="mt-1.5 text-sm text-muted">
            장소를 분류하는 카테고리의 이름·색·아이콘을 직접 정해요.
          </p>
        </div>
        <Link
          href="/"
          className="shrink-0 text-sm text-muted transition-colors hover:text-accent"
        >
          ← 홈으로
        </Link>
      </div>

      {missing && (
        <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
          <b>categories 테이블이 아직 없어요.</b> Supabase SQL Editor 에서{" "}
          <code>supabase/add-categories-table.sql</code> 을 실행하면 저장이
          됩니다. (지금은 기본 카테고리로만 보여요)
        </div>
      )}

      <ul className="space-y-2">
        {categories.map((c) => (
          <li
            key={c.id}
            className="rounded-2xl bg-card p-4 ring-1 ring-border/70"
          >
            {editId === c.id ? (
              <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_90px]">
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>이름</label>
                    <input
                      className={fieldClass}
                      value={eName}
                      onChange={(e) => setEName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>아이콘</label>
                    <input
                      className={`${fieldClass} text-center`}
                      value={eIcon}
                      onChange={(e) => setEIcon(e.target.value)}
                      maxLength={4}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>색</label>
                  <ColorPicker value={eColor} onChange={setEColor} />
                </div>
                {eErr && (
                  <p className="text-sm font-medium text-red-600">{eErr}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleSave(c)}
                    className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditId(null)}
                    className="rounded-full bg-stone-100 px-4 py-1.5 text-xs font-medium text-stone-600"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${colorClass(
                    c.color,
                  )}`}
                >
                  <span aria-hidden>{c.icon}</span>
                  {c.name}
                </span>
                <span className="text-xs text-muted">{c.color}</span>
                <span className="ml-auto flex gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(c)}
                    className="rounded-full px-2.5 py-1 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-accent"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleDelete(c)}
                    className="rounded-full px-2.5 py-1 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    삭제
                  </button>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border/70">
          <div className="grid gap-3 sm:grid-cols-[1fr_90px]">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>이름 *</label>
              <input
                className={fieldClass}
                value={nName}
                onChange={(e) => setNName(e.target.value)}
                placeholder="예: 산책, 드라이브, 팝업"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>아이콘</label>
              <input
                className={`${fieldClass} text-center`}
                value={nIcon}
                onChange={(e) => setNIcon(e.target.value)}
                maxLength={4}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>색</label>
            <ColorPicker value={nColor} onChange={setNColor} />
          </div>
          {nErr && <p className="text-sm font-medium text-red-600">{nErr}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={handleAdd}
              className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              추가
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setNErr(null);
              }}
              className="rounded-full bg-stone-100 px-4 py-1.5 text-xs font-medium text-stone-600"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-full bg-foreground px-4 py-1.5 text-sm font-semibold text-background"
        >
          카테고리 추가
        </button>
      )}
    </div>
  );
}
