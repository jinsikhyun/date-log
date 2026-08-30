"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

export interface Profile {
  id: string;
  display_name: string | null;
  couple_id: string | null;
  created_at: string;
}

const PROFILE_COLUMNS = "id, display_name, couple_id, created_at";

export interface CoupleMember {
  id: string;
  display_name: string | null;
}

interface AuthCtx {
  user: User | null;
  /** profiles 행 (없으면 null) */
  profile: Profile | null;
  /** 내 couple_id 에 속한 profiles (나 + 파트너). 이름 옵션 등에 사용 */
  coupleMembers: CoupleMember[];
  /** 내 display_name (없으면 이메일, 그것도 없으면 "") */
  displayName: string;
  /** 세션 + 프로필 확인이 끝났는지 */
  ready: boolean;
  signOut: () => Promise<void>;
  /** 온보딩 완료 등으로 프로필이 바뀐 뒤 다시 읽어온다 */
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within <AuthProvider>");
  return v;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [coupleMembers, setCoupleMembers] = useState<CoupleMember[]>([]);

  // 세션
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthChecked(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // user 가 바뀌면 프로필 다시 로드
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileChecked(true);
      return;
    }
    setProfileChecked(false);
    let cancelled = false;
    supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setProfile((data as Profile) ?? null);
        setProfileChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // 내 couple 의 구성원(나 + 파트너) — wanted_by 옵션 등에 씀
  useEffect(() => {
    const cid = profile?.couple_id;
    if (!cid) {
      setCoupleMembers([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("id, display_name")
      .eq("couple_id", cid)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setCoupleMembers((data ?? []) as CoupleMember[]);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.couple_id]);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", user.id)
      .maybeSingle();
    setProfile((data as Profile) ?? null);
  }, [user]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // 인증 전환은 SPA 이동(router.push)이 아니라 전체 새로고침으로 한다:
    // proxy 가 새 쿠키 상태로 다시 돌고, 로그인 시절의 RSC 캐시/클라이언트 상태가 싹 비워진다.
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    }
  }, []);

  return (
    <Ctx.Provider
      value={{
        user,
        profile,
        coupleMembers,
        displayName: profile?.display_name ?? user?.email ?? "",
        ready: authChecked && profileChecked,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
