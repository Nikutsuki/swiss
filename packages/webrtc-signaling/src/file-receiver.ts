import {
  FILE_MSG_ABORT,
  FILE_MSG_CHUNK,
  FILE_MSG_COMPLETE,
  FILE_MSG_META,
  parseFileFrame,
  transferIdToHex,
} from "./file-frame";

export type IncomingFileMeta = {
  name: string;
  size: number;
  mime: string;
};

/** Writes chunks sequentially; used instead of a full in-memory buffer for large files. */
export type StreamingFileSink = {
  writeChunk: (chunk: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
  abort?: () => Promise<void>;
};

export type FileReceiverHandlers = {
  onMeta?: (transferIdHex: string, meta: IncomingFileMeta) => void;
  onProgress?: (transferIdHex: string, received: number, total: number) => void;
  onComplete?: (
    transferIdHex: string,
    blob: Blob,
    meta: IncomingFileMeta,
  ) => void;
  /**
   * When {@link createStreamingSink} is used, called after the sink closes successfully
   * (e.g. file already written to disk). No in-memory `Blob` is produced.
   */
  onStreamComplete?: (transferIdHex: string, meta: IncomingFileMeta) => void;
  onAbort?: (transferIdHex: string) => void;
  onError?: (transferIdHex: string | null, message: string) => void;
  /**
   * If this returns a sink, chunks are streamed through it instead of allocating `new Uint8Array(meta.size)`.
   * Return `null` or `undefined` to buffer the full file in memory (small files).
   */
  createStreamingSink?: (
    transferIdHex: string,
    meta: IncomingFileMeta,
  ) => StreamingFileSink | null | undefined;
};

type ActiveReceive =
  | {
      kind: "buffer";
      meta: IncomingFileMeta;
      buffer: Uint8Array;
      receivedBytes: number;
      nextChunk: number;
    }
  | {
      kind: "stream";
      meta: IncomingFileMeta;
      sink: StreamingFileSink;
      writeChain: Promise<void>;
      receivedBytes: number;
      nextChunk: number;
    };

export function attachFileReceiver(
  dc: RTCDataChannel,
  handlers: FileReceiverHandlers,
): () => void {
  const active = new Map<string, ActiveReceive>();

  const fail = (tid: string | null, msg: string) => {
    handlers.onError?.(tid, msg);
  };

  const abortStream = (rec: ActiveReceive) => {
    if (rec.kind === "stream") {
      const a = rec.sink.abort?.();
      if (a) void a.catch(() => undefined);
    }
  };

  const onMessage = (ev: MessageEvent<ArrayBuffer>) => {
    const raw = ev.data;
    if (!(raw instanceof ArrayBuffer)) {
      fail(null, "expected binary file frame");
      return;
    }
    const frame = parseFileFrame(raw);
    if (!frame.ok) {
      fail(null, frame.error);
      return;
    }

    const tidHex = transferIdToHex(frame.transferId);

    if (frame.msgType === FILE_MSG_ABORT) {
      const rec = active.get(tidHex);
      if (rec) {
        abortStream(rec);
        active.delete(tidHex);
      }
      handlers.onAbort?.(tidHex);
      return;
    }

    if (frame.msgType === FILE_MSG_META) {
      if (active.has(tidHex)) {
        fail(tidHex, "duplicate META for transfer");
        return;
      }
      let meta: IncomingFileMeta;
      try {
        const text = new TextDecoder().decode(frame.payload);
        const o = JSON.parse(text) as Record<string, unknown>;
        const name = String(o.name ?? "download");
        const size = Number(o.size);
        const mime = String(o.mime ?? "application/octet-stream");
        if (!Number.isFinite(size) || size < 0 || size > Number.MAX_SAFE_INTEGER) {
          fail(tidHex, "invalid file size");
          return;
        }
        meta = { name, size, mime };
      } catch {
        fail(tidHex, "invalid META json");
        return;
      }

      let sink: StreamingFileSink | null = null;
      try {
        sink = handlers.createStreamingSink?.(tidHex, meta) ?? null;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        fail(tidHex, `streaming setup failed: ${msg}`);
        return;
      }
      if (sink) {
        active.set(tidHex, {
          kind: "stream",
          meta,
          sink,
          writeChain: Promise.resolve(),
          receivedBytes: 0,
          nextChunk: 0,
        });
      } else {
        let buffer: Uint8Array;
        try {
          buffer = new Uint8Array(meta.size);
        } catch {
          fail(tidHex, "file too large to buffer");
          return;
        }
        active.set(tidHex, {
          kind: "buffer",
          meta,
          buffer,
          receivedBytes: 0,
          nextChunk: 0,
        });
      }
      handlers.onMeta?.(tidHex, meta);
      handlers.onProgress?.(tidHex, 0, meta.size);
      return;
    }

    const rec = active.get(tidHex);
    if (!rec) {
      fail(tidHex, "CHUNK before META");
      return;
    }

    if (frame.msgType === FILE_MSG_CHUNK) {
      if (frame.chunkIndex !== rec.nextChunk) {
        fail(tidHex, `unexpected chunk ${frame.chunkIndex}`);
        abortStream(rec);
        active.delete(tidHex);
        return;
      }
      const { meta } = rec;
      const chunk = frame.payload;
      if (rec.receivedBytes + chunk.byteLength > meta.size) {
        fail(tidHex, "chunk overflows declared size");
        abortStream(rec);
        active.delete(tidHex);
        return;
      }

      if (rec.kind === "buffer") {
        rec.buffer.set(chunk, rec.receivedBytes);
      } else {
        const chunkCopy = new Uint8Array(chunk.byteLength);
        chunkCopy.set(chunk);
        rec.writeChain = rec.writeChain
          .then(() => rec.sink.writeChunk(chunkCopy))
          .catch((e: unknown) => {
            const msg = e instanceof Error ? e.message : String(e);
            fail(tidHex, `stream write failed: ${msg}`);
            abortStream(rec);
            active.delete(tidHex);
          });
      }
      rec.receivedBytes += chunk.byteLength;
      rec.nextChunk += 1;
      handlers.onProgress?.(tidHex, rec.receivedBytes, meta.size);
      return;
    }

    if (frame.msgType === FILE_MSG_COMPLETE) {
      const { meta } = rec;
      if (rec.receivedBytes !== meta.size) {
        fail(tidHex, "size mismatch on COMPLETE");
        abortStream(rec);
        active.delete(tidHex);
        return;
      }
      active.delete(tidHex);

      if (rec.kind === "buffer") {
        const blob = new Blob([new Uint8Array(rec.buffer)], {
          type: meta.mime || "application/octet-stream",
        });
        handlers.onComplete?.(tidHex, blob, meta);
        return;
      }

      rec.writeChain = rec.writeChain
        .then(() => rec.sink.close())
        .then(() => {
          handlers.onStreamComplete?.(tidHex, meta);
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          fail(tidHex, `stream close failed: ${msg}`);
        });
      return;
    }

    fail(tidHex, `unknown msg type ${frame.msgType}`);
  };

  dc.addEventListener("message", onMessage);
  return () => {
    dc.removeEventListener("message", onMessage);
    for (const rec of active.values()) {
      abortStream(rec);
    }
    active.clear();
  };
}
