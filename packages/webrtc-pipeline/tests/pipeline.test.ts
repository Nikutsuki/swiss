import { beforeEach, describe, expect, test, vi } from "vitest";
import { VideoCompressor } from "../src/encoder/VideoCompressor";
import { VideoDecompressor } from "../src/decoder/VideoDecompressor";
import type { EncodedChunkPayload, VideoConfig } from "../src/types";

class FakeEncodedVideoChunk {
  public readonly type: "key" | "delta";
  public readonly timestamp: number;
  public readonly duration?: number;
  public readonly byteLength: number;
  private readonly bytes: Uint8Array;

  constructor(init: { type: "key" | "delta"; timestamp: number; duration?: number; data: Uint8Array }) {
    this.type = init.type;
    this.timestamp = init.timestamp;
    this.duration = init.duration;
    this.bytes = init.data.slice();
    this.byteLength = this.bytes.byteLength;
  }

  copyTo(destination: Uint8Array): void {
    destination.set(this.bytes);
  }
}

describe("WebCodecs pipeline", () => {
  beforeEach(() => {
    class FakeVideoEncoder {
      private readonly output: (chunk: EncodedVideoChunk) => void;
      constructor(init: VideoEncoderInit) {
        this.output = init.output;
      }
      configure = vi.fn();
      encode = vi.fn((_frame: VideoFrame, options?: VideoEncoderEncodeOptions) => {
        const mockData = new Uint8Array([9, 8, 7, 6]);
        const chunk = new FakeEncodedVideoChunk({
          type: options?.keyFrame ? "key" : "delta",
          timestamp: 1000,
          duration: 33333,
          data: mockData,
        }) as unknown as EncodedVideoChunk;
        this.output(chunk);
      });
      flush = vi.fn(async () => {});
      close = vi.fn();
    }

    class FakeVideoDecoder {
      private readonly output: (frame: VideoFrame) => void;
      constructor(init: VideoDecoderInit) {
        this.output = init.output;
      }
      configure = vi.fn();
      decode = vi.fn((_chunk: EncodedVideoChunk) => {
        const frame = { close: vi.fn() } as unknown as VideoFrame;
        this.output(frame);
      });
      flush = vi.fn(async () => {});
      close = vi.fn();
    }

    vi.stubGlobal("VideoEncoder", FakeVideoEncoder);
    vi.stubGlobal("VideoDecoder", FakeVideoDecoder);
    vi.stubGlobal("EncodedVideoChunk", FakeEncodedVideoChunk);
  });

  test("encodes chunk payload and decodes to frame callback", async () => {
    const config: VideoConfig = {
      codec: "avc1.640028",
      width: 1920,
      height: 1080,
      bitrate: 8_000_000,
      framerate: 30,
      hardwareAcceleration: "prefer-hardware",
    };

    const encoded: EncodedChunkPayload[] = [];
    const frames: VideoFrame[] = [];

    const compressor = new VideoCompressor(config, (payload) => encoded.push(payload));
    const decompressor = new VideoDecompressor(config, (frame) => frames.push(frame));

    compressor.encode({} as VideoFrame, true);
    expect(encoded).toHaveLength(1);
    expect(encoded[0].type).toBe("key");
    expect(encoded[0].data).toEqual(new Uint8Array([9, 8, 7, 6]));

    decompressor.decode(encoded[0]);
    expect(frames).toHaveLength(1);

    await compressor.flush();
    await decompressor.flush();
  });

  test("drops delta chunks until first keyframe arrives", () => {
    const config: VideoConfig = {
      codec: "avc1.640028",
      width: 1920,
      height: 1080,
      bitrate: 8_000_000,
      framerate: 30,
      hardwareAcceleration: "prefer-hardware",
    };

    const frames: VideoFrame[] = [];
    const decompressor = new VideoDecompressor(config, (frame) => frames.push(frame));

    decompressor.decode({
      sequenceNumber: 1,
      type: "delta",
      timestamp: 1_000,
      duration: 33_333,
      data: new Uint8Array([1, 2, 3]),
    });
    expect(frames).toHaveLength(0);

    decompressor.decode({
      sequenceNumber: 2,
      type: "key",
      timestamp: 2_000,
      duration: 33_333,
      data: new Uint8Array([4, 5, 6]),
    });
    expect(frames).toHaveLength(1);
  });
});
