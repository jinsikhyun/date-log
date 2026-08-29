"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";
import {
  type Category,
  CATEGORY_COLUMNS,
  DEFAULT_CATEGORIES,
  DEFAULT_COLOR,
  DEFAULT_ICON,
  colorClass,
  orderNamesBy,
  setCategoryRegistry,
} from "@/lib/categories";

interface CategoriesCtx {
  categories: Category[];
  ready: boolean;
  /** categories 테이블이 없어서 기본값을 쓰는 중 (SQL 미실행) */
  missing: boolean;
  refetch: () => Promise<void>;
  styleOf: (name: string) => string;
  iconOf: (name: string) => string;
  orderNames: (names: Iterable<string>) => string[];
}

const Ctx = createContext<CategoriesCtx | null>(null);

export function useCategories(): CategoriesCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCategories must be used within <CategoriesProvider>");
  return v;
}

export function CategoriesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);

  const refetch = useCallback(async () => {
    const { data, error } = await supabase
      .from("categories")
      .select(CATEGORY_COLUMNS)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      console.warn(
        "[categories] 조회 실패 — 기본 카테고리 사용:",
        error.message,
      );
      setMissing(true);
      setCategories(DEFAULT_CATEGORIES);
      setCategoryRegistry(DEFAULT_CATEGORIES);
    } else {
      const rows = (data ?? []) as Category[];
      const list = rows.length > 0 ? rows : DEFAULT_CATEGORIES;
      setMissing(rows.length === 0);
      setCategories(list);
      setCategoryRegistry(list);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const value = useMemo<CategoriesCtx>(
    () => ({
      categories,
      ready,
      missing,
      refetch,
      styleOf: (name) =>
        colorClass(
          categories.find((c) => c.name === name)?.color ?? DEFAULT_COLOR,
        ),
      iconOf: (name) =>
        categories.find((c) => c.name === name)?.icon ?? DEFAULT_ICON,
      orderNames: (names) => orderNamesBy(categories, names),
    }),
    [categories, ready, missing, refetch],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
