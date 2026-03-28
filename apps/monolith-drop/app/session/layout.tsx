import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MONOLITH DROP | Bidirectional P2P Transfer",
  description:
    "Bidirectional P2P encrypted channel with simultaneous transmit and receive via WebRTC.",
};

export default function SessionLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
