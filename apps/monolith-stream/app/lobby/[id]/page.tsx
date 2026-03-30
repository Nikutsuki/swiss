"use client";

import { use, useEffect, useState } from "react";
import { useWebRTC, WebRTCProvider } from "@/hooks/useWebRTC";
import { useWebRTCStore } from "@/hooks/useWebRTC";
import { ShareLobby } from "@/components/ShareLobby";
import { ParticipantList } from "@/components/ParticipantList";
import { StreamControls } from "@/components/StreamControls";
import { VideoPlayer } from "@/components/VideoPlayer";
import { Chat } from "@/components/Chat";

function LobbyContent({ id }: { id: string }) {
  const { joinLobby, broadcastStream } = useWebRTC();
  const { error } = useWebRTCStore();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    joinLobby(id);
  }, [id, joinLobby]);

  const handleStreamReady = (stream: MediaStream | null, type: 'screen' | 'file' | 'none', url?: string | null) => {
    setLocalStream(type === 'screen' ? stream : null);
    setLocalVideoUrl(type === 'file' ? (url || null) : null);
    
    if (type === 'screen' || type === 'none') {
      broadcastStream(stream);
    } else if (type === 'file') {
      // For files, we clear current screen broadcast in VideoPlayer's effect
      // to avoid multiple rapid track updates.
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 p-6 min-h-screen">
      {error && (
        <div className="lg:col-span-4 bg-[#ffb4ab]/15 border border-[#ffb4ab]/30 text-[#ffb4ab] px-4 py-3 rounded-md flex justify-between items-center">
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}
      <div className="lg:col-span-3 flex flex-col gap-6">
        <StreamControls onStreamReady={handleStreamReady} />
        <VideoPlayer localStream={localStream} localVideoUrl={localVideoUrl} />
      </div>
      <div className="lg:col-span-1 flex flex-col gap-6 h-full">
        <ParticipantList />
        <Chat />
        <ShareLobby lobbyId={id} />
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