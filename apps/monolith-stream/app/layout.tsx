import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_MONOLITH_STREAM_URL ?? "https://localhost:3003";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Monolith Stream",
    template: "%s · Monolith Stream",
  },
  description:
    "Direct peer-to-peer screen sharing over encrypted WebRTC. Open a lobby, broadcast, and watch together without a media relay.",
  applicationName: "Monolith Stream",
  openGraph: {
    title: "Monolith Stream",
    description:
      "Direct peer-to-peer screen sharing over encrypted WebRTC. Open a lobby, broadcast, and watch together without a media relay.",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "Monolith Stream",
    description:
      "Direct peer-to-peer screen sharing over encrypted WebRTC. Open a lobby, broadcast, and watch together without a media relay.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full h-full flex flex-col text-gray-50 antialiased">
        <Header />
        <main className="flex min-h-0 w-full flex-1 flex-col">
          {children}
        </main>
      </body>
    </html>
  );
}
