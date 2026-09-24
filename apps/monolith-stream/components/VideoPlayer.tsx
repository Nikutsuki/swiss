"use client";

import { useEffect, useRef, useState, useCallback, useMemo, type MutableRefObject } from "react";
import { useWebRTCStore, useWebRTC, type SubtitleTrack } from "@/hooks/useWebRTC";
import { Card } from "@swiss/ui";
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Tv, Subtitles } from "lucide-react";
import type { StreamQuality } from "@/components/StreamControls";
import { AnimatedDropdown } from "@/components/AnimatedDropdown";
import { Rnd } from "react-rnd";
import { AudioCompressor, MediaDataChannelPipeline, VideoCompressor } from "@swiss/webrtc-pipeline";
import { WebCodecsPlayer } from "@/components/WebCodecsPlayer/WebCodecsPlayer";
import { getBestEncodeHardwareAcceleration, type SupportedVideoCodec } from "@/lib/webcodecs/videoCodecNegotiation";
import { renderWebVttCueText } from "@/lib/vtt/renderCueText";

const formatTime = (seconds: number) => {
  if (!seconds || Number.isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const EMPTY_SUBTITLES: SubtitleTrack[] = [];

interface ParsedCue {
  start: number;
  end: number;
  text: string;
}

const parseVttTime = (raw: string): number => {
  const [hms, ms = "0"] = raw.split(".");
  const parts = hms.split(":").map((p) => Number(p));
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s + Number(ms.padEnd(3, "0")) / 1000;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return m * 60 + s + Number(ms.padEnd(3, "0")) / 1000;
  }
  return 0;
};

const parseWebVtt = (content: string): ParsedCue[] => {
  const text = content.replace(/\r\n/g, "\n").trim();
  const lines = text.split("\n");
  const cues: ParsedCue[] = [];
  let i = 0;

  // Optional WEBVTT header
  if (lines[i]?.startsWith("WEBVTT")) {
    i++;
    while (i < lines.length && lines[i].trim() === "") i++;
  }

  while (i < lines.length) {
    // Optional cue identifier
    if (lines[i] && !lines[i].includes("-->")) {
      i++;
    }
    if (i >= lines.length) break;

    const timingLine = lines[i];
    const match = timingLine.match(
      /([\d:.]+)\s*-->\s*([\d:.]+)/
    );
    if (!match) {
      i++;
      continue;
    }
    const start = parseVttTime(match[1]);
    const end = parseVttTime(match[2]);
    i++;

    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      textLines.push(lines[i]);
      i++;
    }

    cues.push({
      start,
      end,
      text: textLines.join("\n"),
    });

    while (i < lines.length && lines[i].trim() === "") i++;
  }

  return cues;
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
        width: 260,
        height: 146,
      }}
      bounds="parent"
      lockAspectRatio={16 / 9}
      minWidth={140}
      maxWidth="100%"
      className="group/rnd absolute shadow-2xl shadow-black/50 rounded-lg overflow-hidden border border-white/10"
      style={{ zIndex }}
      dragHandleClassName="drag-handle"
    >
      <div className="w-full h-full relative">
        <div
          className="drag-handle absolute top-0 left-0 right-0 h-10 z-50 cursor-grab active:cursor-grabbing opacity-100 sm:opacity-0 sm:group-hover/rnd:opacity-100 bg-linear-to-b from-black/80 to-transparent transition-opacity flex items-start justify-center pt-2"
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
  syncEvent?: { action: string; time: number; timestamp: number; receivedAtMs?: number };
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
  subtitleOptions?: { id: string; label: string; language: string }[];
  selectedSubtitleId?: string | null;
  onSubtitleSelect?: (subtitleId: string | null) => void;
  alwaysVisible?: boolean;
  /** WebCodecs receive buffer / pre-play: freeze scrubber extrapolation while video is static. */
  playbackTimelineFrozen?: boolean;
  /** Latest scrubber presentation time — used to align subtitles with WebCodecs (no video element clock). */
  scrubberMediaTimeRef?: MutableRefObject<number>;
  /**
   * WebCodecs only: queued media in the receiver buffer (seconds). Inbound host sync times are ahead
   * of the picture by about this much; we convert to presentation time. Outbound play/pause/seek use
   * presentation time so “pause at 0:20” tells the host to seek to 0:20, not 0:23.
   */
  playbackDisplayLagSec?: number;
  /** File mode: scrubber play/pause; live mode: always true. Used to hide WebCodecs buffering while paused. */
  onPresentationPlayingChange?: (playing: boolean) => void;
  /** Player wrapper for keyboard shortcuts (hover or focus within). */
  playerContainerRef?: MutableRefObject<HTMLDivElement | null>;
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
  subtitleOptions = [],
  selectedSubtitleId = null,
  onSubtitleSelect,
  alwaysVisible = false,
  playbackTimelineFrozen = false,
  scrubberMediaTimeRef,
  playbackDisplayLagSec = 0,
  onPresentationPlayingChange,
  playerContainerRef,
}: CustomControlsProps) {
  const [localTime, setLocalTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const isScrubbingRef = useRef(false);
  const playStateRef = useRef({ baseTime: 0, startedAt: Date.now() });
  const localTimeRef = useRef(0);
  localTimeRef.current = localTime;
  const playbackTimelineFrozenRef = useRef(playbackTimelineFrozen);
  playbackTimelineFrozenRef.current = playbackTimelineFrozen;
  const prevTimelineFrozenRef = useRef(playbackTimelineFrozen);
  const lastFrozenPlaySyncKeyRef = useRef<string | null>(null);

  const lagSec = Math.max(0, playbackDisplayLagSec);

  const toPresentation = (hostMediaSeconds: number) => {
    const raw = hostMediaSeconds - lagSec;
    if (duration !== undefined) return Math.max(0, Math.min(raw, duration));
    return Math.max(0, raw);
  };

  useEffect(() => {
    if (scrubberMediaTimeRef) scrubberMediaTimeRef.current = localTime;
  }, [localTime, scrubberMediaTimeRef]);

  useEffect(() => {
    if (isLiveStream) return;
    const wasFrozen = prevTimelineFrozenRef.current;
    prevTimelineFrozenRef.current = playbackTimelineFrozen;
    if (!isPlaying || duration === undefined) return;
    if (!wasFrozen && playbackTimelineFrozen) {
      playStateRef.current = { baseTime: localTimeRef.current, startedAt: Date.now() };
    } else if (wasFrozen && !playbackTimelineFrozen) {
      playStateRef.current = { baseTime: localTimeRef.current, startedAt: Date.now() };
    }
  }, [playbackTimelineFrozen, isPlaying, duration, isLiveStream]);
  const subtitleDropdownOptions = [
    { value: "off", label: "Off" },
    ...subtitleOptions.map((subtitle) => ({
      value: subtitle.id,
      label: `${subtitle.label} (${subtitle.language})`,
    })),
  ];

  useEffect(() => {
    if (isLiveStream || !syncEvent) return;

    if (syncEvent.action === "play") setIsPlaying(true);
    else if (syncEvent.action === "pause") setIsPlaying(false);

    if (isScrubbingRef.current) return;

    if (playbackTimelineFrozen && syncEvent.action === "play") {
      const dedupeKey = `${syncEvent.timestamp}:${Math.round(lagSec * 100)}`;
      if (lastFrozenPlaySyncKeyRef.current === dedupeKey) {
        return;
      }
      lastFrozenPlaySyncKeyRef.current = dedupeKey;
    } else {
      lastFrozenPlaySyncKeyRef.current = null;
    }

    let hostMediaTime = syncEvent.time;
    if (syncEvent.action === "play") {
      const elapsedSinceEvent = (Date.now() - (syncEvent.receivedAtMs ?? syncEvent.timestamp)) / 1000;
      hostMediaTime += Math.max(0, elapsedSinceEvent);
    }

    const presentationTime = toPresentation(hostMediaTime);
    playStateRef.current = { baseTime: presentationTime, startedAt: Date.now() };
    setLocalTime(presentationTime);
  }, [syncEvent, isLiveStream, playbackTimelineFrozen, playbackDisplayLagSec, duration]);

  useEffect(() => {
    onPresentationPlayingChange?.(isLiveStream ? true : isPlaying);
  }, [isLiveStream, isPlaying, onPresentationPlayingChange]);

  useEffect(() => {
    if (isLiveStream || !isPlaying || !duration) return;

    let frame = 0;
    const update = () => {
      if (!isScrubbingRef.current && !playbackTimelineFrozenRef.current) {
        const elapsed = (Date.now() - playStateRef.current.startedAt) / 1000;
        setLocalTime(Math.min(playStateRef.current.baseTime + elapsed, duration));
      }
      frame = requestAnimationFrame(update);
    };

    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, duration, isLiveStream, playbackTimelineFrozen]);

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
    if (duration === undefined) return;
    isScrubbingRef.current = false;
    const t = Math.min(Math.max(0, Number((e.target as HTMLInputElement).value)), duration);
    playStateRef.current = { baseTime: t, startedAt: Date.now() };
    setLocalTime(t);
    onSeek?.(t);
  };

  const handleSeekTo = useCallback(
    (t: number) => {
      if (duration === undefined) return;
      const clamped = Math.min(Math.max(0, t), duration);
      isScrubbingRef.current = false;
      playStateRef.current = { baseTime: clamped, startedAt: Date.now() };
      setLocalTime(clamped);
      onSeek?.(clamped);
    },
    [duration, onSeek],
  );

  const handlePlayToggleRef = useRef(handlePlayToggle);
  handlePlayToggleRef.current = handlePlayToggle;
  const handleSeekToRef = useRef(handleSeekTo);
  handleSeekToRef.current = handleSeekTo;

  useEffect(() => {
    const container = playerContainerRef?.current;
    if (!container) return;

    const isTypingTarget = (target: EventTarget | null) => {
      if (!target || !(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (target.isContentEditable) return true;
      return false;
    };

    const isPlayerActive = () =>
      container.matches(":hover") || container.contains(document.activeElement);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (!isPlayerActive()) return;
      if (isTypingTarget(e.target)) return;

      if (e.code === "KeyM") {
        e.preventDefault();
        onMuteToggle();
        return;
      }

      if (isLiveStream || duration === undefined) return;

      if (e.code === "Space") {
        e.preventDefault();
        handlePlayToggleRef.current();
        return;
      }
      if (e.code === "ArrowLeft") {
        e.preventDefault();
        handleSeekToRef.current(localTimeRef.current - 5);
        return;
      }
      if (e.code === "ArrowRight") {
        e.preventDefault();
        handleSeekToRef.current(localTimeRef.current + 5);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [playerContainerRef, isLiveStream, duration, onMuteToggle]);

  return (
    <div className={`absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/90 to-transparent p-2 sm:p-3 pt-6 sm:pt-8 flex flex-wrap items-center gap-2 sm:gap-3 transition-opacity focus-within:opacity-100 pointer-events-auto ${alwaysVisible ? "opacity-100" : "opacity-100 sm:opacity-0 sm:hover:opacity-100"}`}>
      {!isLiveStream && duration !== undefined && (
        <>
          <button onClick={handlePlayToggle} className="text-white hover:text-[#52c488] transition-colors" type="button">
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <span className="text-white text-[10px] sm:text-xs font-mono">{formatTime(localTime)}</span>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={localTime}
            onPointerDown={() => (isScrubbingRef.current = true)}
            onChange={(e) => {
              if (duration === undefined) return;
              const d = Number(e.target.value);
              setLocalTime(Math.min(Math.max(0, d), duration));
            }}
            onPointerUp={handleScrubEnd}
            className="flex-1 basis-[120px] accent-[#52c488] h-1.5 cursor-pointer bg-white/30 rounded-full min-w-0 appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[#52c488] [&::-webkit-slider-thumb]:rounded-full"
          />
          <span className="text-white text-[10px] sm:text-xs font-mono">{formatTime(duration)}</span>
        </>
      )}

      {isLiveStream && <div className="flex-1" />}

      <div className="flex items-center gap-2 sm:gap-3 ml-auto border-l border-white/20 pl-2 sm:pl-3">
        {subtitleOptions.length > 0 && onSubtitleSelect && (
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-[160px]">
            <Subtitles className="w-4 h-4 text-white/80" />
            <AnimatedDropdown
              compact
              options={subtitleDropdownOptions}
              value={selectedSubtitleId ?? "off"}
              onChange={(next) => onSubtitleSelect(next === "off" ? null : next)}
              triggerClassName="bg-black/40 border-white/20 min-w-[140px]"
              listClassName="bg-black/90 border-white/20"
            />
          </div>
        )}

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
            className={`transition-all duration-300 accent-[#52c488] h-1.5 cursor-pointer ${alwaysVisible ? "w-16 opacity-100" : "w-16 sm:w-0 opacity-100 sm:opacity-0 sm:group-hover/volume:w-16 sm:group-hover/volume:opacity-100"}`}
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
  subtitles?: SubtitleTrack[];
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
  surface?: (ctx: {
    volume: number;
    muted: boolean;
    presentationPlaying: boolean;
    setPlaybackTimelineHold: (hold: boolean) => void;
    setWebCodecsReceiveBufferMs: (ms: number) => void;
  }) => React.ReactNode;
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
  subtitles = [],
  onPlayNative,
  onPauseNative,
  onSeekedNative,
  onLoadedMetadataNative,
  remotePlayRequest,
  remotePauseRequest,
  remoteSeekRequest,
  setVideoElementRef,
  surface,
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

  const [volume, setVolume] = useState(1);
  const [isLocalMuted, setIsLocalMuted] = useState(muted);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [subtitleFontSizePx, setSubtitleFontSizePx] = useState(48);
  const { theaterMode, toggleTheaterMode } = useWebRTCStore();
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [parsedSubtitles, setParsedSubtitles] = useState<Record<string, ParsedCue[]>>({});
  const [activeCueText, setActiveCueText] = useState<string>("");
  const [alwaysShowControls, setAlwaysShowControls] = useState(false);
  const [playbackTimelineHold, setPlaybackTimelineHold] = useState(false);
  const [webCodecsReceiveBufferMs, setWebCodecsReceiveBufferMs] = useState(0);
  const [presentationPlaying, setPresentationPlaying] = useState(isLiveStream);
  const scrubberMediaTimeRef = useRef(0);
  const hasSurface = Boolean(surface);

  const handlePresentationPlayingChange = useCallback((playing: boolean) => {
    setPresentationPlaying(playing);
  }, []);

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const update = () => setAlwaysShowControls(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSubtitleSize = () => {
      const { width, height } = container.getBoundingClientRect();
      const base = Math.min(width, height);
      const size = Math.max(18, Math.min(64, Math.round(base * 0.08)));
      setSubtitleFontSizePx(size);
    };

    updateSubtitleSize();
    const observer = new ResizeObserver(updateSubtitleSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!subtitles.length) {
      setParsedSubtitles((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      setSelectedSubtitleId((prev) => (prev == null ? prev : null));
      setActiveCueText((prev) => (prev === "" ? prev : ""));
      return;
    }

    const parsed: Record<string, ParsedCue[]> = {};
    subtitles.forEach((sub) => {
      parsed[sub.id] = parseWebVtt(sub.content);
    });
    setParsedSubtitles(parsed);

    if (!selectedSubtitleId || !parsed[selectedSubtitleId]) {
      setSelectedSubtitleId(subtitles[0]?.id ?? null);
      setActiveCueText("");
    }
  }, [subtitles]);

  useEffect(() => {
    setActiveCueText((prev) => (prev === "" ? prev : ""));
  }, [selectedSubtitleId]);

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

  useEffect(() => {
    const video = videoRef.current;
    if (!video && !syncEvent) return;

    let frame = 0;
    const tick = () => {
      const cues = selectedSubtitleId ? parsedSubtitles[selectedSubtitleId] : undefined;
      if (!cues || !cues.length) {
        setActiveCueText((prev) => (prev === "" ? prev : ""));
        frame = requestAnimationFrame(tick);
        return;
      }

      // For file mode, use the synced timeline (seek/play/pause) instead of MediaStream currentTime.
      // This avoids desync when playback is driven by a headless source + captured stream.
      let subtitleTime = video?.currentTime ?? 0;
      if (!isLiveStream && syncEvent) {
        const mirrorScrubber = hasSurface && !isLocal && syncEvent.action === "play";
        if (mirrorScrubber) {
          subtitleTime = scrubberMediaTimeRef.current;
        } else if (syncEvent.action === "play") {
          const syncedElapsed = (Date.now() - (syncEvent.receivedAtMs ?? syncEvent.timestamp)) / 1000;
          subtitleTime = syncEvent.time + Math.max(0, syncedElapsed);
        } else {
          subtitleTime = syncEvent.time;
        }
      }

      const active = cues.find((cue) => subtitleTime >= cue.start && subtitleTime <= cue.end) ?? null;
      const nextText = active ? active.text : "";
      setActiveCueText((prev) => (prev === nextText ? prev : nextText));
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [parsedSubtitles, selectedSubtitleId, syncEvent, isLiveStream, hasSurface, isLocal]);

  // Handle Stream vs File Source
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      video.srcObject = stream;
      video.src = "";
      // Force streams to continuously consume frames. Headless player handles pausing.
      video.play().catch((err: any) => {
        if (err?.name === "NotAllowedError") {
          // Autoplay commonly fails with audio; retry muted instead of showing a second start CTA.
          video.muted = true;
          setIsLocalMuted(true);
          void video.play().catch(() => undefined);
        }
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
      videoEl.play().catch((err: any) => {
        if (err?.name === "NotAllowedError") {
          videoEl.muted = true;
          setIsLocalMuted(true);
          void videoEl.play().catch(() => undefined);
        }
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

  if (!stream && !videoUrl && !surface) return null;

  return (
    <div
      ref={containerRef}
      role="group"
      tabIndex={0}
      aria-label={label ? `Video: ${label}` : "Video player"}
      className={`relative bg-black overflow-hidden group outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${isFullscreen ? "fixed inset-0 z-50 rounded-none w-screen h-screen flex items-center justify-center" : "rounded-lg border border-[#444] aspect-video w-full h-full"}`}
    >
      {surface ? (
        <div className="w-full h-full">
          {surface({
            volume,
            muted: isLocalMuted,
            presentationPlaying,
            setPlaybackTimelineHold,
            setWebCodecsReceiveBufferMs,
          })}
        </div>
      ) : (
        <video
          ref={handleVideoRef}
          autoPlay={isLiveStream}
          playsInline
          muted={isLocalMuted}
          onLoadedMetadata={isLocal ? onLoadedMetadataNative : undefined}
          className={`w-full h-full object-contain ${!isLocal ? "pointer-events-none" : ""}`}
          crossOrigin="anonymous"
        />
      )}
      {!isFullscreen && (
        <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] sm:text-xs text-white z-10">
          {label}
        </div>
      )}
      {activeCueText && (
        <div
          className="absolute antialiased bottom-14 sm:bottom-16 left-1/2 -translate-x-1/2 px-3 py-2 rounded font-semibold text-white text-center whitespace-pre-line w-full pointer-events-none [&_strong]:font-bold [&_em]:italic not-italic [&_u]:underline"
          style={{
            fontSize: `${subtitleFontSizePx}px`,
            lineHeight: 1.2,
            textShadow:
              "-2px -2px 0 #000, 0 -2px 0 #000, 2px -2px 0 #000, 2px 0 0 #000, 2px 2px 0 #000, 0 2px 0 #000, -2px 2px 0 #000, -2px 0 0 #000, 0 0 10px rgba(0,0,0,0.9)",
          }}
        >
          {renderWebVttCueText(activeCueText)}
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
        subtitleOptions={subtitles.map((s) => ({
          id: s.id,
          label: s.label,
          language: s.language,
        }))}
        selectedSubtitleId={selectedSubtitleId}
        onSubtitleSelect={setSelectedSubtitleId}
        alwaysVisible={alwaysShowControls}
        playbackTimelineFrozen={playbackTimelineHold}
        scrubberMediaTimeRef={scrubberMediaTimeRef}
        playbackDisplayLagSec={surface && !isLocal ? webCodecsReceiveBufferMs / 1000 : 0}
        onPresentationPlayingChange={
          surface ? handlePresentationPlayingChange : undefined
        }
        playerContainerRef={containerRef}
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
    participants,
    syncEventsByPeer,
    streamModesByPeer,
    durationsByPeer,
    incomingSyncRequest,
    subtitlesByPeer,
    inboundTransportModeByPeer,
    outboundTransportModeByPeer,
    outboundWebcodecsVideoCodec,
    setIncomingSyncRequest,
  } = useWebRTCStore();
  const {
    broadcastSyncEvent,
    broadcastStream,
    broadcastStreamMode,
    sendSyncRequest,
    broadcastDuration,
    sendBinaryToPeers,
    getDataChannelForPeer,
    broadcastActiveVideoCodec,
    getActiveVideoCodecForPeer,
  } = useWebRTC();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const isFlushingRef = useRef(false);
  
  const remotePeers = Array.from(
    new Set([
      ...Object.keys(remoteStreams),
      ...Object.keys(streamModesByPeer),
      ...participants.filter((id) => id !== peerId),
    ]),
  )
    .filter((id) => id !== peerId)
    .filter((id) => {
      if (remoteStreams[id]) return true;
      const mode = streamModesByPeer[id];
      return mode === "file" || mode === "screen";
    });

  const allOutboundPeerIds = useMemo(() => Object.keys(outboundTransportModeByPeer), [outboundTransportModeByPeer]);
  const webcodecsOutboundPeerIds = useMemo(
    () => allOutboundPeerIds.filter((id) => outboundTransportModeByPeer[id] === "webcodecs"),
    [allOutboundPeerIds, outboundTransportModeByPeer],
  );
  const webrtcOutboundPeerIds = useMemo(
    () => allOutboundPeerIds.filter((id) => outboundTransportModeByPeer[id] !== "webcodecs"),
    [allOutboundPeerIds, outboundTransportModeByPeer],
  );

  const hasWebcodecsOutboundPeers = webcodecsOutboundPeerIds.length > 0;

  const webcodecsOutboundPeerIdsRef = useRef<string[]>(webcodecsOutboundPeerIds);
  useEffect(() => {
    webcodecsOutboundPeerIdsRef.current = webcodecsOutboundPeerIds;
  }, [webcodecsOutboundPeerIds]);

  // Shared outbound WebCodecs codec chosen by compatibility negotiation.
  const outboundVideoCodec = outboundWebcodecsVideoCodec;
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
        const elapsed = (Date.now() - (lastSync.receivedAtMs ?? lastSync.timestamp)) / 1000;
        targetTime += Math.max(0, elapsed);
      }
      if (Math.abs(video.currentTime - targetTime) > 0.5) {
        video.currentTime = targetTime;
        if (lastSync.action === "play") {
          video.play().catch(() => undefined);
        }
      }
    }

    // 2. Initialize capture for local preview.
    // In WebCodecs mode this is local-only; in WebRTC mode it is also broadcast.
    const initCapture = () => {
      try {
        const stream =
          video.captureStream ? video.captureStream() : video.mozCaptureStream ? video.mozCaptureStream() : null;
        if (stream) {
          setCapturedFileStream(stream);
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
  }, [localVideoUrl]);

  // File mode: send WebRTC tracks only to peers negotiated `webrtc`.
  useEffect(() => {
    if (!capturedFileStream || !localVideoUrl) return;

    broadcastStream(
      capturedFileStream,
      "file",
      {
        resolution: quality.resolution,
        fps: quality.fps,
        bitrateMbps: quality.bitrateMbps,
      },
      webrtcOutboundPeerIds,
    );
  }, [
    capturedFileStream,
    localVideoUrl,
    broadcastStream,
    quality.resolution,
    quality.fps,
    quality.bitrateMbps,
    webrtcOutboundPeerIds,
  ]);

  useEffect(() => {
    const video = localVideoRef.current;
    const encoderCodec = outboundVideoCodec;
    if (!video || !localVideoUrl || !encoderCodec || !hasWebcodecsOutboundPeers) return;

    let cancelled = false;
    const pipeline = new MediaDataChannelPipeline(
      {
        readyState: "open",
        send: (data) => {
          const bytes = ArrayBuffer.isView(data)
            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            : new Uint8Array(data);
          sendBinaryToPeers(bytes, webcodecsOutboundPeerIdsRef.current);
        },
      },
      () => {},
    );

    const resolutionMap: Record<StreamQuality["resolution"], { width: number; height: number }> = {
      "720p": { width: 1280, height: 720 },
      "1080p": { width: 1920, height: 1080 },
      "2k": { width: 2560, height: 1440 },
    };

    const { width, height } = resolutionMap[quality.resolution];
    const effectiveFps = Math.min(quality.fps, 30);
    const encodeIntervalMs = 1000 / effectiveFps;
    const keyframeIntervalMs = 2000;
    let lastEncodeAt = 0;
    let lastKeyframeAt = 0;
    let hasSentInitialKeyframe = false;
    const compressor = new VideoCompressor(
      {
        codec: encoderCodec,
        width,
        height,
        framerate: effectiveFps,
        bitrate: quality.bitrateMbps * 1_000_000,
        hardwareAcceleration: getBestEncodeHardwareAcceleration(encoderCodec) ?? "no-preference",
      },
      (payload) =>
        pipeline.sendChunk({
          ...payload,
          trackKind: "video",
        }),
    );
    let audioCompressor: AudioCompressor | null = null;
    let audioReader: ReadableStreamDefaultReader<AudioData> | null = null;

    const initAudioPipeline = async () => {
      const audioTrack = capturedFileStream?.getAudioTracks()[0] ?? null;
      if (!audioTrack || !("MediaStreamTrackProcessor" in window)) return;
      try {
        const ProcessorCtor = (
          window as unknown as {
            MediaStreamTrackProcessor: new (init: { track: MediaStreamTrack }) => {
              readable: ReadableStream<AudioData>;
            };
          }
        ).MediaStreamTrackProcessor;
        const processor = new ProcessorCtor({ track: audioTrack });
        const reader = processor.readable.getReader();
        audioReader = reader;
        let initialized = false;

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done || !value) break;
          if (!initialized) {
            audioCompressor = new AudioCompressor(
              {
                codec: "opus",
                sampleRate: value.sampleRate,
                numberOfChannels: value.numberOfChannels,
                bitrate: 128_000,
              },
              (payload) => pipeline.sendChunk(payload),
            );
            initialized = true;
          }
          if (!cancelled && audioCompressor) {
            audioCompressor.encode(value);
          }
          // AudioEncoder takes ownership of AudioData; do not close (double-close / odd timing can distort Opus).
        }
      } catch (error) {
        console.error("WebCodecs audio encode failed", error);
      }
    };
    void initAudioPipeline();

    // Align captures to real video frame presentation. Pure rAF + wall-clock throttle drifts from
    // captureStream()'s audio track and causes host-side A/V warp at play/start; rvfc tracks the element clock.
    type RvfcVideo = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: VideoFrameRequestCallback) => number;
    };
    const rvfcVideo = video as RvfcVideo;
    const pump = () => {
      if (cancelled) return;
      if (!video.paused && !video.ended) {
        const now = performance.now();
        if (now - lastEncodeAt >= encodeIntervalMs) {
          lastEncodeAt = now;
          try {
            const frame = new VideoFrame(video);
            const needsKeyframe =
              !hasSentInitialKeyframe || now - lastKeyframeAt >= keyframeIntervalMs;
            compressor.encode(frame, needsKeyframe);
            if (needsKeyframe) {
              hasSentInitialKeyframe = true;
              lastKeyframeAt = now;
            }
            frame.close();
          } catch (error) {
            console.error("WebCodecs encode frame failed; retaining current transport", error);
          }
        }
      }
      if (cancelled) return;
      if (!video.paused && !video.ended && typeof rvfcVideo.requestVideoFrameCallback === "function") {
        rvfcVideo.requestVideoFrameCallback(pump);
      } else {
        requestAnimationFrame(pump);
      }
    };

    requestAnimationFrame(pump);

    return () => {
      cancelled = true;
      if (audioReader) {
        void audioReader.cancel().catch(() => undefined);
      }
      if (audioCompressor) {
        void audioCompressor.flush().catch(() => undefined);
        audioCompressor.close();
      }
      void compressor.flush().catch(() => undefined);
      compressor.close();
    };
  }, [
    capturedFileStream,
    localVideoUrl,
    outboundVideoCodec,
    hasWebcodecsOutboundPeers,
    quality.bitrateMbps,
    quality.fps,
    quality.resolution,
    sendBinaryToPeers,
  ]);

  useEffect(() => {
    const encoderCodec = outboundVideoCodec;
    if (!encoderCodec || !hasWebcodecsOutboundPeers) return;
    if (!localStream || localVideoUrl) return;
    if (!("MediaStreamTrackProcessor" in window)) return;

    const videoTrack = localStream.getVideoTracks()[0] ?? null;
    if (!videoTrack) return;

    let cancelled = false;
    const pipeline = new MediaDataChannelPipeline(
      {
        readyState: "open",
        send: (data) => {
          const bytes = ArrayBuffer.isView(data)
            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            : new Uint8Array(data);
          sendBinaryToPeers(bytes, webcodecsOutboundPeerIdsRef.current);
        },
      },
      () => {},
    );

    const resolutionMap: Record<StreamQuality["resolution"], { width: number; height: number }> = {
      "720p": { width: 1280, height: 720 },
      "1080p": { width: 1920, height: 1080 },
      "2k": { width: 2560, height: 1440 },
    };

    const { width, height } = resolutionMap[quality.resolution];
    const effectiveFps = Math.min(quality.fps, 30);
    const minEncodeIntervalMs = 1000 / effectiveFps;
    const keyframeIntervalMs = 2000;
    let lastEncodedAt = 0;
    let lastKeyframeAt = 0;
    let hasSentInitialKeyframe = false;

    const compressor = new VideoCompressor(
      {
        codec: encoderCodec,
        width,
        height,
        framerate: effectiveFps,
        bitrate: quality.bitrateMbps * 1_000_000,
        hardwareAcceleration: getBestEncodeHardwareAcceleration(encoderCodec) ?? "no-preference",
      },
      (payload) =>
        pipeline.sendChunk({
          ...payload,
          trackKind: "video",
        }),
    );

    let videoReader: ReadableStreamDefaultReader<VideoFrame> | null = null;
    let audioReader: ReadableStreamDefaultReader<AudioData> | null = null;
    let audioCompressor: AudioCompressor | null = null;

    const initVideoPipeline = async () => {
      try {
        const ProcessorCtor = (
          window as unknown as {
            MediaStreamTrackProcessor: new (init: { track: MediaStreamTrack }) => {
              readable: ReadableStream<VideoFrame>;
            };
          }
        ).MediaStreamTrackProcessor;

        const processor = new ProcessorCtor({ track: videoTrack });
        videoReader = processor.readable.getReader();

        while (!cancelled) {
          const { value, done } = await videoReader.read();
          if (done || !value) break;

          const now = performance.now();
          if (now - lastEncodedAt < minEncodeIntervalMs) {
            value.close();
            continue;
          }

          const needsKeyframe =
            !hasSentInitialKeyframe || now - lastKeyframeAt >= keyframeIntervalMs;

          lastEncodedAt = now;
          compressor.encode(value, needsKeyframe);
          if (needsKeyframe) {
            hasSentInitialKeyframe = true;
            lastKeyframeAt = now;
          }
          value.close();
        }
      } catch (error) {
        console.error("WebCodecs screen video encode failed", error);
      }
    };

    const initAudioPipeline = async () => {
      const audioTrack = localStream.getAudioTracks()[0] ?? null;
      if (!audioTrack) return;
      try {
        const ProcessorCtor = (
          window as unknown as {
            MediaStreamTrackProcessor: new (init: { track: MediaStreamTrack }) => {
              readable: ReadableStream<AudioData>;
            };
          }
        ).MediaStreamTrackProcessor;
        const processor = new ProcessorCtor({ track: audioTrack });
        audioReader = processor.readable.getReader();
        let initialized = false;

        while (!cancelled) {
          const { value, done } = await audioReader.read();
          if (done || !value) break;
          if (!initialized) {
            audioCompressor = new AudioCompressor(
              {
                codec: "opus",
                sampleRate: value.sampleRate,
                numberOfChannels: value.numberOfChannels,
                bitrate: 128_000,
              },
              (payload) => pipeline.sendChunk(payload),
            );
            initialized = true;
          }
          if (!cancelled && audioCompressor) {
            audioCompressor.encode(value);
          }
        }
      } catch (error) {
        console.error("WebCodecs screen audio encode failed", error);
      }
    };

    void initVideoPipeline();
    void initAudioPipeline();

    return () => {
      cancelled = true;
      if (videoReader) {
        void videoReader.cancel().catch(() => undefined);
      }
      if (audioReader) {
        void audioReader.cancel().catch(() => undefined);
      }
      if (audioCompressor) {
        void audioCompressor.flush().catch(() => undefined);
        audioCompressor.close();
      }
      void compressor.flush().catch(() => undefined);
      compressor.close();
    };
  }, [
    localStream,
    localVideoUrl,
    outboundVideoCodec,
    hasWebcodecsOutboundPeers,
    quality.bitrateMbps,
    quality.fps,
    quality.resolution,
    sendBinaryToPeers,
  ]);

  useEffect(() => {
    const encoderCodec = outboundVideoCodec;
    if (!encoderCodec || !hasWebcodecsOutboundPeers) return;
    if (!localVideoUrl && !localStream) return;
    broadcastActiveVideoCodec(encoderCodec);
  }, [
    broadcastActiveVideoCodec,
    localStream,
    localVideoUrl,
    outboundVideoCodec,
    hasWebcodecsOutboundPeers,
  ]);

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
      // Apply requester timeline directly for play/pause/seek to keep controls deterministic.
      if (Number.isFinite(targetTime)) {
        video.currentTime = targetTime;
      }

      if (incomingSyncRequest.action === "play") {
        if (video.paused) {
          video.play().catch(e => console.error("Playback failed", e));
        }
      } else if (incomingSyncRequest.action === "pause") {
        if (!video.paused) {
          video.pause();
        }
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

  const handleFileEnded = () => {
    // Natural EOF should notify peers so receivers don't keep the last frozen frame.
    broadcastStream(null, "none", quality);
  };

  const handleRemotePlay = (sourcePeerId: string, time: number) => {
    sendSyncRequest(sourcePeerId, "play", time);
  };

  const handleRemotePause = (sourcePeerId: string, time: number) => {
    sendSyncRequest(sourcePeerId, "pause", time);
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
          style={{
            // Keep headless source mounted so sync timeline and sender pipeline remain stable.
            position: "fixed",
            top: "0",
            left: "0",
            width: "1px",
            height: "1px",
            opacity: 0,
            zIndex: -1,
          }}
          className="pointer-events-none"
          muted
          onPlay={handlePlay}
          onPause={handlePause}
          onSeeked={handleSeeked}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleFileEnded}
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
              subtitles={subtitlesByPeer[peerId] ?? EMPTY_SUBTITLES}
              onPlayNative={handleLocalUiPlay}
              onPauseNative={handleLocalUiPause}
              onSeekedNative={handleLocalUiSeek}
            />
          )}

          {remotePeers.map((peerId) => {
            const isFileMode = streamModesByPeer[peerId] === "file";
            const isScreenMode = streamModesByPeer[peerId] === "screen";
            const inboundMode = inboundTransportModeByPeer[peerId] ?? "webrtc";
            const selectedVideoCodec = getActiveVideoCodecForPeer(peerId) ?? null;
            const shouldUseWebCodecs =
              inboundMode === "webcodecs" &&
              (isFileMode || isScreenMode) &&
              selectedVideoCodec;
            return (
              <VideoView
                key={peerId}
                stream={shouldUseWebCodecs ? null : remoteStreams[peerId]}
                label={`Peer ${peerId.substring(0, 5)}`}
                isLiveStream={!isFileMode}
                isLocal={false}
                duration={durationsByPeer[peerId]}
                syncEvent={syncEventsByPeer[peerId]}
                subtitles={subtitlesByPeer[peerId] ?? EMPTY_SUBTITLES}
                remotePlayRequest={(time: number) => handleRemotePlay(peerId, time)}
                remotePauseRequest={(time: number) => handleRemotePause(peerId, time)}
                remoteSeekRequest={(time: number) => handleRemoteSeeked(peerId, time)}
                setVideoElementRef={(el) => {
                  remoteVideoRefs.current[peerId] = el;
                }}
                surface={
                  shouldUseWebCodecs && selectedVideoCodec
                    ? ({
                        volume,
                        muted,
                        presentationPlaying,
                        setPlaybackTimelineHold,
                        setWebCodecsReceiveBufferMs,
                      }) => (
                        <WebCodecsPlayer
                          dataChannel={getDataChannelForPeer(peerId)}
                          selectedVideoCodec={selectedVideoCodec}
                          width={1920}
                          height={1080}
                          className="w-full h-full object-contain"
                          volume={volume}
                          muted={muted}
                          presentationPlaying={presentationPlaying}
                          timelineSync={isFileMode ? syncEventsByPeer[peerId] ?? null : null}
                          onPlaybackTimelineHoldChange={setPlaybackTimelineHold}
                          onReceiveBufferMediaMs={setWebCodecsReceiveBufferMs}
                        />
                      )
                    : undefined
                }
              />
            );
          })}
        </div>
      )}

      {theaterMode && (
        <div className="relative w-full h-full min-h-[300px] sm:min-h-[420px] lg:min-h-[600px] bg-black/50 rounded-lg overflow-hidden border border-[#333]">
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
                subtitles={subtitlesByPeer[peerId] ?? EMPTY_SUBTITLES}
                onPlayNative={handleLocalUiPlay}
                onPauseNative={handleLocalUiPause}
                onSeekedNative={handleLocalUiSeek}
              />
            </FloatingVideoWrapper>
          )}

          {remotePeers.map((peerId, index) => {
            const isFileMode = streamModesByPeer[peerId] === "file";
            const isScreenMode = streamModesByPeer[peerId] === "screen";
            const inboundMode = inboundTransportModeByPeer[peerId] ?? "webrtc";
            const selectedVideoCodec = getActiveVideoCodecForPeer(peerId) ?? null;
            const shouldUseWebCodecs =
              inboundMode === "webcodecs" &&
              (isFileMode || isScreenMode) &&
              selectedVideoCodec;
            const offset = (index + 2) * 20;

            return (
              <FloatingVideoWrapper key={peerId} defaultX={offset} defaultY={offset} zIndex={50 + index}>
                <VideoView
                  stream={shouldUseWebCodecs ? null : remoteStreams[peerId]}
                  label={`Peer ${peerId.substring(0, 5)}`}
                  isLiveStream={!isFileMode}
                  isLocal={false}
                  duration={durationsByPeer[peerId]}
                  syncEvent={syncEventsByPeer[peerId]}
                  subtitles={subtitlesByPeer[peerId] ?? EMPTY_SUBTITLES}
                  remotePlayRequest={(time: number) => handleRemotePlay(peerId, time)}
                  remotePauseRequest={(time: number) => handleRemotePause(peerId, time)}
                  remoteSeekRequest={(time: number) => handleRemoteSeeked(peerId, time)}
                  setVideoElementRef={(el) => {
                    remoteVideoRefs.current[peerId] = el;
                  }}
                  surface={
                    shouldUseWebCodecs && selectedVideoCodec
                      ? ({
                          volume,
                          muted,
                          presentationPlaying,
                          setPlaybackTimelineHold,
                          setWebCodecsReceiveBufferMs,
                        }) => (
                          <WebCodecsPlayer
                            dataChannel={getDataChannelForPeer(peerId)}
                            selectedVideoCodec={selectedVideoCodec}
                            width={1920}
                            height={1080}
                            className="w-full h-full object-contain"
                            volume={volume}
                            muted={muted}
                            presentationPlaying={presentationPlaying}
                            timelineSync={isFileMode ? syncEventsByPeer[peerId] ?? null : null}
                            onPlaybackTimelineHoldChange={setPlaybackTimelineHold}
                            onReceiveBufferMediaMs={setWebCodecsReceiveBufferMs}
                          />
                        )
                      : undefined
                  }
                />
              </FloatingVideoWrapper>
            );
          })}
        </div>
      )}
    </>
  );
}