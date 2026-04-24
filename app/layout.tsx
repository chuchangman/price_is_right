import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "가격 맞추기 🎯",
  description: "SSAFY 라이브 가격 맞추기 게임",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
