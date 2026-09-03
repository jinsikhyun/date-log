"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/Header";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLandingPage = pathname === "/login" || pathname === "/auth/login-qa";

  if (isLandingPage) return <>{children}</>;

  return (
    <div className="min-h-screen lg:pl-[248px]">
      <Header />
      <div className="pb-[calc(56px+env(safe-area-inset-bottom))] lg:pb-0">
        {children}
      </div>
    </div>
  );
}
