import type { Metadata } from "next";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://localhost:3004";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Nikutsuki",
    template: "%s · Nikutsuki",
  },
  description:
    "Portfolio and personal site for Nikutsuki — projects, writing, and contact.",
  applicationName: "Nikutsuki",
  openGraph: {
    title: "Nikutsuki",
    description:
      "Portfolio and personal site for Nikutsuki — projects, writing, and contact.",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "Nikutsuki",
    description:
      "Portfolio and personal site for Nikutsuki — projects, writing, and contact.",
  },
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" data-color-mode="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} ${jetbrainsMono.variable} antialiased bg-[#0a0a0a]`}>
        {children}
      </body>
    </html>
  );
}
