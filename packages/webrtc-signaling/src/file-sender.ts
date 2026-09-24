import {
  encodeFileFrame,
  FILE_MSG_ABORT,
  FILE_MSG_CHUNK,
  FILE_MSG_COMPLETE,
  FILE_MSG_META,
  generateTransferId,
  TRANSFER_ID_BYTES,
} from "./file-frame";

/** Chunk size and send buffer limits derived from total file size (research thresholds). */
export function getChunkingOptionsForFileSize(fileSizeBytes: number): {
  chunkPayloadSize: number;
  maxBufferedAmount: number;
} {
  const mb = 1024 * 1024;
  if (fileSizeBytes < 10 * mb) {
    return { chunkPayloadSize: 64 * 1024, maxBufferedAmount: 1 * mb };
  }
  if (fileSizeBytes <= 100 * mb) {
    return { chunkPayloadSize: 128 * 1024, maxBufferedAmount: 2 * mb };
  }
  return { chunkPayloadSize: 256 * 1024, maxBufferedAmount: 4 * mb };
}

export type SendFileOptions = {
  /** Max bytes per FILE_CHUNK payload (default: sized from file). */
  chunkPayloadSize?: number;
  /** Pause sending when `bufferedAmount` exceeds this (default: sized from file). */
  maxBufferedAmount?: number;
  /** If returns true, sender yields until it returns false again. */
  isPaused?: () => boolean;
  /**
   * Wire transfer id (16 bytes). When omitted, a random id is generated.
   * Use the same bytes with {@link sendFileAbort} if you cancel from outside the send loop.
   */
  transferId?: Uint8Array;
  /**
   * When true, sending stops and the peer receives `FILE_MSG_ABORT`.
   * Checked each loop iteration (and after buffering waits).
   */
  shouldCancel?: () => boolean;
  onProgress?: (sent: number, total: number) => void;
};

function waitBufferedLow(dc: RTCDataChannel, threshold: number): Promise<void> {
  if (dc.bufferedAmount <= threshold) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const tick = () => {
      if (dc.bufferedAmount <= threshold) {
        dc.removeEventListener("bufferedamountlow", tick);
        resolve();
      }
    };
    dc.addEventListener("bufferedamountlow", tick);
  });
}

/**
 * Sends one file over an open DataChannel using the v1 file framing protocol.
 * Respects `bufferedAmount` to avoid exhausting memory on large files.
 */
export async function sendFileOverDataChannel(
  dc: RTCDataChannel,
  file: File,
  options: SendFileOptions = {},
): Promise<void> {
  if (dc.readyState !== "open") {
    throw new Error("DataChannel is not open");
  }

  const total = file.size;
  const derived = getChunkingOptionsForFileSize(total);
  const chunkPayloadSize = options.chunkPayloadSize ?? derived.chunkPayloadSize;
  const maxBuffered = options.maxBufferedAmount ?? derived.maxBufferedAmount;
  const lowThreshold = Math.min(maxBuffered / 2, 512 * 1024);
  dc.bufferedAmountLowThreshold = lowThreshold;

  const transferId = options.transferId ?? generateTransferId();
  if (transferId.length !== TRANSFER_ID_BYTES) {
    throw new Error(`transferId must be ${TRANSFER_ID_BYTES} bytes`);
  }
  const meta = new TextEncoder().encode(
    JSON.stringify({
      name: file.name,
      size: total,
      mime: file.type || "application/octet-stream",
    }),
  );

  dc.send(
    encodeFileFrame(FILE_MSG_META, transferId, 0, 0, new Uint8Array(meta.buffer, meta.byteOffset, meta.byteLength)),
  );

  let offset = 0;
  let chunkIndex = 0;

  while (offset < total) {
    if (options.shouldCancel?.()) {
      sendFileAbort(dc, transferId);
      throw new DOMException("Transfer cancelled", "AbortError");
    }
    if (options.isPaused?.()) {
      await new Promise((r) => setTimeout(r, 50));
      continue;
    }

    await waitBufferedLow(dc, maxBuffered);

    if (options.shouldCancel?.()) {
      sendFileAbort(dc, transferId);
      throw new DOMException("Transfer cancelled", "AbortError");
    }

    const end = Math.min(offset + chunkPayloadSize, total);
    const slice = file.slice(offset, end);
    const buf = await slice.arrayBuffer();
    const payload = new Uint8Array(buf);

    dc.send(encodeFileFrame(FILE_MSG_CHUNK, transferId, chunkIndex, 0, payload));

    offset = end;
    chunkIndex += 1;
    options.onProgress?.(offset, total);
  }

  dc.send(encodeFileFrame(FILE_MSG_COMPLETE, transferId, 0, 0, new Uint8Array(0)));
}

/** Notify peer that a transfer is aborted (best-effort). */
export function sendFileAbort(dc: RTCDataChannel, transferId: Uint8Array): void {
  if (dc.readyState !== "open") {
    return;
  }
  dc.send(encodeFileFrame(FILE_MSG_ABORT, transferId, 0, 0, new Uint8Array(0)));
}
