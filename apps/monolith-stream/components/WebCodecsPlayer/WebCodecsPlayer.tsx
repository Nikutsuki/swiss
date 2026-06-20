"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VideoConfig } from "@swiss/webrtc-pipeline";
import { CanvasRenderer, type CanvasRendererHandle } from "./CanvasRenderer";
import { useWebCodecsStream, type FileTimelineSync } from "@/hooks/useWebCodecsStream";
import type { SupportedVideoCodec } from "@/lib/webcodecs/videoCodecNegotiation";
import { getBestDecodeHardwareAcceleration } from "@/lib/webcodecs/videoCodecNegotiation";

export type { FileTimelineSync };

interface WebCodecsPlayerProps {
  dataChannel: RTCDataChannel | null;
  selectedVideoCodec: SupportedVideoCodec;
  width: number;
  height: number;
  targetBufferMs?: number;
  className?: string;
  volume: number;
  muted: boolean;
  /** File playback only: host→viewer sync; triggers decoder flush on seek / big timeline jumps. */
  timelineSync?: FileTimelineSync | null;
  /**
   * True until the user has started playback and the first decoded frame was shown — the picture is
   * still static, so the scrubber should not follow wall-clock “play” extrapolation. (We intentionally
   * do not tie this to receive-buffer “buffering” state: the queue often dips under target after each
   * decode and would freeze the bar for the whole session.)
   */
  onPlaybackTimelineHoldChange?: (hold: boolean) => void;
  /** Queued media duration (ms) in the receive buffer — UI subtracts this from sync time to match decoded picture. */
  onReceiveBufferMediaMs?: (ms: number) => void;
  /**
   * Matches controls play/pause (file mode). When false, buffering UI is hidden. Live receivers
   * should pass true.
   */
  presentationPlaying?: boolean;
}

const DEFAULT_CONFIG: VideoConfig = {
  codec: "avc1.640028",
  width: 1920,
  height: 1080,
  bitrate: 8_000_000,
  framerate: 30,
  hardwareAcceleration: "no-preference",
};

/** Show buffering UI only when queued duration is under this fraction of the target. */
const BUFFER_OVERLAY_SHOW_BELOW_RATIO = 0.50;
/** After buffer reaches the threshold, keep the overlay this long before hiding. */
const BUFFER_OVERLAY_HIDE_DELAY_MS = 250;

export function WebCodecsPlayer({
  dataChannel,
  selectedVideoCodec,
  width,
  height,
  targetBufferMs = 1500,
  className,
  volume,
  muted,
  timelineSync,
  onPlaybackTimelineHoldChange,
  onReceiveBufferMediaMs,
  presentationPlaying = true,
}: WebCodecsPlayerProps) {
  const rendererRef = useRef<CanvasRendererHandle | null>(null);
  const [isActivated, setIsActivated] = useState(false);
  const videoConfig = useMemo(
    () => {
      const bestAccel = getBestDecodeHardwareAcceleration(selectedVideoCodec);
      return {
        ...DEFAULT_CONFIG,
        codec: selectedVideoCodec,
        width,
        height,
        hardwareAcceleration: bestAccel ?? DEFAULT_CONFIG.hardwareAcceleration,
      };
    },
    [selectedVideoCodec, width, height],
  );
  const firstFrameDeliveredRef = useRef(false);
  const [firstFrameDelivered, setFirstFrameDelivered] = useState(false);
  const [showBufferingOverlay, setShowBufferingOverlay] = useState(false);
  const bufferingHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const bufferingHidePendingRef = useRef(false);
  const bufferingOverlayVisibleRef = useRef(false);

  const clearBufferingHideTimer = useCallback(() => {
    if (bufferingHideTimeoutRef.current !== null) {
      clearTimeout(bufferingHideTimeoutRef.current);
      bufferingHideTimeoutRef.current = null;
    }
    bufferingHidePendingRef.current = false;
  }, []);

  useEffect(() => {
    firstFrameDeliveredRef.current = false;
    setFirstFrameDelivered(false);
    clearBufferingHideTimer();
    bufferingOverlayVisibleRef.current = false;
    setShowBufferingOverlay(false);
  }, [dataChannel, clearBufferingHideTimer]);

  useEffect(() => {
    if (!isActivated) {
      firstFrameDeliveredRef.current = false;
      setFirstFrameDelivered(false);
      clearBufferingHideTimer();
      bufferingOverlayVisibleRef.current = false;
      setShowBufferingOverlay(false);
    }
  }, [isActivated, clearBufferingHideTimer]);

  const handleFrameWithHold = useCallback((frame: VideoFrame) => {
    rendererRef.current?.renderFrame(frame);
    if (!firstFrameDeliveredRef.current) {
      firstFrameDeliveredRef.current = true;
      setFirstFrameDelivered(true);
    }
  }, []);

  const { activatePlayback, bufferState, decoderReady, decoderError } = useWebCodecsStream({
    dataChannel,
    targetBufferMs,
    videoConfig,
    onFrame: handleFrameWithHold,
    volume,
    muted,
    timelineSync,
  });

  useEffect(() => {
    onReceiveBufferMediaMs?.(bufferState.currentBufferDurationMs);
  }, [bufferState.currentBufferDurationMs, onReceiveBufferMediaMs]);

  // Do not use buffer "buffering" state for UI hold: after each decode the queue often dips below the
  // target and flips back to buffering, which would freeze the scrubber for the whole session.
  const timelineHold = !isActivated || !firstFrameDelivered;

  useEffect(() => {
    onPlaybackTimelineHoldChange?.(timelineHold);
  }, [timelineHold, onPlaybackTimelineHoldChange]);

  const bufferProgress01 = Math.min(
    1,
    bufferState.targetBufferDurationMs > 0
      ? bufferState.currentBufferDurationMs / bufferState.targetBufferDurationMs
      : 0,
  );

  useEffect(() => {
    if (!isActivated || !presentationPlaying) {
      clearBufferingHideTimer();
      bufferingOverlayVisibleRef.current = false;
      setShowBufferingOverlay(false);
      return;
    }

    const belowThreshold =
      bufferProgress01 < BUFFER_OVERLAY_SHOW_BELOW_RATIO;

    if (belowThreshold) {
      clearBufferingHideTimer();
      bufferingOverlayVisibleRef.current = true;
      setShowBufferingOverlay(true);
      return;
    }

    if (
      bufferingOverlayVisibleRef.current &&
      !bufferingHidePendingRef.current
    ) {
      bufferingHidePendingRef.current = true;
      bufferingHideTimeoutRef.current = setTimeout(() => {
        bufferingHideTimeoutRef.current = null;
        bufferingHidePendingRef.current = false;
        bufferingOverlayVisibleRef.current = false;
        setShowBufferingOverlay(false);
      }, BUFFER_OVERLAY_HIDE_DELAY_MS);
    }
  }, [
    isActivated,
    presentationPlaying,
    bufferProgress01,
    clearBufferingHideTimer,
  ]);

  useEffect(() => () => clearBufferingHideTimer(), [clearBufferingHideTimer]);

  return (
    <div
      className="relative"
      onClick={() => {
        if (isActivated || !decoderReady) return;
        setIsActivated(true);
        void activatePlayback();
      }}
    >
      {showBufferingOverlay && presentationPlaying && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/60 px-8 pointer-events-none"
          role="status"
          aria-busy="true"
          aria-label="Buffering"
        >
          <p className="text-white/90 text-sm font-medium tracking-wide">
            Buffering…
          </p>
          <div className="relative w-full max-w-[min(280px,85%)] h-2 rounded-full bg-white/15 overflow-hidden ring-1 ring-white/10">
            <div
              className="h-full rounded-full bg-(--security-emerald) transition-[width] duration-300 ease-out motion-reduce:transition-none shadow-[0_0_12px_rgba(0,0,0,0.35)]"
              style={{ width: `${bufferProgress01 * 100}%` }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 left-0 w-[42%] bg-linear-to-r from-transparent via-white/45 to-transparent webcodecs-buffer-shimmer"
              aria-hidden
            />
          </div>
        </div>
      )}
      {!isActivated && (
        <div
          className="absolute inset-0 z-20 bg-black/70 text-white text-sm font-semibold flex items-center justify-center"
        >
          <button
            className={`px-4 py-2 rounded-full ${decoderReady ? "bg-(--security-emerald) text-black" : "bg-white/20 text-white/80 cursor-not-allowed"}`}
            type="button"
            disabled={!decoderReady}
            aria-disabled={!decoderReady}
            title={decoderReady ? "Start playback" : (decoderError ?? "Initializing decoder")}
          >
            {decoderReady ? "Click to start playback" : (decoderError ? "Decoder unavailable" : "Initializing decoder...")}
          </button>
        </div>
      )}
      <CanvasRenderer ref={rendererRef} width={width} height={height} className={className} />
    </div>
  );
}
