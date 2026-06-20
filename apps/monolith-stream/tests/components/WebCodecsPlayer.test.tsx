import { describe, expect, test } from "vitest";
import { PlaybackBuffer } from "../../lib/buffer/PlaybackBuffer";

describe("WebCodecs playback buffering states", () => {
  test("stays buffering until target duration and resumes buffering on underrun", () => {
    const buffer = new PlaybackBuffer(2000);

    const baseChunk = {
      sequenceNumber: 1,
      type: "delta" as const,
      timestamp: 0,
      data: new Uint8Array([1, 2, 3]),
    };

    let state = buffer.enqueue({ ...baseChunk, duration: 900_000 });
    expect(state.state).toBe("buffering");

    state = buffer.enqueue({ ...baseChunk, sequenceNumber: 2, duration: 1_200_000 });
    expect(state.state).toBe("playing");
    expect(state.currentBufferDurationMs).toBe(2100);

    buffer.dequeue();
    buffer.dequeue();
    buffer.dequeue(); // underrun
    state = buffer.getState();
    expect(state.state).toBe("buffering");
    expect(state.underrunCount).toBe(1);
  });

  test("discardHead removes oldest without underrun", () => {
    const buffer = new PlaybackBuffer(2000);
    buffer.enqueue({
      sequenceNumber: 1,
      type: "delta",
      timestamp: 0,
      duration: 500_000,
      data: new Uint8Array([1]),
    });
    buffer.enqueue({
      sequenceNumber: 2,
      type: "delta",
      timestamp: 500_000,
      duration: 500_000,
      data: new Uint8Array([2]),
    });
    expect(buffer.getState().currentBufferDurationMs).toBe(1000);
    const dropped = buffer.discardHead();
    expect(dropped?.sequenceNumber).toBe(1);
    expect(buffer.getState().currentBufferDurationMs).toBe(500);
    expect(buffer.getState().underrunCount).toBe(0);
  });
});
