import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Swiss Auth",
    template: "%s · Swiss Auth",
  },
  description:
    "Passkey sign-in and SSO for Swiss apps. Authenticate once and return to the service you opened.",
  applicationName: "Swiss Auth",
  openGraph: {
    title: "Swiss Auth",
    description:
      "Passkey sign-in and SSO for Swiss apps. Authenticate once and return to the service you opened.",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "Swiss Auth",
    description:
      "Passkey sign-in and SSO for Swiss apps. Authenticate once and return to the service you opened.",
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
