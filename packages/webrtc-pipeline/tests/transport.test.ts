import { describe, expect, test } from "vitest";
import { DataChannelPipeline } from "../src/transport/DataChannelPipeline";
import type { EncodedChunkPayload } from "../src/types";

class FakeDataChannel {
  public readyState: RTCDataChannelState = "open";
  public sent: Uint8Array[] = [];

  send(data: ArrayBufferLike | ArrayBufferView): void {
    if (ArrayBuffer.isView(data)) {
      this.sent.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice());
      return;
    }
    this.sent.push(new Uint8Array(data).slice());
  }
}

function makePayload(size: number): EncodedChunkPayload {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    bytes[i] = i % 251;
  }
  return {
    sequenceNumber: 7,
    type: "delta",
    timestamp: 123456,
    duration: 33333,
    data: bytes,
  };
}

describe("DataChannelPipeline", () => {
  test("sends small payload as one message", () => {
    const channel = new FakeDataChannel();
    const received: EncodedChunkPayload[] = [];
    const pipeline = new DataChannelPipeline(channel, (payload) => received.push(payload), 1024);
    const payload = makePayload(100);

    pipeline.sendChunk(payload);
    expect(channel.sent).toHaveLength(1);

    pipeline.receiveBinary(channel.sent[0]);
    expect(received).toHaveLength(1);
    expect(received[0].sequenceNumber).toBe(payload.sequenceNumber);
    expect(received[0].data).toEqual(payload.data);
  });

  test("fragments and reassembles large payload", () => {
    const channel = new FakeDataChannel();
    const received: EncodedChunkPayload[] = [];
    const pipeline = new DataChannelPipeline(channel, (payload) => received.push(payload), 180);
    const payload = makePayload(10_000);

    pipeline.sendChunk(payload);
    expect(channel.sent.length).toBeGreaterThan(1);

    // Simulate loss-free but out-of-order delivery.
    const shuffled = [...channel.sent].reverse();
    shuffled.forEach((fragment) => pipeline.receiveBinary(fragment));

    expect(received).toHaveLength(1);
    expect(received[0].sequenceNumber).toBe(payload.sequenceNumber);
    expect(received[0].timestamp).toBe(payload.timestamp);
    expect(received[0].duration).toBe(payload.duration);
    expect(received[0].data).toEqual(payload.data);
  });
});
