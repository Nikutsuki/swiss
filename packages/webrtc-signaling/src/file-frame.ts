/** Wire format: v1 | type | transferId(16) | chunkIndex | flags | payloadLen | payload */

export const FILE_FRAME_VERSION = 1;

export const FILE_MSG_META = 1;
export const FILE_MSG_CHUNK = 2;
export const FILE_MSG_COMPLETE = 3;
export const FILE_MSG_ABORT = 4;

export const TRANSFER_ID_BYTES = 16;

const HEADER_LEN =
  1 + 1 + TRANSFER_ID_BYTES + 4 + 4 + 4; // 30

export type ParsedFileFrame =
  | {
      ok: true;
      version: number;
      msgType: number;
      transferId: Uint8Array;
      chunkIndex: number;
      flags: number;
      payload: Uint8Array;
    }
  | { ok: false; error: string };

export function generateTransferId(): Uint8Array {
  const id = new Uint8Array(TRANSFER_ID_BYTES);
  crypto.getRandomValues(id);
  return id;
}

export function transferIdToHex(id: Uint8Array): string {
  return [...id].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function encodeFileFrame(
  msgType: number,
  transferId: Uint8Array,
  chunkIndex: number,
  flags: number,
  payload: Uint8Array,
): ArrayBuffer {
  if (transferId.length !== TRANSFER_ID_BYTES) {
    throw new Error("transferId must be 16 bytes");
  }
  const buf = new ArrayBuffer(HEADER_LEN + payload.byteLength);
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let o = 0;
  u8[o++] = FILE_FRAME_VERSION;
  u8[o++] = msgType;
  u8.set(transferId, o);
  o += TRANSFER_ID_BYTES;
  dv.setUint32(o, chunkIndex >>> 0, false);
  o += 4;
  dv.setUint32(o, flags >>> 0, false);
  o += 4;
  dv.setUint32(o, payload.byteLength >>> 0, false);
  o += 4;
  u8.set(payload, o);
  return buf;
}

export function parseFileFrame(data: ArrayBuffer): ParsedFileFrame {
  if (data.byteLength < HEADER_LEN) {
    return { ok: false, error: "frame too short" };
  }
  const u8 = new Uint8Array(data);
  const dv = new DataView(data);
  const version = u8[0]!;
  if (version !== FILE_FRAME_VERSION) {
    return { ok: false, error: "unsupported frame version" };
  }
  const msgType = u8[1]!;
  const transferId = u8.slice(2, 2 + TRANSFER_ID_BYTES);
  let o = 2 + TRANSFER_ID_BYTES;
  const chunkIndex = dv.getUint32(o, false);
  o += 4;
  const flags = dv.getUint32(o, false);
  o += 4;
  const payloadLen = dv.getUint32(o, false);
  o += 4;
  if (o + payloadLen > data.byteLength) {
    return { ok: false, error: "truncated payload" };
  }
  const payload = u8.slice(o, o + payloadLen);
  return {
    ok: true,
    version,
    msgType,
    transferId,
    chunkIndex,
    flags,
    payload,
  };
}
