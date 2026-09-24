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

const siteUrl = process.env.NEXT_PUBLIC_FISZKI_URL ?? "https://localhost:3005";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Fiszki",
    template: "%s · Fiszki",
  },
  description:
    "Import study sets, drill multiple-choice quizzes, and learn flashcards with spaced repetition.",
  applicationName: "Fiszki",
  openGraph: {
    title: "Fiszki",
    description:
      "Import study sets, drill multiple-choice quizzes, and learn flashcards with spaced repetition.",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "Fiszki",
    description:
      "Import study sets, drill multiple-choice quizzes, and learn flashcards with spaced repetition.",
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
        <main className="flex min-h-0 w-full flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
