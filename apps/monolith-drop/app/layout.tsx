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

const siteUrl = process.env.NEXT_PUBLIC_MONOLITH_DROP_URL ?? "https://localhost:3002";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Monolith Drop",
    template: "%s · Monolith Drop",
  },
  description:
    "Peer-to-peer file transfer over WebRTC. AES-GCM encryption in the browser; payload stays off the server.",
  applicationName: "Monolith Drop",
  openGraph: {
    title: "Monolith Drop",
    description:
      "Peer-to-peer file transfer over WebRTC. AES-GCM encryption in the browser; payload stays off the server.",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "Monolith Drop",
    description:
      "Peer-to-peer file transfer over WebRTC. AES-GCM encryption in the browser; payload stays off the server.",
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
