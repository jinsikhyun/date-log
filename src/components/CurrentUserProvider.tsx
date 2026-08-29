"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const STORAGE_KEY = "dateLogUser";

export const USER_OPTIONS = ["진식", "지민"] as const;
export type CurrentUser = (typeof USER_OPTIONS)[number];

interface CurrentUserCtx {
  /** 선택된 이름. 아직 안 골랐으면 null */
  user: CurrentUser | null;
  /** localStorage 를 읽어온 뒤 true (SSR/hydration 깜빡임 방지용) */
  ready: boolean;
  /** 이름 선택 → 저장하고 모달 닫기 */
  choose: (name: CurrentUser) => void;
  /** 선택 모달을 다시 연다 (헤더의 이름 클릭 등) */
  openPicker: () => void;
}

const Ctx = createContext<CurrentUserCtx | null>(null);

export function useCurrentUser(): CurrentUserCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useCurrentUser must be used within <CurrentUserProvider>");
  }
  return ctx;
}

export function CurrentUserProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [ready, setReady] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // 프라이빗 모드 등에서 접근 불가 — 그냥 미선택으로 취급
    }
    if (stored === "진식" || stored === "지민") {
      setUser(stored);
    }
    setReady(true);
  }, []);

  const choose = useCallback((name: CurrentUser) => {
    try {
      localStorage.setItem(STORAGE_KEY, name);
    } catch {
      /* 저장 실패해도 세션 동안은 상태로 유지 */
    }
    setUser(name);
    setPickerOpen(false);
  }, []);

  const openPicker = useCallback(() => setPickerOpen(true), []);

  // 최초 접속(미선택)이면 닫을 수 없는 모달, 헤더에서 다시 연 거면 취소 가능
  const showModal = ready && (pickerOpen || user === null);
  const dismissible = user !== null;

  return (
    <Ctx.Provider value={{ user, ready, choose, openPicker }}>
      {children}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => dismissible && setPickerOpen(false)}
        >
          <div
            className="w-full max-w-xs rounded-3xl bg-card p-6 text-center ring-1 ring-border/70"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">당신은 누구인가요?</h2>
            <p className="mt-1 text-sm text-muted">
              이 기기에서 추가·작성하는 내용에 이름이 붙어요.
            </p>
            <div className="mt-5 flex gap-3">
              {USER_OPTIONS.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => choose(name)}
                  className={`flex-1 rounded-2xl px-4 py-3 text-base font-bold transition-colors ${
                    user === name
                      ? "bg-accent text-white"
                      : "bg-white text-foreground ring-1 ring-border hover:ring-accent hover:text-accent"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
            {dismissible && (
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="mt-4 text-xs text-muted transition-colors hover:text-accent"
              >
                닫기
              </button>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
