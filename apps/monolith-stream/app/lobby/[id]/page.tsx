"use client";

import { use, useEffect, useState } from "react";
import { useWebRTC, WebRTCProvider } from "@/hooks/useWebRTC";
import { useWebRTCStore } from "@/hooks/useWebRTC";
import { ShareLobby } from "@/components/ShareLobby";
import { ParticipantList } from "@/components/ParticipantList";
import { StreamControls, type StreamQuality } from "@/components/StreamControls";
import { VideoPlayer } from "@/components/VideoPlayer";
import { Chat } from "@/components/Chat";

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

  return (
    <div className={theaterMode ? "flex h-screen bg-black p-4 gap-4" : "grid grid-cols-1 lg:grid-cols-4 gap-6 p-6 min-h-screen"}>
      {error && !theaterMode && (
        <div className="lg:col-span-4 bg-[#ffb4ab]/15 border border-[#ffb4ab]/30 text-[#ffb4ab] px-4 py-3 rounded-md flex justify-between items-center">
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}
      <div className={theaterMode ? "flex-1 flex flex-col min-w-0" : "lg:col-span-3 flex flex-col gap-6"}>
        {!theaterMode && (
          <StreamControls
            onStreamReady={handleStreamReady}
            quality={quality}
            onQualityChange={setQuality}
          />
        )}
        <div className={theaterMode ? "flex-1 min-h-0 relative" : ""}>
          <VideoPlayer localStream={localStream} localVideoUrl={localVideoUrl} quality={quality} />
        </div>
      </div>
      <div className={theaterMode ? "w-80 flex flex-col shrink-0" : "lg:col-span-1 flex flex-col gap-6 h-full"}>
        {!theaterMode && <ParticipantList />}
        <div className={theaterMode ? "flex-1 min-h-0" : ""}>
          <Chat />
        </div>
        {!theaterMode && <ShareLobby lobbyId={id} />}
      </div>
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