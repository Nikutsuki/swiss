"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useWebRTCStore, useWebRTC } from "@/hooks/useWebRTC";
import { Card } from "@swiss/ui";
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Tv } from "lucide-react";
import type { StreamQuality } from "@/components/StreamControls";
import { Rnd } from "react-rnd";

const formatTime = (seconds: number) => {
  if (!seconds || Number.isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

function FloatingVideoWrapper({
  children,
  defaultX,
  defaultY,
  zIndex,
}: {
  children: React.ReactNode;
  defaultX: number;
  defaultY: number;
  zIndex: number;
}) {
  return (
    <Rnd
      default={{
        x: defaultX,
        y: defaultY,
        width: 320,
        height: 180,
      }}
      bounds="parent"
      lockAspectRatio={16 / 9}
      minWidth={200}
      maxWidth="100%"
      className="group/rnd absolute shadow-2xl shadow-black/50 rounded-lg overflow-hidden border border-white/10"
      style={{ zIndex }}
      dragHandleClassName="drag-handle"
    >
      <div className="w-full h-full relative">
        <div
          className="drag-handle absolute top-0 left-0 right-0 h-10 z-50 cursor-grab active:cursor-grabbing opacity-0 group-hover/rnd:opacity-100 bg-linear-to-b from-black/80 to-transparent transition-opacity flex items-start justify-center pt-2"
          title="Drag to move"
        >
          <div className="w-12 h-1.5 bg-white/50 rounded-full" />
        </div>

        {children}
      </div>
    </Rnd>
  );
}

interface CustomControlsProps {
  isLiveStream: boolean;
  duration?: number;
  syncEvent?: { action: string; time: number; timestamp: number };
  volume: number;
  isMuted: boolean;
  isFullscreen: boolean;
  theaterMode: boolean;
  onPlay?: (time: number) => void;
  onPause?: (time: number) => void;
  onSeek?: (time: number) => void;
  onVolumeChange: (vol: number) => void;
  onMuteToggle: () => void;
  onFullscreenToggle: () => void;
  onTheaterToggle: () => void;
}

function CustomControls({
  isLiveStream,
  duration,
  syncEvent,
  volume,
  isMuted,
  isFullscreen,
  theaterMode,
  onPlay,
  onPause,
  onSeek,
  onVolumeChange,
  onMuteToggle,
  onFullscreenToggle,
  onTheaterToggle,
}: CustomControlsProps) {
  const [localTime, setLocalTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const isScrubbingRef = useRef(false);
  const playStateRef = useRef({ baseTime: 0, startedAt: Date.now() });

  useEffect(() => {
    if (isLiveStream || !syncEvent) return;

    if (syncEvent.action === "play") setIsPlaying(true);
    else if (syncEvent.action === "pause") setIsPlaying(false);

    if (!isScrubbingRef.current) {
      let actualTime = syncEvent.time;
      if (syncEvent.action === "play") {
        const elapsedSinceEvent = (Date.now() - syncEvent.timestamp) / 1000;
        actualTime += Math.max(0, elapsedSinceEvent);
      }

      playStateRef.current = { baseTime: actualTime, startedAt: Date.now() };
      setLocalTime(actualTime);
    }
  }, [syncEvent, isLiveStream]);

  useEffect(() => {
    if (isLiveStream || !isPlaying || !duration) return;

    let frame = 0;
    const update = () => {
      if (!isScrubbingRef.current) {
        const elapsed = (Date.now() - playStateRef.current.startedAt) / 1000;
        setLocalTime(Math.min(playStateRef.current.baseTime + elapsed, duration));
      }
      frame = requestAnimationFrame(update);
    };

    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, duration, isLiveStream]);

  const handlePlayToggle = () => {
    if (isPlaying) {
      setIsPlaying(false);
      onPause?.(localTime);
      return;
    }

    setIsPlaying(true);
    playStateRef.current = { baseTime: localTime, startedAt: Date.now() };
    onPlay?.(localTime);
  };

  const handleScrubEnd = (e: React.PointerEvent<HTMLInputElement>) => {
    isScrubbingRef.current = false;
    const newTime = Number((e.target as HTMLInputElement).value);
    playStateRef.current = { baseTime: newTime, startedAt: Date.now() };
    onSeek?.(newTime);
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/90 to-transparent p-3 pt-8 flex items-center gap-3 opacity-0 hover:opacity-100 transition-opacity focus-within:opacity-100 pointer-events-auto">
      {!isLiveStream && duration !== undefined && (
        <>
          <button onClick={handlePlayToggle} className="text-white hover:text-[#52c488] transition-colors" type="button">
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <span className="text-white text-xs font-mono">{formatTime(localTime)}</span>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={localTime}
            onPointerDown={() => (isScrubbingRef.current = true)}
            onChange={(e) => setLocalTime(Number(e.target.value))}
            onPointerUp={handleScrubEnd}
            className="flex-1 accent-[#52c488] h-1.5 cursor-pointer bg-white/30 rounded-full min-w-0 appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[#52c488] [&::-webkit-slider-thumb]:rounded-full"
          />
          <span className="text-white text-xs font-mono">{formatTime(duration)}</span>
        </>
      )}

      {isLiveStream && <div className="flex-1" />}

      <div className="flex items-center gap-3 ml-2 border-l border-white/20 pl-3">
        <div className="flex items-center gap-2 group/volume">
          <button onClick={onMuteToggle} className="text-white hover:text-[#52c488] transition-colors" type="button">
            {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              if (isMuted) onMuteToggle();
              onVolumeChange(Number(e.target.value));
            }}
            className="w-0 opacity-0 group-hover/volume:w-16 group-hover/volume:opacity-100 transition-all duration-300 accent-[#52c488] h-1.5 cursor-pointer"
          />
        </div>

        <button
          onClick={onTheaterToggle}
          className={`hover:text-[#52c488] px-2 transition-colors ${theaterMode ? "text-[#52c488]" : "text-white"}`}
          title="Theater Mode"
          type="button"
        >
          <Tv className="w-4 h-4" />
        </button>

        <button onClick={onFullscreenToggle} className="text-white hover:text-[#52c488] transition-colors" type="button">
          {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}

interface VideoViewProps {
  stream?: MediaStream | null;
  videoUrl?: string | null;
  label: string;
  muted?: boolean;
  duration?: number;
  syncEvent?: any;
  isLiveStream?: boolean;
  isLocal?: boolean;
  // Native DOM events (Streamer uses these to trigger network broadcasts)
  onPlayNative?: (time: number) => void;
  onPauseNative?: (time: number) => void;
  onSeekedNative?: (time: number) => void;
  onLoadedMetadataNative?: () => void;
  // Network Requests (Viewers use these to ask the streamer to sync)
  remotePlayRequest?: (time: number) => void;
  remotePauseRequest?: (time: number) => void;
  remoteSeekRequest?: (time: number) => void;
  setVideoElementRef?: (el: HTMLVideoElement | null) => void;
}

function VideoView({
  stream,
  videoUrl,
  label,
  muted = false,
  duration,
  syncEvent,
  isLiveStream = false,
  isLocal = false,
  onPlayNative,
  onPauseNative,
  onSeekedNative,
  onLoadedMetadataNative,
  remotePlayRequest,
  remotePauseRequest,
  remoteSeekRequest,
  setVideoElementRef,
}: VideoViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Maintain stable DOM ref callback to avoid ref teardown/setup loops.
  const externalRef = useRef(setVideoElementRef);
  externalRef.current = setVideoElementRef;

  const handleVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (externalRef.current) {
      externalRef.current(el);
    }
  }, []);

  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isLocalMuted, setIsLocalMuted] = useState(muted);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { theaterMode, toggleTheaterMode } = useWebRTCStore();

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = isLocalMuted;
    }
  }, [volume, isLocalMuted]);

  // Handle Stream vs File Source
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      video.srcObject = stream;
      video.src = "";
      // Force streams to continuously consume frames. Headless player handles pausing.
      video.play().catch((err: any) => {
        if (err?.name === "NotAllowedError") setAutoplayBlocked(true);
      });
    } else if (videoUrl) {
      video.srcObject = null;
      video.src = videoUrl;
    }
  }, [stream, videoUrl]);

  // Network Sync Loop (Executes ONLY for remote viewers watching a file)
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !syncEvent || isLiveStream || isLocal) return;

    // Only apply currentTime to raw file URLs, never to MediaStreams
    if (!stream && videoUrl && Math.abs(videoEl.currentTime - syncEvent.time) > 1) {
      videoEl.currentTime = syncEvent.time;
    }

    if (syncEvent.action === "play" && videoEl.paused) {
      videoEl.play().then(() => setAutoplayBlocked(false)).catch((err: any) => {
        if (err?.name === "NotAllowedError") setAutoplayBlocked(true);
      });
    } else if (syncEvent.action === "pause" && !videoEl.paused) {
      videoEl.pause();
    }
  }, [syncEvent, isLiveStream, isLocal, stream, videoUrl]);

  // UI Interceptors (Routes UI clicks to local DOM or network based on role)
  const handleUiPlay = (t: number) => {
    if (!isLocal && remotePlayRequest) remotePlayRequest(t);
    else if (isLocal && onPlayNative) onPlayNative(t);
  };

  const handleUiPause = (t: number) => {
    if (!isLocal && remotePauseRequest) remotePauseRequest(t);
    else if (isLocal && onPauseNative) onPauseNative(t);
  };

  const handleUiSeek = (t: number) => {
    if (!isLocal && remoteSeekRequest) remoteSeekRequest(t);
    else if (isLocal && onSeekedNative) onSeekedNative(t);
  };

  if (!stream && !videoUrl) return null;

  return (
    <div
      ref={containerRef}
      className={`relative bg-black overflow-hidden group ${isFullscreen ? "fixed inset-0 z-50 rounded-none w-screen h-screen flex items-center justify-center" : "rounded-lg border border-[#444] aspect-video w-full h-full"}`}
    >
      <video
        ref={handleVideoRef}
        autoPlay={isLiveStream}
        playsInline
        muted={isLocalMuted}
        onLoadedMetadata={isLocal ? onLoadedMetadataNative : undefined}
        className={`w-full h-full object-contain ${!isLocal ? "pointer-events-none" : ""}`}
      />
      {!isFullscreen && (
        <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-xs text-white z-10">
          {label}
        </div>
      )}
      {autoplayBlocked && (
        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center pointer-events-auto">
          <button
            onClick={() => {
              if (videoRef.current) {
                videoRef.current.muted = false;
                setIsLocalMuted(false);
                videoRef.current.play().then(() => setAutoplayBlocked(false)).catch(() => undefined);
              }
            }}
            className="bg-[#52c488] text-black px-5 py-3 rounded-full font-bold flex items-center gap-2 hover:scale-105 transition-transform"
            type="button"
          >
            <Play className="w-5 h-5 fill-current" />
            Click to Join Audio & Play
          </button>
        </div>
      )}
      <CustomControls 
        isLiveStream={isLiveStream}
        duration={duration}
        syncEvent={syncEvent}
        volume={volume}
        isMuted={isLocalMuted}
        isFullscreen={isFullscreen}
        theaterMode={theaterMode}
        onVolumeChange={setVolume}
        onMuteToggle={() => setIsLocalMuted(!isLocalMuted)}
        onFullscreenToggle={toggleFullscreen}
        onTheaterToggle={toggleTheaterMode}
        onPlay={!isLiveStream ? handleUiPlay : undefined}
        onPause={!isLiveStream ? handleUiPause : undefined}
        onSeek={!isLiveStream ? handleUiSeek : undefined}
      />
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
    durationsByPeer,
    incomingSyncRequest,
    setIncomingSyncRequest,
  } = useWebRTCStore();
  const { broadcastSyncEvent, broadcastStream, broadcastStreamMode, sendSyncRequest, broadcastDuration } = useWebRTC();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const isFlushingRef = useRef(false);
  
  const remotePeers = Object.keys(remoteStreams);
  const { theaterMode } = useWebRTCStore();

  const [capturedFileStream, setCapturedFileStream] = useState<MediaStream | null>(null);
  
  // Let peers know this peer is the active file streamer as soon as we have a file URL,
  // even before the capture stream is fully ready.
  useEffect(() => {
    if (!localVideoUrl) return;
    broadcastStreamMode("file");
  }, [localVideoUrl, broadcastStreamMode]);

  useEffect(() => {
    if (!localVideoUrl) {
      setCapturedFileStream(null);
    }
  }, [localVideoUrl]);

  useEffect(() => {
    const video = localVideoRef.current as ExtendedHTMLVideoElement | null;
    if (!localVideoUrl || !video) return;

    // 1. RESTORE TIME ON REMOUNT (Fixes the 0:00 Theater Mode Reset)
    const state = useWebRTCStore.getState();
    const lastSync = state.syncEventsByPeer[state.peerId];

    if (lastSync) {
      let targetTime = lastSync.time;
      if (lastSync.action === "play") {
        const elapsed = (Date.now() - lastSync.timestamp) / 1000;
        targetTime += Math.max(0, elapsed);
      }
      if (Math.abs(video.currentTime - targetTime) > 0.5) {
        video.currentTime = targetTime;
        if (lastSync.action === "play") {
          video.play().catch(() => undefined);
        }
      }
    }

    // 2. Initialize Capture
    const initCapture = () => {
      try {
        const stream =
          video.captureStream ? video.captureStream() : video.mozCaptureStream ? video.mozCaptureStream() : null;
        if (stream) {
          setCapturedFileStream(stream);
          broadcastStream(stream, "file", {
            resolution: quality.resolution,
            fps: quality.fps,
            bitrateMbps: quality.bitrateMbps,
          });
        }
      } catch (err) {
        console.error("Failed to capture video stream", err);
      }
    };

    if (video.readyState >= 3) initCapture();
    else {
      const onCanPlay = () => {
        initCapture();
        video.removeEventListener("canplay", onCanPlay);
      };
      video.addEventListener("canplay", onCanPlay);
    }
  }, [localVideoUrl, broadcastStream, quality.resolution, quality.fps, quality.bitrateMbps]);

  const handleLocalUiPlay = (t: number) => {
    const video = localVideoRef.current;
    if (video) {
      if (Math.abs(video.currentTime - t) > 0.5) video.currentTime = t;
      video.play().catch(() => undefined);
    }
  };

  const handleLocalUiPause = (_t: number) => {
    localVideoRef.current?.pause();
  };

  const handleLocalUiSeek = async (t: number) => {
    const video = localVideoRef.current;
    if (!video) return;

    if (video.paused) {
      // Chromium workaround: flush a frame for captureStream on paused seek.
      isFlushingRef.current = true;
      video.currentTime = t;
      try {
        await new Promise((resolve) => {
          video.addEventListener("seeked", () => resolve(undefined), { once: true });
        });
        await video.play();
        video.pause();
      } catch (_e) {
        // noop
      }
      isFlushingRef.current = false;
      broadcastSyncEvent("seek", t);
    } else {
      video.currentTime = t;
    }
  };

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

  const handlePlay = () => {
    if (isFlushingRef.current || !localVideoRef.current || localSuppressRef.current) return;
    broadcastSyncEvent("play", localVideoRef.current.currentTime);
  };

  const handlePause = () => {
    if (isFlushingRef.current || !localVideoRef.current || localSuppressRef.current) return;
    broadcastSyncEvent("pause", localVideoRef.current.currentTime);
  };

  const handleSeeked = () => {
    if (isFlushingRef.current || !localVideoRef.current || localSuppressRef.current) return;
    const video = localVideoRef.current;

    // If the engine is still playing after a seek, force a 'play' broadcast so
    // remote peers resume playback (seeked doesn't always re-fire play()).
    if (!video.paused) {
      broadcastSyncEvent("play", video.currentTime);
    } else {
      broadcastSyncEvent("seek", video.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (!localVideoRef.current) return;
    broadcastDuration(localVideoRef.current.duration);
  };

  const handleRemotePlay = (sourcePeerId: string, time?: number) => {
    const fallbackSync = syncEventsByPeer[sourcePeerId];
    sendSyncRequest(sourcePeerId, "play", time ?? (fallbackSync ? fallbackSync.time : 0));
  };

  const handleRemotePause = (sourcePeerId: string, time?: number) => {
    const fallbackSync = syncEventsByPeer[sourcePeerId];
    sendSyncRequest(sourcePeerId, "pause", time ?? (fallbackSync ? fallbackSync.time : 0));
  };

  const handleRemoteSeeked = (sourcePeerId: string, time: number) => {
    sendSyncRequest(sourcePeerId, "seek", time);
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
    <>
      {/* THE HEADLESS PLAYER (Never unmounts, powers the entire system) */}
      {localVideoUrl && (
        <video
          ref={localVideoRef}
          src={localVideoUrl}
          className="w-px h-px opacity-0 absolute pointer-events-none"
          muted
          onPlay={handlePlay}
          onPause={handlePause}
          onSeeked={handleSeeked}
          onLoadedMetadata={handleLoadedMetadata}
        />
      )}

      {!theaterMode && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {localStream && (
            <VideoView stream={localStream} label="You (Screen)" muted={true} isLiveStream={true} isLocal={true} />
          )}

          {localVideoUrl && capturedFileStream && (
            <VideoView
              stream={capturedFileStream}
              label="You (File)"
              isLiveStream={false}
              isLocal={true}
              duration={durationsByPeer[peerId]}
              syncEvent={syncEventsByPeer[peerId]}
              onPlayNative={handleLocalUiPlay}
              onPauseNative={handleLocalUiPause}
              onSeekedNative={handleLocalUiSeek}
            />
          )}

          {remotePeers.map((peerId) => {
            const isFileMode = streamModesByPeer[peerId] === "file";
            return (
              <VideoView
                key={peerId}
                stream={remoteStreams[peerId]}
                label={`Peer ${peerId.substring(0, 5)}`}
                isLiveStream={!isFileMode}
                isLocal={false}
                duration={durationsByPeer[peerId]}
                syncEvent={syncEventsByPeer[peerId]}
                remotePlayRequest={(time: number) => handleRemotePlay(peerId, time)}
                remotePauseRequest={(time: number) => handleRemotePause(peerId, time)}
                remoteSeekRequest={(time: number) => handleRemoteSeeked(peerId, time)}
                setVideoElementRef={(el) => {
                  remoteVideoRefs.current[peerId] = el;
                }}
              />
            );
          })}
        </div>
      )}

      {theaterMode && (
        <div className="relative w-full h-full min-h-[600px] bg-black/50 rounded-lg overflow-hidden border border-[#333]">
          <div className="absolute inset-0 flex items-center justify-center text-white/20 pointer-events-none">
            <span className="font-mono text-sm">Theater Canvas Active</span>
          </div>

          {localStream && (
            <FloatingVideoWrapper defaultX={20} defaultY={20} zIndex={40}>
              <VideoView stream={localStream} label="You (Screen)" muted={true} isLiveStream={true} isLocal={true} />
            </FloatingVideoWrapper>
          )}

          {localVideoUrl && capturedFileStream && (
            <FloatingVideoWrapper defaultX={40} defaultY={40} zIndex={41}>
              <VideoView
                stream={capturedFileStream}
                label="You (File)"
                isLiveStream={false}
                isLocal={true}
                duration={durationsByPeer[peerId]}
                syncEvent={syncEventsByPeer[peerId]}
                onPlayNative={handleLocalUiPlay}
                onPauseNative={handleLocalUiPause}
                onSeekedNative={handleLocalUiSeek}
              />
            </FloatingVideoWrapper>
          )}

          {remotePeers.map((peerId, index) => {
            const isFileMode = streamModesByPeer[peerId] === "file";
            const offset = (index + 2) * 20;

            return (
              <FloatingVideoWrapper key={peerId} defaultX={offset} defaultY={offset} zIndex={50 + index}>
                <VideoView
                  stream={remoteStreams[peerId]}
                  label={`Peer ${peerId.substring(0, 5)}`}
                  isLiveStream={!isFileMode}
                  isLocal={false}
                  duration={durationsByPeer[peerId]}
                  syncEvent={syncEventsByPeer[peerId]}
                  remotePlayRequest={(time: number) => handleRemotePlay(peerId, time)}
                  remotePauseRequest={(time: number) => handleRemotePause(peerId, time)}
                  remoteSeekRequest={(time: number) => handleRemoteSeeked(peerId, time)}
                  setVideoElementRef={(el) => {
                    remoteVideoRefs.current[peerId] = el;
                  }}
                />
              </FloatingVideoWrapper>
            );
          })}
        </div>
      )}
    </>
  );
}