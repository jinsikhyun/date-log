import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { CurrentUserProvider } from "@/components/CurrentUserProvider";
import { CategoriesProvider } from "@/components/CategoriesProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "date.log — 우리가 함께 걸은 곳",
  description: "나와 그녀가 다녀온 맛집·카페·장소, 그리고 그곳에 남은 추억들",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <CategoriesProvider>
          <CurrentUserProvider>
            <Header />
            {children}
          </CurrentUserProvider>
        </CategoriesProvider>
      </body>
    </html>
  );
}
