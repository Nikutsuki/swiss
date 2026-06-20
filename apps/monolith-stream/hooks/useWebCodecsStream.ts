import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioDecompressor,
  MediaDataChannelPipeline,
  type BufferState,
  type MediaChunkPayload,
  type VideoConfig,
  VideoDecompressor,
} from "@swiss/webrtc-pipeline";
import { PlaybackBuffer } from "@/lib/buffer/PlaybackBuffer";

/** Small lead when re-syncing after underrun so BufferSource.start(when) is not in the past. */
const AUDIO_RESYNC_LOOKAHEAD_SEC = 0.03;

/** Opus packets are ~20ms; chunk.duration on the wire is in microseconds (WebCodecs). */
const AUDIO_CHUNK_DURATION_US = 20_000;

/**
 * Max time (seconds) the Web Audio schedule may run ahead of AudioContext.currentTime.
 * Without this, AudioDecoder output bursts stack many seconds of BufferSources while video
 * is still paced by rAF/canvas — same symptom pause/unpause masks by letting real time catch up.
 */
const MAX_AUDIO_SCHEDULE_AHEAD_SEC = 0.22;

/** Drop oldest pending decoded audio if the backlog grows without bound (memory safety). */
const MAX_PENDING_AUDIO_DATA_CHUNKS = 400;

/**
 * Do not feed AudioDecoder while this many decoded AudioData chunks wait for Web Audio scheduling.
 * Without this, decode (~3/frame) outruns schedule (~50×20ms/s capped by MAX_AUDIO_SCHEDULE_AHEAD_SEC),
 * pendingLen can blow up without this — same backlog host pause clears by stopping encode.
 */
const MAX_PENDING_DECODED_AUDIO_BEFORE_DECODE = 28;

/**
 * When encoded audio jitter exceeds video jitter by more than this (ms), trim.
 * Stable ~60ms quantization (1480 vs 1418) should not trim; ~100–110ms spikes are benign jitter — a
 * slightly higher trigger avoids dropping 2–3 packets at those peaks while still catching large skew.
 */
const ENCODED_AUDIO_OVER_VIDEO_TRIM_TRIGGER_MS = 150;
/** After a trim, keep encoded audio depth ≤ video depth + this slack (ms). */
const ENCODED_AUDIO_VS_VIDEO_TARGET_SLACK_MS = 90;
/** Allow another trim soon after a small catch-up (large startup trims can still use same path). */
const ENCODED_AUDIO_TRIM_COOLDOWN_MS = 1000;
/**
 * If lead is below this, soft trim: discard encoded buffer only — do not close AudioContext.
 * Above this, dispose Web Audio + flush decoder (large startup / seek-style skew).
 */
const ENCODED_AUDIO_TRIM_SOFT_AHEAD_MS = 180;

/** Adaptive tuning window for detecting repeated audio catch-up (choppy playback symptom). */
const CHOPPY_EVENT_WINDOW_MS = 5000;
/** Bump adaptive thresholds after this many catch-up events in the rolling window. */
const CHOPPY_EVENT_THRESHOLD = 4;
/** If stable for this long, gradually return adaptive thresholds to baseline values. */
const ADAPTIVE_STABLE_WINDOW_MS = 8000;

const ADAPTIVE_MAX_AUDIO_SCHEDULE_AHEAD_SEC = 0.34;
const ADAPTIVE_MAX_PENDING_DECODED_AUDIO_BEFORE_DECODE = 44;
const ADAPTIVE_MAX_ENCODED_AUDIO_TRIM_TRIGGER_MS = 240;
const ADAPTIVE_MAX_ENCODED_AUDIO_TRIM_COOLDOWN_MS = 2200;

/** Host→viewer timeline (file mode); matches data-channel `sync` payloads + optional receive time. */
export type FileTimelineSync = {
  action: string;
  time: number;
  timestamp: number;
  receivedAtMs?: number;
};

interface UseWebCodecsStreamOptions {
  dataChannel: RTCDataChannel | null;
  videoConfig: VideoConfig;
  targetBufferMs: number;
  onFrame: (frame: VideoFrame) => void;
  volume: number;
  muted: boolean;
  timelineSync?: FileTimelineSync | null;
}

export function useWebCodecsStream({
  dataChannel,
  videoConfig,
  targetBufferMs,
  onFrame,
  volume,
  muted,
  timelineSync,
}: UseWebCodecsStreamOptions) {
  const normalizedVolume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1;
  const normalizedMuted = Boolean(muted);
  const normalizedVolumeRef = useRef(normalizedVolume);
  const normalizedMutedRef = useRef(normalizedMuted);
  normalizedVolumeRef.current = normalizedVolume;
  normalizedMutedRef.current = normalizedMuted;
  const [bufferState, setBufferState] = useState<BufferState>({
    currentBufferDurationMs: 0,
    targetBufferDurationMs: targetBufferMs,
    state: "buffering",
    underrunCount: 0,
  });
  const [decoderReady, setDecoderReady] = useState(false);
  const [decoderError, setDecoderError] = useState<string | null>(null);
  const decoderReadyRef = useRef(false);

  const bufferRef = useRef<PlaybackBuffer>(new PlaybackBuffer(targetBufferMs));
  const audioBufferRef = useRef<PlaybackBuffer>(new PlaybackBuffer(targetBufferMs));
  const decompressorRef = useRef<VideoDecompressor | null>(null);
  const audioDecompressorRef = useRef<AudioDecompressor | null>(null);
  const queueRef = useRef<MediaChunkPayload[]>([]);
  const drainingRef = useRef(false);
  const drainingAudioRef = useRef(false);
  const isActivatedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioClockRef = useRef<number>(0);
  const onFrameRef = useRef(onFrame);
  const timelineSyncRef = useRef(timelineSync);
  timelineSyncRef.current = timelineSync;
  const lastFlushedSyncTimestampRef = useRef<number | null>(null);
  const lastAuthoritativeMediaTimeRef = useRef<number | null>(null);
  const hasPresentedVideoFrameRef = useRef(false);
  /** True while decoder.flush() runs — flush tail must not prime video/audio (stale timeline). */
  const withinDecoderFlushRef = useRef(false);
  /** Align audio decode volume to video media-time steps (avoids draining the whole audio jitter buffer per packet). */
  const lastVideoFrameTimestampUsRef = useRef<number | null>(null);
  const pendingAudioDataRef = useRef<AudioData[]>([]);
  const audioScheduleFlushRafRef = useRef<number | null>(null);
  /** Latest flush from scheduleAudioData; video frames call this so scheduling progresses if rAF is throttled. */
  const flushAudioSchedulePendingRef = useRef<() => void>(() => {});
  const trimExcessEncodedAudioLeadRef = useRef<() => void>(() => {});
  const trimEncodedAudioInProgressRef = useRef(false);
  const lastEncodedAudioTrimPerfRef = useRef(0);
  const adaptiveAudioScheduleAheadSecRef = useRef(MAX_AUDIO_SCHEDULE_AHEAD_SEC);
  const adaptivePendingDecodedBeforeDecodeRef = useRef(MAX_PENDING_DECODED_AUDIO_BEFORE_DECODE);
  const adaptiveEncodedTrimTriggerMsRef = useRef(ENCODED_AUDIO_OVER_VIDEO_TRIM_TRIGGER_MS);
  const adaptiveEncodedTrimCooldownMsRef = useRef(ENCODED_AUDIO_TRIM_COOLDOWN_MS);
  const choppyEventTimesRef = useRef<number[]>([]);
  const lastChoppyEventAtRef = useRef(0);

  const coolAdaptiveThresholds = useCallback(() => {
    const now = performance.now();
    const times = choppyEventTimesRef.current.filter(
      (ts) => now - ts <= CHOPPY_EVENT_WINDOW_MS,
    );
    choppyEventTimesRef.current = times;
    if (now - lastChoppyEventAtRef.current < ADAPTIVE_STABLE_WINDOW_MS) return;

    adaptiveAudioScheduleAheadSecRef.current = Math.max(
      MAX_AUDIO_SCHEDULE_AHEAD_SEC,
      adaptiveAudioScheduleAheadSecRef.current - 0.02,
    );
    adaptivePendingDecodedBeforeDecodeRef.current = Math.max(
      MAX_PENDING_DECODED_AUDIO_BEFORE_DECODE,
      adaptivePendingDecodedBeforeDecodeRef.current - 2,
    );
    adaptiveEncodedTrimTriggerMsRef.current = Math.max(
      ENCODED_AUDIO_OVER_VIDEO_TRIM_TRIGGER_MS,
      adaptiveEncodedTrimTriggerMsRef.current - 12,
    );
    adaptiveEncodedTrimCooldownMsRef.current = Math.max(
      ENCODED_AUDIO_TRIM_COOLDOWN_MS,
      adaptiveEncodedTrimCooldownMsRef.current - 150,
    );
  }, []);

  const noteChoppyAudioEvent = useCallback(() => {
    const now = performance.now();
    const next = choppyEventTimesRef.current.filter(
      (ts) => now - ts <= CHOPPY_EVENT_WINDOW_MS,
    );
    next.push(now);
    choppyEventTimesRef.current = next;
    lastChoppyEventAtRef.current = now;

    if (next.length < CHOPPY_EVENT_THRESHOLD) return;

    adaptiveAudioScheduleAheadSecRef.current = Math.min(
      ADAPTIVE_MAX_AUDIO_SCHEDULE_AHEAD_SEC,
      adaptiveAudioScheduleAheadSecRef.current + 0.03,
    );
    adaptivePendingDecodedBeforeDecodeRef.current = Math.min(
      ADAPTIVE_MAX_PENDING_DECODED_AUDIO_BEFORE_DECODE,
      adaptivePendingDecodedBeforeDecodeRef.current + 3,
    );
    adaptiveEncodedTrimTriggerMsRef.current = Math.min(
      ADAPTIVE_MAX_ENCODED_AUDIO_TRIM_TRIGGER_MS,
      adaptiveEncodedTrimTriggerMsRef.current + 15,
    );
    adaptiveEncodedTrimCooldownMsRef.current = Math.min(
      ADAPTIVE_MAX_ENCODED_AUDIO_TRIM_COOLDOWN_MS,
      adaptiveEncodedTrimCooldownMsRef.current + 200,
    );
  }, []);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    if (!gainNodeRef.current) return;
    gainNodeRef.current.gain.value = normalizedMuted ? 0 : normalizedVolume;
  }, [normalizedMuted, normalizedVolume]);

  const pipeline = useMemo(() => {
    if (!dataChannel) return null;
    return new MediaDataChannelPipeline(dataChannel, (chunk) => {
      if (chunk.trackKind === "audio") {
        audioBufferRef.current.enqueue({
          sequenceNumber: chunk.sequenceNumber,
          type: chunk.type,
          timestamp: chunk.timestamp,
          duration: chunk.duration,
          data: chunk.data,
        });
        trimExcessEncodedAudioLeadRef.current();
        return;
      }
      queueRef.current.push(chunk);
      const next = bufferRef.current.enqueue({
        sequenceNumber: chunk.sequenceNumber,
        type: chunk.type,
        timestamp: chunk.timestamp,
        duration: chunk.duration,
        data: chunk.data,
      });
      setBufferState(next);
      trimExcessEncodedAudioLeadRef.current();
    });
  }, [dataChannel]);

  const drainLoop = useCallback(async () => {
    if (!isActivatedRef.current) return;
    if (!decoderReadyRef.current) return;
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      while (true) {
        const current = bufferRef.current.getState();
        if (current.state !== "playing") break;

        const nextChunk = bufferRef.current.dequeue();
        if (!nextChunk) {
          console.warn("Playback buffer underrun");
          setBufferState(bufferRef.current.getState());
          break;
        }

        decompressorRef.current?.decode(nextChunk);
        setBufferState(bufferRef.current.getState());
      }
    } finally {
      drainingRef.current = false;
    }
  }, []);

  const drainAudioLoop = useCallback(async (maxChunks?: number) => {
    if (!isActivatedRef.current) return;
    // Keep audio behind the first decoded picture so we don't outrun video after the jitter buffer.
    if (!hasPresentedVideoFrameRef.current) return;
    if (drainingAudioRef.current) return;
    drainingAudioRef.current = true;
    let drained = 0;
    try {
      flushAudioSchedulePendingRef.current();
      while (true) {
        if (maxChunks !== undefined && drained >= maxChunks) break;
        const current = audioBufferRef.current.getState();
        if (current.state !== "playing") break;

        const pendingDecoded = pendingAudioDataRef.current.length;
        if (pendingDecoded >= adaptivePendingDecodedBeforeDecodeRef.current) {
          break;
        }

        const nextChunk = audioBufferRef.current.dequeue();
        if (!nextChunk) break;

        audioDecompressorRef.current?.decode({
          ...nextChunk,
          trackKind: "audio",
        } as MediaChunkPayload);
        drained += 1;
      }
    } finally {
      drainingAudioRef.current = false;
    }
  }, []);

  const disposeWebAudioOutput = useCallback(() => {
    if (audioScheduleFlushRafRef.current !== null) {
      cancelAnimationFrame(audioScheduleFlushRafRef.current);
      audioScheduleFlushRafRef.current = null;
    }
    for (const d of pendingAudioDataRef.current) {
      d.close();
    }
    pendingAudioDataRef.current = [];
    flushAudioSchedulePendingRef.current = () => {};
    const ctx = audioContextRef.current;
    if (ctx) {
      void ctx.close();
    }
    audioContextRef.current = null;
    gainNodeRef.current = null;
    audioClockRef.current = 0;
  }, []);

  const trimExcessEncodedAudioLead = useCallback(() => {
    if (!isActivatedRef.current) return;
    if (!hasPresentedVideoFrameRef.current) return;
    if (trimEncodedAudioInProgressRef.current) return;

    const vMs = bufferRef.current.getState().currentBufferDurationMs;
    const aMs = audioBufferRef.current.getState().currentBufferDurationMs;
    if (aMs <= vMs + adaptiveEncodedTrimTriggerMsRef.current) return;

    const now = performance.now();
    if (now - lastEncodedAudioTrimPerfRef.current < adaptiveEncodedTrimCooldownMsRef.current) {
      return;
    }

    trimEncodedAudioInProgressRef.current = true;
    lastEncodedAudioTrimPerfRef.current = now;

    const hardWebAudioReset = aMs > vMs + ENCODED_AUDIO_TRIM_SOFT_AHEAD_MS;
    if (hardWebAudioReset) {
      disposeWebAudioOutput();
    }

    let discarded = 0;
    const targetMax = vMs + ENCODED_AUDIO_VS_VIDEO_TARGET_SLACK_MS;
    while (
      discarded < 160 &&
      audioBufferRef.current.getState().currentBufferDurationMs > targetMax
    ) {
      if (!audioBufferRef.current.discardHead()) break;
      discarded += 1;
    }

    // Discarded chunks were never submitted to AudioDecoder; flushing on every soft trim reset decoder
    // state and caused audible glitches. Only hard trim (after dispose) needs flush.
    const skipDecoderFlush = !hardWebAudioReset;
    if (skipDecoderFlush) {
      trimEncodedAudioInProgressRef.current = false;
      void drainAudioLoop();
      flushAudioSchedulePendingRef.current();
    } else {
      void audioDecompressorRef.current?.flush().finally(() => {
        trimEncodedAudioInProgressRef.current = false;
        void drainAudioLoop();
        flushAudioSchedulePendingRef.current();
      });
    }
  }, [disposeWebAudioOutput, drainAudioLoop]);

  trimExcessEncodedAudioLeadRef.current = trimExcessEncodedAudioLead;

  const flushDecoderPipeline = useCallback(async () => {
    const videoDec = decompressorRef.current;
    const audioDec = audioDecompressorRef.current;
    if (!videoDec) return;

    // Drop scheduled playout: old BufferSources remain on the timeline unless we close the context.
    // Otherwise after seek, pre-seek audio keeps playing and new audio stacks wrong → A/V desync.
    disposeWebAudioOutput();

    queueRef.current = [];
    bufferRef.current.clear();
    audioBufferRef.current.clear();
    hasPresentedVideoFrameRef.current = false;
    lastVideoFrameTimestampUsRef.current = null;
    setBufferState(bufferRef.current.getState());
    trimEncodedAudioInProgressRef.current = false;
    lastEncodedAudioTrimPerfRef.current = 0;

    withinDecoderFlushRef.current = true;
    try {
      await videoDec.flush();
      await audioDec?.flush() ?? Promise.resolve();
    } finally {
      withinDecoderFlushRef.current = false;
    }
    void drainLoop();
    void drainAudioLoop();
  }, [disposeWebAudioOutput, drainLoop, drainAudioLoop]);

  const tryApplyTimelineSync = useCallback(() => {
    const sync = timelineSyncRef.current;
    if (!sync || !dataChannel || !decompressorRef.current) return;

    const { action, time, timestamp } = sync;
    const prev = lastAuthoritativeMediaTimeRef.current;
    const shouldFlush =
      action === "seek" ||
      (action === "play" && (prev == null || Math.abs(time - prev) > 2.5));

    if (shouldFlush && lastFlushedSyncTimestampRef.current !== timestamp) {
      lastFlushedSyncTimestampRef.current = timestamp;
      void flushDecoderPipeline();
    }

    lastAuthoritativeMediaTimeRef.current = time;
  }, [dataChannel, flushDecoderPipeline]);

  useEffect(() => {
    bufferRef.current = new PlaybackBuffer(targetBufferMs);
    audioBufferRef.current = new PlaybackBuffer(targetBufferMs);
    setBufferState(bufferRef.current.getState());
  }, [targetBufferMs]);

  const scheduleAudioData = useCallback((audioData: AudioData) => {
    if (!isActivatedRef.current) {
      audioData.close();
      return;
    }
    // Block flush() tail and any stray decodes until a real frame after seek has primed playout.
    if (!hasPresentedVideoFrameRef.current) {
      audioData.close();
      return;
    }
    while (pendingAudioDataRef.current.length >= MAX_PENDING_AUDIO_DATA_CHUNKS) {
      pendingAudioDataRef.current.shift()?.close();
    }
    pendingAudioDataRef.current.push(audioData);

    const flushPending = () => {
      while (pendingAudioDataRef.current.length > 0) {
        let context = audioContextRef.current;
        let gain = gainNodeRef.current;
        if (!context || !gain) {
          const peek = pendingAudioDataRef.current[0];
          if (!peek) return;
          context = new AudioContext();
          gain = context.createGain();
          gain.gain.value = normalizedMutedRef.current ? 0 : normalizedVolumeRef.current;
          gain.connect(context.destination);
          audioContextRef.current = context;
          gainNodeRef.current = gain;
          audioClockRef.current = context.currentTime;
          void context.resume();
        }

        const now = context.currentTime;
        const leadSec = audioClockRef.current - now;
        if (leadSec > adaptiveAudioScheduleAheadSecRef.current) {
          if (audioScheduleFlushRafRef.current === null) {
            audioScheduleFlushRafRef.current = requestAnimationFrame(() => {
              audioScheduleFlushRafRef.current = null;
              coolAdaptiveThresholds();
              flushPending();
            });
          }
          return;
        }

        const next = pendingAudioDataRef.current.shift();
        if (!next) return;

        const channels = next.numberOfChannels;
        const frameCount = next.numberOfFrames;
        const audioBuffer = new AudioBuffer({
          length: frameCount,
          numberOfChannels: channels,
          sampleRate: next.sampleRate,
        });
        for (let ch = 0; ch < channels; ch += 1) {
          const channelData = new Float32Array(frameCount);
          next.copyTo(channelData, { planeIndex: ch, format: "f32-planar" });
          audioBuffer.copyToChannel(channelData, ch);
        }
        next.close();

        const source = context.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(gain);
        // Chain buffers on a single timeline (duration-accurate). Do not clamp every chunk to
        // currentTime+ε — that re-syncs to wall clock whenever the graph slips slightly and
        // inserts gaps / uneven spacing (choppy, "warped" timing).
        let startTime = audioClockRef.current;
        const now2 = context.currentTime;
        if (startTime < now2) {
          noteChoppyAudioEvent();
          startTime = now2 + AUDIO_RESYNC_LOOKAHEAD_SEC;
        } else {
          coolAdaptiveThresholds();
        }
        source.start(startTime);
        audioClockRef.current = startTime + audioBuffer.duration;
      }
    };

    flushAudioSchedulePendingRef.current = flushPending;
    flushPending();
  }, [coolAdaptiveThresholds, noteChoppyAudioEvent]);

  useEffect(() => {
    if (!pipeline || !dataChannel) return;

    setDecoderReady(false);
    decoderReadyRef.current = false;
    setDecoderError(null);

    // Rebuild decoders when negotiated codec/config changes so incoming chunks are decoded with
    // the current codec, not a stale pre-negotiation decoder instance.
    const videoDecompressor = new VideoDecompressor(videoConfig, (frame) => {
      if (withinDecoderFlushRef.current) {
        frame.close();
        return;
      }
      const wasPrimed = hasPresentedVideoFrameRef.current;
      hasPresentedVideoFrameRef.current = true;
      const vts = frame.timestamp;
      const prevTs = lastVideoFrameTimestampUsRef.current;
      const fallbackDeltaUs = frame.duration ?? 33_333;
      const deltaUs = prevTs == null ? fallbackDeltaUs : vts - prevTs;
      const safeDeltaUs = deltaUs > 0 ? deltaUs : fallbackDeltaUs;
      const maxAudioChunks = Math.max(1, Math.ceil(safeDeltaUs / AUDIO_CHUNK_DURATION_US));
      lastVideoFrameTimestampUsRef.current = vts;
      if (!wasPrimed) {
        const ctx = audioContextRef.current;
        if (ctx) {
          audioClockRef.current = ctx.currentTime;
        }
      }
      void drainAudioLoop(maxAudioChunks);
      trimExcessEncodedAudioLeadRef.current();
      flushAudioSchedulePendingRef.current();
      onFrameRef.current(frame);
    });
    decompressorRef.current = videoDecompressor;
    const isConfigured = videoDecompressor.isConfigured();
    setDecoderReady(isConfigured);
    decoderReadyRef.current = isConfigured;
    if (!isConfigured) {
      setDecoderError(`Decoder could not be configured for ${videoConfig.codec}`);
    }

    audioDecompressorRef.current = new AudioDecompressor(
      { codec: "opus", sampleRate: 48_000, numberOfChannels: 2 },
      scheduleAudioData,
    );

    const handleMessage = (event: MessageEvent) => {
      const { data } = event;
      if (data instanceof ArrayBuffer) {
        pipeline.receiveBinary(data);
        if (decoderReadyRef.current) {
          void drainLoop();
        }
      } else if (data instanceof Uint8Array) {
        pipeline.receiveBinary(data);
        if (decoderReadyRef.current) {
          void drainLoop();
        }
      }
    };

    dataChannel.addEventListener("message", handleMessage);
    tryApplyTimelineSync();
    return () => {
      dataChannel.removeEventListener("message", handleMessage);
      const videoDec = decompressorRef.current;
      decompressorRef.current = null;
      videoDec?.close();
      const audioDec = audioDecompressorRef.current;
      audioDecompressorRef.current = null;
      audioDec?.close();
      if (audioScheduleFlushRafRef.current !== null) {
        cancelAnimationFrame(audioScheduleFlushRafRef.current);
        audioScheduleFlushRafRef.current = null;
      }
      for (const d of pendingAudioDataRef.current) {
        d.close();
      }
      pendingAudioDataRef.current = [];
      flushAudioSchedulePendingRef.current = () => {};
      const ctx = audioContextRef.current;
      if (ctx) void ctx.close();
      audioContextRef.current = null;
      gainNodeRef.current = null;
      queueRef.current = [];
      bufferRef.current.clear();
      audioBufferRef.current.clear();
      audioClockRef.current = 0;
      lastFlushedSyncTimestampRef.current = null;
      lastAuthoritativeMediaTimeRef.current = null;
      hasPresentedVideoFrameRef.current = false;
      lastVideoFrameTimestampUsRef.current = null;
      trimEncodedAudioInProgressRef.current = false;
      lastEncodedAudioTrimPerfRef.current = 0;
      adaptiveAudioScheduleAheadSecRef.current = MAX_AUDIO_SCHEDULE_AHEAD_SEC;
      adaptivePendingDecodedBeforeDecodeRef.current = MAX_PENDING_DECODED_AUDIO_BEFORE_DECODE;
      adaptiveEncodedTrimTriggerMsRef.current = ENCODED_AUDIO_OVER_VIDEO_TRIM_TRIGGER_MS;
      adaptiveEncodedTrimCooldownMsRef.current = ENCODED_AUDIO_TRIM_COOLDOWN_MS;
      choppyEventTimesRef.current = [];
      lastChoppyEventAtRef.current = 0;
      setDecoderReady(false);
      decoderReadyRef.current = false;
      setDecoderError(null);
      setBufferState(bufferRef.current.getState());
    };
  }, [videoConfig, dataChannel, pipeline, drainLoop, drainAudioLoop, scheduleAudioData, tryApplyTimelineSync]);

  useEffect(() => {
    tryApplyTimelineSync();
  }, [
    timelineSync?.timestamp,
    timelineSync?.action,
    timelineSync?.time,
    tryApplyTimelineSync,
  ]);

  return {
    bufferState,
    decoderReady,
    decoderError,
    receiveChunk: (payload: MediaChunkPayload) => {
      if (payload.trackKind === "audio") {
        audioBufferRef.current.enqueue({
          sequenceNumber: payload.sequenceNumber,
          type: payload.type,
          timestamp: payload.timestamp,
          duration: payload.duration,
          data: payload.data,
        });
        trimExcessEncodedAudioLeadRef.current();
        return;
      }
      queueRef.current.push(payload);
      bufferRef.current.enqueue({
        sequenceNumber: payload.sequenceNumber,
        type: payload.type,
        timestamp: payload.timestamp,
        duration: payload.duration,
        data: payload.data,
      });
      setBufferState(bufferRef.current.getState());
      trimExcessEncodedAudioLeadRef.current();
      if (decoderReadyRef.current) {
        void drainLoop();
      }
    },
    activatePlayback: async () => {
      if (!decoderReadyRef.current) {
        return false;
      }
      isActivatedRef.current = true;
      if (!audioContextRef.current) {
        const ctx = new AudioContext();
        const g = ctx.createGain();
        g.gain.value = normalizedMutedRef.current ? 0 : normalizedVolumeRef.current;
        g.connect(ctx.destination);
        audioContextRef.current = ctx;
        gainNodeRef.current = g;
        audioClockRef.current = ctx.currentTime;
      }
      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }
      audioClockRef.current = audioContextRef.current.currentTime;
      await drainLoop();
      void drainAudioLoop();
      return true;
    },
  };
}
