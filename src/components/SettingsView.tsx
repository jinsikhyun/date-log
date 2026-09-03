"use client";

import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { processImageToJpeg } from "@/lib/photos";
import { Lightbox } from "@/components/Lightbox";

export function SettingsView() {
  const router = useRouter();
  const { user, profile, ready, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? "");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [savedBirthDate, setSavedBirthDate] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pendingAvatar, setPendingAvatar] = useState<Blob | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<
    { id: string; display_name: string | null; email: string | null; avatar_path: string | null; birth_date: string | null } | null
  >(null);
  const [partnerAvatarUrl, setPartnerAvatarUrl] = useState<string | null>(null);
  const [profilePhotoOpen, setProfilePhotoOpen] = useState<string | null>(null);
  const [partnerLoading, setPartnerLoading] = useState(true);

  // 관계 시작일
  const [startDate, setStartDate] = useState(""); // <input type="date"> 값 ("" = 미설정)
  const [savedStartDate, setSavedStartDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => { if (!cancelled) setName(profile?.display_name ?? ""); });
    if (!profile?.avatar_path) {
      Promise.resolve().then(() => { if (!cancelled) setAvatarUrl(null); });
      return () => { cancelled = true; };
    }
    supabase.storage.from("profile-avatars").createSignedUrl(profile.avatar_path, 3600)
      .then(({ data }) => { if (!cancelled) setAvatarUrl(data?.signedUrl ?? null); });
    return () => { cancelled = true; };
  }, [profile?.display_name, profile?.avatar_path]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!profile?.couple_id) {
      router.replace("/onboarding");
      return;
    }
    let cancelled = false;
    supabase
      .from("couples")
      .select("invite_code, start_date")
      .eq("id", profile.couple_id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setInviteCode((data?.invite_code as string) ?? null);
        const sd = (data?.start_date as string | null) ?? null;
        setSavedStartDate(sd);
        setStartDate(sd ?? "");
        setLoading(false);
      });

    // 파트너 = 같은 커플의 나 아닌 프로필 (혹시 여러 개여도 첫 명만)
    supabase
      .from("profiles")
      .select("id, display_name, email, avatar_path")
      .eq("couple_id", profile.couple_id)
      .neq("id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .then(async ({ data }) => {
        if (cancelled) return;
        const row = data?.[0];
        const avatarPath = (row?.avatar_path as string | null) ?? null;
        setPartner(
          row
            ? {
                id: String(row.id),
                display_name: (row.display_name as string | null) ?? null,
                email: (row.email as string | null) ?? null,
                avatar_path: avatarPath,
                birth_date: null,
              }
            : null,
        );
        setPartnerAvatarUrl(null);
        if (avatarPath) {
          const { data: signed } = await supabase.storage
            .from("profile-avatars")
            .createSignedUrl(avatarPath, 3600);
          if (!cancelled) setPartnerAvatarUrl(signed?.signedUrl ?? null);
        }
        if (row?.id) {
          const { data: birthday } = await supabase
            .from("profiles")
            .select("birth_date")
            .eq("id", row.id)
            .maybeSingle();
          if (!cancelled) {
            setPartner((current) => current ? {
              ...current,
              birth_date: (birthday?.birth_date as string | null) ?? null,
            } : current);
          }
        }
        if (cancelled) return;
        setPartnerLoading(false);
      });

    supabase
      .from("profiles")
      .select("birth_date")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const birthday = (data?.birth_date as string | null) ?? null;
        setSavedBirthDate(birthday);
        setBirthDate(birthday ?? "");
      });

    return () => {
      cancelled = true;
    };
  }, [ready, user, profile, router]);

  if (!ready || !user || !profile?.couple_id) {
    return <p className="text-sm text-muted">불러오는 중…</p>;
  }

  const handleSaveStartDate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaveErr(null);
    setSaveMsg(null);
    setSaving(true);
    const value = startDate || null; // 비우면 미설정으로
    const { data, error } = await supabase
      .from("couples")
      .update({ start_date: value })
      .eq("id", profile.couple_id)
      .select("id");
    setSaving(false);
    if (error) {
      setSaveErr(`저장 실패: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) {
      // RLS 로 UPDATE 가 막히면 에러 없이 0행이 온다 (add-couple-start-date.sql 미적용 등)
      setSaveErr(
        "저장이 반영되지 않았어요. supabase/add-couple-start-date.sql 적용 여부를 확인해 주세요.",
      );
      return;
    }
    setSavedStartDate(value);
    setSaveMsg("저장했어요.");
  };

  const dirty = (startDate || null) !== (savedStartDate ?? null);

  const saveProfile = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const nameChanged = trimmedName !== (profile.display_name?.trim() ?? "");
    const birthdayChanged = (birthDate || null) !== savedBirthDate;
    if (!trimmedName || (!nameChanged && !pendingAvatar && !birthdayChanged)) return;

    setProfileBusy(true); setProfileErr(null); setProfileMsg(null);
    try {
      if (nameChanged) {
        const { error } = await supabase.rpc("update_my_display_name", {
          p_display_name: trimmedName,
        });
        if (error) throw error;
      }

      if (pendingAvatar) {
        const path = `${user.id}/avatar.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("profile-avatars")
          .upload(path, pendingAvatar, { contentType: "image/jpeg", upsert: true });
        if (uploadError) throw uploadError;
        const { error: updateError } = await supabase.rpc("set_my_avatar_path", {
          p_avatar_path: path,
        });
        if (updateError) throw updateError;

        const { data } = await supabase.storage
          .from("profile-avatars")
          .createSignedUrl(path, 3600);
        setAvatarUrl(data?.signedUrl ? `${data.signedUrl}&v=${Date.now()}` : null);
        setPendingAvatar(null);
        setAvatarPreviewUrl(null);
      }

      if (birthdayChanged) {
        const { error } = await supabase.rpc("update_my_birth_date", {
          p_birth_date: birthDate || null,
        });
        if (error) throw error;
        setSavedBirthDate(birthDate || null);
      }

      await refreshProfile();
      setProfileMsg("프로필을 저장했어요.");
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : "프로필 저장에 실패했어요.");
    } finally {
      setProfileBusy(false);
    }
  };

  const selectAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    const file=e.target.files?.[0]; if (!file) return;
    setProfileBusy(true); setProfileErr(null); setProfileMsg(null);
    try {
      const jpeg=await processImageToJpeg(file, 640);
      setPendingAvatar(jpeg);
      setAvatarPreviewUrl(URL.createObjectURL(jpeg));
      setProfileMsg("새 프로필 사진을 선택했어요. 저장 버튼을 눌러 적용해 주세요.");
    } catch (err) { setProfileErr(err instanceof Error ? err.message : "사진을 불러오지 못했어요."); }
    finally { setProfileBusy(false); e.target.value=""; }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">계정 관리</h1>
        <Link
          href="/"
          className="text-sm text-muted transition-colors hover:text-accent"
        >
          ← 홈으로
        </Link>
      </div>

      <div className="rounded-3xl bg-card p-5 ring-1 ring-border/70">
        <p className="text-xs font-medium text-muted">우리 커플 초대코드</p>
        <p className="my-3 break-all select-all rounded-2xl bg-accent/10 px-4 py-3 text-center text-2xl font-extrabold tracking-widest text-accent">
          {loading ? "…" : (inviteCode ?? "(코드 없음)")}
        </p>
        <p className="text-xs text-muted">
          파트너가 아직 합류 안 했다면 이 코드를 공유하세요. “초대코드로
          합류하기”에서 입력하면 같은 커플로 연결돼요.
        </p>
      </div>

      {/* 관계 시작일 */}
      <form
        onSubmit={handleSaveStartDate}
        className="rounded-3xl bg-card p-5 ring-1 ring-border/70"
      >
        <p className="text-xs font-medium text-muted">관계 시작일</p>
        <p className="mt-1 text-xs text-muted">
          “함께한 지 N일째” 계산의 기준이 돼요. 둘 중 누구든 수정할 수 있어요.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={startDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => {
              setStartDate(e.target.value);
              setSaveMsg(null);
              setSaveErr(null);
            }}
            disabled={loading || saving}
            className="rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-accent"
          />
          <button
            type="submit"
            disabled={loading || saving || !dirty}
            className="whitespace-nowrap rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
          {startDate && (
            <button
              type="button"
              onClick={() => {
                setStartDate("");
                setSaveMsg(null);
                setSaveErr(null);
              }}
              disabled={loading || saving}
              className="text-xs text-muted transition-colors hover:text-accent"
            >
              비우기
            </button>
          )}
        </div>
        {saveMsg && (
          <p className="mt-2 text-xs font-medium text-accent">{saveMsg}</p>
        )}
        {saveErr && (
          <p className="mt-2 text-xs font-medium text-red-600">{saveErr}</p>
        )}
      </form>

      <form onSubmit={saveProfile} className="rounded-3xl bg-card p-5 ring-1 ring-border/70">
        <p className="text-xs font-medium text-muted">프로필 수정</p>
        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative mx-auto h-24 w-24 shrink-0 sm:mx-0">
            <button
              type="button"
              onClick={() => {
                const url = avatarPreviewUrl || avatarUrl;
                if (url) setProfilePhotoOpen(url);
              }}
              disabled={!(avatarPreviewUrl || avatarUrl)}
              aria-label="내 프로필 사진 크게 보기"
              className="block h-24 w-24 rounded-full disabled:cursor-default"
            >
            <span className={`flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-3xl font-bold text-accent ring-4 ring-white shadow-md ${(avatarPreviewUrl || avatarUrl) ? "cursor-zoom-in transition hover:brightness-95" : ""}`}>
              {/* 비공개 Storage signed URL은 Next 이미지 최적화 프록시에 노출하지 않는다. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {(avatarPreviewUrl || avatarUrl) ? <img src={avatarPreviewUrl || avatarUrl || ""} alt="내 프로필" className="h-full w-full object-cover" /> : (profile.display_name?.trim().charAt(0) || "♡")}
            </span>
            </button>
            <label className="absolute bottom-0 right-0 cursor-pointer rounded-full bg-accent px-2 py-1 text-[10px] font-bold text-white shadow transition hover:bg-accent-hover">
              사진 변경
              <input type="file" accept="image/*,.heic,.heif" onChange={selectAvatar} disabled={profileBusy} className="sr-only" />
            </label>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <label className="block text-xs font-medium text-muted">이름(별명)</label>
            <input value={name} onChange={(e)=>setName(e.target.value)} maxLength={30} required className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent" />
            <p className="text-xs text-muted">별명을 바꾸면 과거 장소·추억·답장의 작성자 이름도 함께 변경돼요.</p>
            <label className="block text-xs font-medium text-muted">생일</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={birthDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => {
                  setBirthDate(e.target.value);
                  setProfileMsg(null);
                  setProfileErr(null);
                }}
                className="min-w-0 flex-1 rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent"
              />
              {birthDate && <button type="button" onClick={() => setBirthDate("")} className="shrink-0 text-xs text-muted hover:text-accent">비우기</button>}
            </div>
            <p className="text-xs text-muted">생일은 매년 우리의 기록 캘린더에 기념일로 표시돼요.</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            <button type="submit" disabled={profileBusy || !name.trim() || (!pendingAvatar && name.trim()===(profile.display_name?.trim() ?? "") && (birthDate || null) === savedBirthDate)} className="whitespace-nowrap rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{profileBusy ? "저장 중…" : "프로필 저장"}</button>
          </div>
        </div>
        {profileMsg && <p className="mt-3 text-xs font-medium text-accent">{profileMsg}</p>}
        {profileErr && <p className="mt-3 text-xs font-medium text-red-600">{profileErr}</p>}
      </form>

      <div className="rounded-3xl bg-card p-5 ring-1 ring-border/70">
        <p className="text-xs font-medium text-muted">파트너 계정</p>
        {partnerLoading ? (
          <p className="mt-2 text-sm text-muted">불러오는 중…</p>
        ) : partner ? (
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (partnerAvatarUrl) setProfilePhotoOpen(partnerAvatarUrl);
              }}
              disabled={!partnerAvatarUrl}
              aria-label={`${partner.display_name ?? "파트너"} 프로필 사진 크게 보기`}
              className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-lg font-bold text-accent ring-2 ring-white shadow-sm ${partnerAvatarUrl ? "cursor-zoom-in transition hover:brightness-95" : "cursor-default"}`}
            >
              {partnerAvatarUrl ? (
                // 비공개 Storage signed URL은 브라우저에서 직접 표시한다.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={partnerAvatarUrl}
                  alt={`${partner.display_name ?? "파트너"} 프로필`}
                  className="h-full w-full object-cover"
                />
              ) : (
                partner.display_name?.trim().charAt(0) || "♡"
              )}
            </button>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">
                {partner.display_name ?? "(이름 없음)"}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted">
                {partner.email ?? "(이메일 없음)"}
              </span>
              {partner.birth_date && <span className="mt-0.5 block text-[11px] text-muted-2">생일 {Number(partner.birth_date.slice(5, 7))}월 {Number(partner.birth_date.slice(8, 10))}일</span>}
            </span>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">
            아직 파트너가 합류하지 않았어요. 위 초대코드를 공유해 보세요.
          </p>
        )}
      </div>
      {profilePhotoOpen && (
        <Lightbox
          urls={[profilePhotoOpen]}
          onClose={() => setProfilePhotoOpen(null)}
        />
      )}
    </div>
  );
}
