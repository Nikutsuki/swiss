"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Monolith Stream
        </h1>
        <p className="mt-2 text-gray-400">
          Low-latency screen sharing over WebRTC (P2P).
        </p>
      </div>
      <button
        type="button"
        onClick={() => router.push(`/${crypto.randomUUID()}`)}
        className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
      >
        Start stream
      </button>
      <p className="max-w-md text-center text-xs text-gray-500">
        You will get a join link and QR code to open in another browser window.
        Use Chromium for best H.264 hardware encoding.
      </p>
      <Link
        href="/api/stream/ping"
        className="text-xs text-gray-500 underline-offset-4 hover:text-gray-300 hover:underline"
      >
        API ping (rewritten)
      </Link>
    </main>
  );
}
