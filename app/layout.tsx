import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Talent Biz OS",
  description: "藝人與創作者的商務營運系統",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
