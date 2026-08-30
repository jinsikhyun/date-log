import type { Metadata } from "next";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = {
  title: "로그인 — date.log",
};

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-sm px-5 py-14 sm:py-20">
      <LoginForm />
    </main>
  );
}
