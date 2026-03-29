"use client";

import { StreamChatPanel } from "@/components/webrtc/stream-chat";
import { StreamJoinQR } from "@/components/webrtc/qr-code";
import { StreamView } from "@/components/webrtc/stream-view";
import { useStreamChat } from "@/src/hooks/use-stream-chat";
import { useWebRTCStream } from "@/src/hooks/use-webrtc-stream";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

const signalingWsBase =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_MONOLITH_STREAM_WS_URL ?? "").trim()
    : "";

export default function StreamSessionPage() {
  const params = useParams();
  const sessionId = String(params.sessionId ?? "");

  const stream = useWebRTCStream({
    sessionId,
    signalingWsBase,
    preferH264: true,
  });

  const chat = useStreamChat({
    sessionId,
    peerId: stream.peerId,
    signalingWsBase,
  });

  const [meEmail, setMeEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j && typeof j.email === "string") {
          setMeEmail(j.email);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const [joinUrl, setJoinUrl] = useState("");

  useEffect(() => {
    queueMicrotask(() => {
      if (!sessionId) {
        setJoinUrl("");
        return;
      }
      const u = new URL(window.location.href);
      u.pathname = `/${sessionId}`;
      u.search = "";
      setJoinUrl(u.toString());
    });
  }, [sessionId]);

  const remoteEntries = Object.entries(stream.remoteStreams);

  return (
    <div className="flex min-h-full min-w-0 flex-1 flex-col lg:flex-row">
      <main className="mx-auto flex min-h-0 min-w-0 flex-1 flex-col gap-6 p-4 lg:max-w-none lg:flex-1 lg:p-6">
        <nav className="flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="text-sm text-gray-400 underline-offset-4 hover:text-gray-200 hover:underline"
          >
            Home
          </Link>
          {meEmail && (
            <span className="text-xs text-gray-500">
              Signed in as <span className="text-gray-300">{meEmail}</span>
            </span>
          )}
        </nav>

        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Stream room</h1>
          <p className="text-sm text-gray-400">
            Session{" "}
            <span className="font-mono text-gray-300">{sessionId}</span>
          </p>
          <p className="text-xs text-gray-500">
            Invite others with the link or QR. Multiple people can share;
            quality depends on how many are sending. Prefer one presenter when
            possible.
          </p>
        </div>

        {stream.error && (
          <p
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
            role="alert"
          >
            {stream.error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void stream.startScreenShare()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Share screen
          </button>
          {stream.localStream && (
            <button
              type="button"
              onClick={() => stream.stopScreenShare()}
              className="rounded-lg border border-white/20 px-4 py-2 text-sm text-gray-200 hover:bg-white/5"
            >
              Stop sharing
            </button>
          )}
          <span className="text-sm text-gray-400">
            Media: <span className="text-gray-200">{stream.status}</span>
            {" · "}
            <span className="text-gray-200">{stream.roster.length}</span> peer
            {stream.roster.length !== 1 ? "s" : ""} in roster
          </span>
        </div>

        {joinUrl && (
          <section className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
            <h2 className="text-sm font-medium text-gray-200">Invite</h2>
            <p className="break-all font-mono text-xs text-gray-300">
              {joinUrl}
            </p>
            <div className="flex flex-wrap gap-4">
              <StreamJoinQR value={joinUrl} />
            </div>
          </section>
        )}

        <section className="flex flex-col gap-4">
          {stream.localStream && (
            <div>
              <h2 className="mb-2 text-sm font-medium text-gray-300">
                Your capture
              </h2>
              <StreamView stream={stream.localStream} muted />
            </div>
          )}
          <div>
            <h2 className="mb-2 text-sm font-medium text-gray-300">
              Remote streams ({remoteEntries.length})
            </h2>
            {remoteEntries.length === 0 ? (
              <p className="text-sm text-gray-500">
                No remote video yet. When someone shares, tiles appear here.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {remoteEntries.map(([remoteId, ms]) => (
                  <div
                    key={remoteId}
                    className="rounded-lg border border-white/10 bg-black/30 p-2"
                  >
                    <p className="mb-1 truncate font-mono text-xs text-gray-400">
                      {remoteId}
                    </p>
                    <StreamView stream={ms} muted={false} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <StreamChatPanel
        className="h-[40vh] shrink-0 lg:h-auto lg:w-80 lg:shrink-0"
        messages={chat.messages}
        sendText={chat.sendText}
        status={chat.status}
        selfPeerId={stream.peerId}
      />
    </div>
  );
}
