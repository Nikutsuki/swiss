import type { MediaChunkPayload } from "../types";

const HEADER_SIZE_BYTES = 29;
const DURATION_NOT_SET = Number.NaN;

export function serializeMediaChunk(payload: MediaChunkPayload): Uint8Array {
  const bytes = new Uint8Array(HEADER_SIZE_BYTES + payload.data.byteLength);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, payload.sequenceNumber, true);
  view.setUint8(4, payload.type === "key" ? 1 : 0);
  view.setUint8(5, payload.trackKind === "video" ? 0 : 1);
  view.setFloat64(13, payload.timestamp, true);
  view.setFloat64(21, payload.duration ?? DURATION_NOT_SET, true);
  bytes.set(payload.data, HEADER_SIZE_BYTES);

  return bytes;
}

export function deserializeMediaChunk(bytes: Uint8Array): MediaChunkPayload {
  if (bytes.byteLength < HEADER_SIZE_BYTES) {
    throw new Error("Invalid media chunk payload: too small");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sequenceNumber = view.getUint32(0, true);
  const type = view.getUint8(4) === 1 ? "key" : "delta";
  const trackKind = view.getUint8(5) === 0 ? "video" : "audio";
  const timestamp = view.getFloat64(13, true);
  const durationRaw = view.getFloat64(21, true);
  const duration = Number.isNaN(durationRaw) ? null : durationRaw;
  const data = bytes.slice(HEADER_SIZE_BYTES);

  return { sequenceNumber, type, trackKind, timestamp, duration, data };
}
