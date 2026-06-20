export type HardwareAccelerationPreference =
  | "prefer-hardware"
  | "prefer-software"
  | "no-preference";

export interface VideoConfig {
  codec: string;
  width: number;
  height: number;
  bitrate: number;
  framerate: number;
  hardwareAcceleration?: HardwareAccelerationPreference;
}

export interface EncodedChunkPayload {
  sequenceNumber: number;
  type: "key" | "delta";
  timestamp: number;
  duration: number | null;
  data: Uint8Array;
}

export type MediaTrackKind = "video" | "audio";

export interface MediaChunkPayload extends EncodedChunkPayload {
  trackKind: MediaTrackKind;
}

export interface AudioConfig {
  codec: string;
  sampleRate: number;
  numberOfChannels: number;
  bitrate?: number;
}

export interface BufferState {
  currentBufferDurationMs: number;
  targetBufferDurationMs: number;
  state: "buffering" | "playing";
  underrunCount: number;
}

export interface DataFragment {
  kind: "fragment";
  messageId: number;
  fragmentIndex: number;
  fragmentCount: number;
  payload: Uint8Array;
}
