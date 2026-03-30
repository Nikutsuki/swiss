"use client";

import { useEffect, useRef } from "react";
import { useWebRTCStore, useWebRTC } from "@/hooks/useWebRTC";
import { Card } from "@swiss/ui";

interface VideoViewProps {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
}

function VideoView({ stream, label, muted = false }: VideoViewProps) {
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
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="w-full h-full object-contain"
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
}

interface ExtendedHTMLVideoElement extends HTMLVideoElement {
  captureStream?(): MediaStream;
  mozCaptureStream?(): MediaStream;
}

export function VideoPlayer({ localStream, localVideoUrl }: VideoPlayerProps) {
  const { remoteStreams, lastSyncEvent } = useWebRTCStore();
  const { broadcastSyncEvent, broadcastStream } = useWebRTC();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  
  const remotePeers = Object.keys(remoteStreams);
  
  // Handle file stream capturing and broadcasting
  useEffect(() => {
    if (localVideoUrl && localVideoRef.current) {
      const video = localVideoRef.current as ExtendedHTMLVideoElement;
      
      const setupCapture = () => {
        try {
          const stream = video.captureStream ? video.captureStream() : video.mozCaptureStream ? video.mozCaptureStream() : null;
          if (stream) {
            broadcastStream(stream);
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
  }, [localVideoUrl, broadcastStream]);

  // Handle incoming sync events
  useEffect(() => {
    if (!localVideoRef.current || !lastSyncEvent) return;

    const video = localVideoRef.current;
    
    // Ignore events if we're the ones who just broadcasted it to avoid loops
    // (In a more robust setup we'd check if we originated it, but this is simple)
    if (Math.abs(video.currentTime - lastSyncEvent.time) > 1) {
      video.currentTime = lastSyncEvent.time;
    }

    if (lastSyncEvent.action === "play" && video.paused) {
      video.play().catch(e => console.error("Playback failed", e));
    } else if (lastSyncEvent.action === "pause" && !video.paused) {
      video.pause();
    }
  }, [lastSyncEvent]);

  const handlePlay = () => {
    if (localVideoRef.current) {
      broadcastSyncEvent("play", localVideoRef.current.currentTime);
    }
  };

  const handlePause = () => {
    if (localVideoRef.current) {
      broadcastSyncEvent("pause", localVideoRef.current.currentTime);
    }
  };

  const handleSeeked = () => {
    if (localVideoRef.current) {
      broadcastSyncEvent("seek", localVideoRef.current.currentTime);
    }
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
        <VideoView key={peerId} stream={remoteStreams[peerId]} label={`Peer ${peerId.substring(0, 5)}`} />
      ))}
    </div>
  );
}