import streamSaver from "streamsaver";

import type { IncomingFileMeta, StreamingFileSink } from "@swiss/webrtc-signaling";

/** Above this size, incoming files are written with StreamSaver instead of a full RAM buffer. */
export const STREAM_SAVER_THRESHOLD_BYTES = 256 * 1024 * 1024;

/**
 * Returns a sink that streams to disk via StreamSaver, or `null` to use the default in-memory buffer.
 */
export function createStreamSaverSinkIfLarge(meta: IncomingFileMeta): StreamingFileSink | null {
  if (meta.size < STREAM_SAVER_THRESHOLD_BYTES) {
    return null;
  }
  if (typeof window === "undefined") {
    return null;
  }
  const stream = streamSaver.createWriteStream(meta.name, {
    size: meta.size,
  });
  const writer = stream.getWriter();
  return {
    writeChunk: (chunk) => writer.write(chunk),
    close: () => writer.close(),
    abort: () => writer.abort(),
  };
}
