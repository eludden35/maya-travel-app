import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";

import "./globals.css";

/*
 * Type system — Fraunces (display) + Inter (text) + JetBrains Mono (money
 * tables only). All Google Fonts (SIL OFL). See
 * `app-context/product-engineering.md` -> "Design direction" -> "Type".
 *
 * Variables exposed here are consumed by the `@theme` block in globals.css,
 * which makes them available as Tailwind utilities (`font-display`,
 * `font-sans`, `font-mono`).
 */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Jettison",
  description:
    "Jettison is the mobile-first way for groups to plan, split, and settle shared trips and events — so no one fronts the money or chases anyone afterward.",
};

export const viewport: Viewport = {
  themeColor: "#faf7f2",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
