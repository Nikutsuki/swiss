import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import AppShell from "@/components/AppShell";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_MONOLITH_URL ?? "https://localhost:3001";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Monolith",
    template: "%s · Monolith",
  },
  description:
    "Create encrypted, password-protected, or public pastes with client-side crypto. Share links with expiring access.",
  applicationName: "Monolith",
  openGraph: {
    title: "Monolith",
    description:
      "Create encrypted, password-protected, or public pastes with client-side crypto. Share links with expiring access.",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "Monolith",
    description:
      "Create encrypted, password-protected, or public pastes with client-side crypto. Share links with expiring access.",
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
          <AppShell>{children}</AppShell>
        </main>
      </body>
    </html>
  );
}
