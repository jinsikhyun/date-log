import type { Metadata } from "next";
import { SignupForm } from "@/components/SignupForm";

export const metadata: Metadata = {
  title: "회원가입 — date.log",
};

export default function SignupPage() {
  return (
    <main className="mx-auto max-w-sm px-5 py-14 sm:py-20">
      <SignupForm />
    </main>
  );
}
