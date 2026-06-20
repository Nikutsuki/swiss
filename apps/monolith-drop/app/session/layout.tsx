import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Transfer session",
  description:
    "Bidirectional P2P channel over WebRTC: send and receive at the same time with client-side encryption.",
  openGraph: {
    title: "Monolith Drop — Transfer session",
    description:
      "Bidirectional P2P channel over WebRTC: send and receive at the same time with client-side encryption.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Monolith Drop — Transfer session",
    description:
      "Bidirectional P2P channel over WebRTC: send and receive at the same time with client-side encryption.",
  },
};

export default function SessionLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
