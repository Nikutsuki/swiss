import type { EncodedChunkPayload } from "../types";

const HEADER_SIZE_BYTES = 28;
const DURATION_NOT_SET = Number.NaN;

export function serializeEncodedChunk(payload: EncodedChunkPayload): Uint8Array {
  const bytes = new Uint8Array(HEADER_SIZE_BYTES + payload.data.byteLength);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, payload.sequenceNumber, true);
  view.setUint8(4, payload.type === "key" ? 1 : 0);
  view.setFloat64(12, payload.timestamp, true);
  view.setFloat64(20, payload.duration ?? DURATION_NOT_SET, true);

  bytes.set(payload.data, HEADER_SIZE_BYTES);
  return bytes;
}

export function deserializeEncodedChunk(bytes: Uint8Array): EncodedChunkPayload {
  if (bytes.byteLength < HEADER_SIZE_BYTES) {
    throw new Error("Invalid encoded chunk payload: too small");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sequenceNumber = view.getUint32(0, true);
  const type = view.getUint8(4) === 1 ? "key" : "delta";
  const timestamp = view.getFloat64(12, true);
  const durationRaw = view.getFloat64(20, true);
  const duration = Number.isNaN(durationRaw) ? null : durationRaw;
  const data = bytes.slice(HEADER_SIZE_BYTES);

  return {
    sequenceNumber,
    type,
    timestamp,
    duration,
    data,
  };
}

export function getSerializedHeaderSizeBytes(): number {
  return HEADER_SIZE_BYTES;
}
