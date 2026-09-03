import type { Metadata } from "next";
import { LoginLandingPreview } from "@/components/LoginLandingPreview";

export const metadata: Metadata = {
  title: "로그인 개편 미리보기 — date.log",
};

export default function LoginQaPage() {
  return <LoginLandingPreview />;
}
