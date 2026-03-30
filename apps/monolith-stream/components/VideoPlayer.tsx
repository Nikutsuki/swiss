"use client";

import { useEffect, useRef } from "react";
import { useWebRTCStore, useWebRTC } from "@/hooks/useWebRTC";
import { Card } from "@swiss/ui";
import type { StreamQuality } from "@/components/StreamControls";

interface VideoViewProps {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  controls?: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onSeeked?: () => void;
  setVideoElementRef?: (el: HTMLVideoElement | null) => void;
}

function VideoView({
  stream,
  label,
  muted = false,
  controls = false,
  onPlay,
  onPause,
  onSeeked,
  setVideoElementRef,
}: VideoViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream) return null;

  return (
    <div className="relative bg-black rounded-lg overflow-hidden border border-(--outline-variant)/40 aspect-video">
      <video
        ref={(el) => {
          videoRef.current = el;
          setVideoElementRef?.(el);
        }}
        autoPlay
        playsInline
        muted={muted}
        className="w-full h-full object-contain"
        controls={controls}
        onPlay={onPlay}
        onPause={onPause}
        onSeeked={onSeeked}
      />
      <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-xs text-white">
        {label}
      </div>
    </div>
  );
}

interface VideoPlayerProps {
  localStream: MediaStream | null;
  localVideoUrl: string | null;
  quality: StreamQuality;
}

interface ExtendedHTMLVideoElement extends HTMLVideoElement {
  captureStream?(): MediaStream;
  mozCaptureStream?(): MediaStream;
}

export function VideoPlayer({ localStream, localVideoUrl, quality }: VideoPlayerProps) {
  const {
    peerId,
    remoteStreams,
    syncEventsByPeer,
    streamModesByPeer,
    incomingSyncRequest,
    setIncomingSyncRequest,
  } = useWebRTCStore();
  const { broadcastSyncEvent, broadcastStream, broadcastStreamMode, sendSyncRequest } = useWebRTC();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const remoteSuppressRef = useRef<Record<string, boolean>>({});
  
  const remotePeers = Object.keys(remoteStreams);
  
  // Let peers know this peer is the active file streamer as soon as we have a file URL,
  // even before the capture stream is fully ready.
  useEffect(() => {
    if (!localVideoUrl) return;
    broadcastStreamMode("file");
  }, [localVideoUrl, broadcastStreamMode]);

  // Handle file stream capturing and broadcasting
  useEffect(() => {
    if (localVideoUrl && localVideoRef.current) {
      const video = localVideoRef.current as ExtendedHTMLVideoElement;
      
      const setupCapture = () => {
        try {
          const stream = video.captureStream ? video.captureStream() : video.mozCaptureStream ? video.mozCaptureStream() : null;
          if (stream) {
            broadcastStream(stream, "file");
          }
        } catch (err) {
          console.error("Failed to capture video stream", err);
        }
      };

      // We need enough data to be loaded to capture a stream
      if (video.readyState >= 3) {
        setupCapture();
      } else {
        const handleCanPlay = () => {
          setupCapture();
          video.removeEventListener('canplay', handleCanPlay);
        };
        video.addEventListener('canplay', handleCanPlay);
      }
    }
  }, [localVideoUrl, broadcastStream, quality.fps, quality.resolution]);

  const localSuppressRef = useRef(false);

  // Apply incoming sync requests (viewer -> streamer) to the local file video,
  // then broadcast the synced state (streamer -> all viewers).
  useEffect(() => {
    if (!localVideoRef.current || !incomingSyncRequest) return;
    if (streamModesByPeer[peerId] !== "file") return;

    const video = localVideoRef.current;
    const targetTime = incomingSyncRequest.time;

    // Prevent local onPlay/onPause/seek handlers from re-sending sync_request loops.
    localSuppressRef.current = true;

    try {
      if (Math.abs(video.currentTime - targetTime) > 0.5) {
        video.currentTime = targetTime;
      }

      if (incomingSyncRequest.action === "play" && video.paused) {
        video.play().catch(e => console.error("Playback failed", e));
      } else if (incomingSyncRequest.action === "pause" && !video.paused) {
        video.pause();
      }
    } finally {
      localSuppressRef.current = false;
    }

    // Broadcast the authoritative synced state.
    broadcastSyncEvent(incomingSyncRequest.action, video.currentTime);
    setIncomingSyncRequest(null);
  }, [incomingSyncRequest, peerId, streamModesByPeer, broadcastSyncEvent, setIncomingSyncRequest]);

  // Keep remote file-stream playback aligned with the latest streamer sync event.
  useEffect(() => {
    for (const peerIdToSync of remotePeers) {
      const mode = streamModesByPeer[peerIdToSync];
      if (mode !== "file") continue;

      const sync = syncEventsByPeer[peerIdToSync];
      const videoEl = remoteVideoRefs.current[peerIdToSync];
      if (!videoEl || !sync) continue;

      // Avoid feedback loops from programmatic play/pause/seek.
      remoteSuppressRef.current[peerIdToSync] = true;

      if (Math.abs(videoEl.currentTime - sync.time) > 1) {
        videoEl.currentTime = sync.time;
      }

      if (sync.action === "play" && videoEl.paused) {
        videoEl.play().catch(() => undefined);
      } else if (sync.action === "pause" && !videoEl.paused) {
        videoEl.pause();
      }

      // Clear suppression on next tick (after native events fire).
      setTimeout(() => {
        remoteSuppressRef.current[peerIdToSync] = false;
      }, 0);
    }
  }, [remotePeers, streamModesByPeer, syncEventsByPeer]);

  const handlePlay = () => {
    if (!localVideoRef.current || localSuppressRef.current) return;
    broadcastSyncEvent("play", localVideoRef.current.currentTime);
  };

  const handlePause = () => {
    if (!localVideoRef.current || localSuppressRef.current) return;
    broadcastSyncEvent("pause", localVideoRef.current.currentTime);
  };

  const handleSeeked = () => {
    if (!localVideoRef.current || localSuppressRef.current) return;
    broadcastSyncEvent("seek", localVideoRef.current.currentTime);
  };

  const handleRemotePlay = (sourcePeerId: string) => {
    const videoEl = remoteVideoRefs.current[sourcePeerId];
    if (!videoEl || remoteSuppressRef.current[sourcePeerId]) return;
    sendSyncRequest(sourcePeerId, "play", videoEl.currentTime);
  };

  const handleRemotePause = (sourcePeerId: string) => {
    const videoEl = remoteVideoRefs.current[sourcePeerId];
    if (!videoEl || remoteSuppressRef.current[sourcePeerId]) return;
    sendSyncRequest(sourcePeerId, "pause", videoEl.currentTime);
  };

  const handleRemoteSeeked = (sourcePeerId: string) => {
    const videoEl = remoteVideoRefs.current[sourcePeerId];
    if (!videoEl || remoteSuppressRef.current[sourcePeerId]) return;
    sendSyncRequest(sourcePeerId, "seek", videoEl.currentTime);
  };
  
  const hasMedia = localStream || localVideoUrl || remotePeers.length > 0;

  if (!hasMedia) {
    return (
      <Card className="aspect-video flex items-center justify-center bg-(--surface-container-lowest)">
        <p className="text-(--on-surface-variant)">Waiting for media streams...</p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {localStream && <VideoView stream={localStream} label="You (Screen)" muted />}
      
      {localVideoUrl && (
        <div className="relative bg-black rounded-lg overflow-hidden border border-(--outline-variant)/40 aspect-video">
          <video
            ref={localVideoRef}
            src={localVideoUrl}
            controls
            onPlay={handlePlay}
            onPause={handlePause}
            onSeeked={handleSeeked}
            className="w-full h-full object-contain"
          />
          <div className="absolute top-2 right-2 bg-(--security-emerald)/90 text-black px-2 py-1 rounded text-xs font-medium">
            Syncing enabled
          </div>
          <div className="absolute bottom-12 left-2 bg-black/60 px-2 py-1 rounded text-xs text-white">
            You (File)
          </div>
        </div>
      )}

      {remotePeers.map(peerId => (
        <VideoView
          key={peerId}
          stream={remoteStreams[peerId]}
          label={`Peer ${peerId.substring(0, 5)}`}
          controls={streamModesByPeer[peerId] === "file"}
          onPlay={streamModesByPeer[peerId] === "file" ? () => handleRemotePlay(peerId) : undefined}
          onPause={streamModesByPeer[peerId] === "file" ? () => handleRemotePause(peerId) : undefined}
          onSeeked={streamModesByPeer[peerId] === "file" ? () => handleRemoteSeeked(peerId) : undefined}
          setVideoElementRef={(el) => {
            remoteVideoRefs.current[peerId] = el;
          }}
        />
      ))}
    </div>
  );
}