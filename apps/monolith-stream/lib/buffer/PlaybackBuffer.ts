import type { BufferState, EncodedChunkPayload } from "@swiss/webrtc-pipeline";

const START_TOLERANCE_MS = 50;
const FALLBACK_FRAME_DURATION_MS = 1000 / 30;

export class PlaybackBuffer {
  private readonly queue: EncodedChunkPayload[] = [];
  private underrunCount = 0;

  constructor(private readonly targetBufferDurationMs: number) {}

  enqueue(chunk: EncodedChunkPayload): BufferState {
    this.queue.push(chunk);
    return this.getState();
  }

  dequeue(): EncodedChunkPayload | undefined {
    const item = this.queue.shift();
    if (!item) {
      this.underrunCount += 1;
      return undefined;
    }
    return item;
  }

  /** Remove the oldest chunk without counting an underrun (used to drop excess encoded lead). */
  discardHead(): EncodedChunkPayload | undefined {
    return this.queue.shift();
  }

  peek(): EncodedChunkPayload | undefined {
    return this.queue[0];
  }

  clear(): void {
    this.queue.length = 0;
  }

  getState(): BufferState {
    const currentBufferDurationMs = this.currentBufferedDurationMs();
    return {
      currentBufferDurationMs,
      targetBufferDurationMs: this.targetBufferDurationMs,
      state:
        currentBufferDurationMs >= Math.max(0, this.targetBufferDurationMs - START_TOLERANCE_MS)
          ? "playing"
          : "buffering",
      underrunCount: this.underrunCount,
    };
  }

  private currentBufferedDurationMs(): number {
    let totalMs = 0;
    let lastTimestamp: number | null = null;

    for (const chunk of this.queue) {
      if (typeof chunk.duration === "number" && chunk.duration > 0) {
        totalMs += chunk.duration / 1000;
      } else if (lastTimestamp !== null && chunk.timestamp > lastTimestamp) {
        totalMs += (chunk.timestamp - lastTimestamp) / 1000;
      } else {
        totalMs += FALLBACK_FRAME_DURATION_MS;
      }

      lastTimestamp = chunk.timestamp;
    }

    return totalMs;
  }
}
