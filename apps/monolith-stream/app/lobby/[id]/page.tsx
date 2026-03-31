"use client";

import { use, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useWebRTC, WebRTCProvider } from "@/hooks/useWebRTC";
import { useWebRTCStore } from "@/hooks/useWebRTC";
import { ShareLobby } from "@/components/ShareLobby";
import { ParticipantList } from "@/components/ParticipantList";
import { StreamControls, type StreamQuality } from "@/components/StreamControls";
import { VideoPlayer } from "@/components/VideoPlayer";
import { Shield, Radio, UserCircle2 } from "lucide-react";

const ChatPanel = dynamic(
  () => import("@/components/Chat").then((mod) => mod.Chat),
  { ssr: false },
);

function LobbyContent({ id }: { id: string }) {
  const { joinLobby, broadcastStream } = useWebRTC();
  const { error, theaterMode } = useWebRTCStore();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [quality, setQuality] = useState<StreamQuality>({
    resolution: "1080p",
    fps: 60,
    bitrateMbps: 8,
  });
  const [rightPanel, setRightPanel] = useState<"chat" | "participants" | "share">("chat");

  useEffect(() => {
    joinLobby(id);
  }, [id, joinLobby]);

  // If we're currently screen-sharing, re-apply sender encoding limits when quality changes.
  useEffect(() => {
    if (!localStream) return;
    if (localVideoUrl) return; // local file mode
    broadcastStream(localStream, "screen", quality);
  }, [broadcastStream, localStream, localVideoUrl, quality]);

  const handleStreamReady = (stream: MediaStream | null, type: 'screen' | 'file' | 'none', url?: string | null) => {
    setLocalStream(type === 'screen' ? stream : null);
    setLocalVideoUrl(type === 'file' ? (url || null) : null);
    
    if (type === 'screen' || type === 'none') {
      broadcastStream(stream, type, quality);
    } else if (type === 'file') {
      // For files, we clear current screen broadcast in VideoPlayer's effect
      // to avoid multiple rapid track updates.
    }
  };

  if (theaterMode) {
    return (
      <div className="flex h-dvh overflow-hidden bg-(--surface) p-4 gap-4">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0 relative">
            <VideoPlayer localStream={localStream} localVideoUrl={localVideoUrl} quality={quality} />
          </div>
        </div>
        <div className="w-80 flex flex-col shrink-0">
          <div className="h-full min-h-0 overflow-hidden">
            <ChatPanel />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-(--surface) text-(--on-surface)">
      <main className="pl-0 lg:pl-4 flex flex-col">

        <div className="flex-1 min-h-0 px-4 lg:px-12 pb-4 grid grid-cols-1 xl:grid-cols-12 gap-8">
          <div className="xl:col-span-8 space-y-6">
            {error && (
              <div className="bg-[#ffb4ab]/15 border border-[#ffb4ab]/30 text-[#ffb4ab] px-4 py-3 rounded-md flex justify-between items-center">
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}
            <div className="bg-(--surface-container-low) border border-white/5 p-4 lg:p-6">
              <StreamControls
                onStreamReady={handleStreamReady}
                quality={quality}
                onQualityChange={setQuality}
              />
            </div>
            <div className="relative bg-(--surface-container-lowest) border border-white/5 p-2 lg:p-3">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-(--surface-container-high)">
              </div>
              <div className="relative">
                <VideoPlayer localStream={localStream} localVideoUrl={localVideoUrl} quality={quality} />
              </div>
            </div>
          </div>

          <div className="xl:col-span-4 flex flex-col gap-4 min-h-0 xl:h-[calc(100dvh-6rem)]">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setRightPanel("chat")}
                className={`h-10 text-[11px] uppercase tracking-wider font-semibold border transition-colors ${
                  rightPanel === "chat"
                    ? "bg-(--security-emerald) text-black border-(--security-emerald)"
                    : "bg-(--surface-container-low) text-(--on-surface-variant) border-white/10 hover:text-(--on-surface)"
                }`}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => setRightPanel("participants")}
                className={`h-10 text-[11px] uppercase tracking-wider font-semibold border transition-colors ${
                  rightPanel === "participants"
                    ? "bg-(--security-emerald) text-black border-(--security-emerald)"
                    : "bg-(--surface-container-low) text-(--on-surface-variant) border-white/10 hover:text-(--on-surface)"
                }`}
              >
                Participants
              </button>
              <button
                type="button"
                onClick={() => setRightPanel("share")}
                className={`h-10 text-[11px] uppercase tracking-wider font-semibold border transition-colors ${
                  rightPanel === "share"
                    ? "bg-(--security-emerald) text-black border-(--security-emerald)"
                    : "bg-(--surface-container-low) text-(--on-surface-variant) border-white/10 hover:text-(--on-surface)"
                }`}
              >
                Share
              </button>
            </div>
            <div className="bg-(--surface-container-low) border border-white/5 p-4 lg:p-6 flex flex-col flex-1 min-h-0">
              {rightPanel === "chat" && (
                <div className="h-full min-h-0 overflow-hidden">
                  <ChatPanel />
                </div>
              )}
              {rightPanel === "participants" && (
                <div className="h-full min-h-0">
                  <ParticipantList />
                </div>
              )}
              {rightPanel === "share" && (
                <div className="h-full min-h-0">
                  <ShareLobby lobbyId={id} fitHeight />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function LobbyPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  
  return (
    <WebRTCProvider>
      <LobbyContent id={resolvedParams.id} />
    </WebRTCProvider>
  );
}