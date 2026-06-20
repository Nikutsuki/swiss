import type { EncodedChunkPayload, VideoConfig } from "../types";

type FrameHandler = (frame: VideoFrame) => void;

export class VideoDecompressor {
  private decoder: VideoDecoder;
  private readonly config: VideoConfig;
  private readonly onFrame: FrameHandler;
  private readonly codecCandidates: string[];
  private activeCodec: string;
  private configured: boolean;
  private needsKeyFrame = true;
  private fallbackRequested = false;
  private isClosed = false;

  constructor(config: VideoConfig, onFrame: FrameHandler) {
    this.config = config;
    this.onFrame = onFrame;
    this.codecCandidates = Array.from(new Set([
      config.codec,
      "av01.0.08M.08",
      "vp09.00.10.08",
      "avc1.640028",
    ]));
    this.activeCodec = config.codec;

    const bootOrder = Array.from(new Set([config.codec, ...this.codecCandidates]));
    const first = this.createDecoderWithCodec(bootOrder[0]);
    this.decoder = first.decoder;
    this.configured = first.configured;

    if (first.configured) {
      this.activeCodec = bootOrder[0];
      return;
    }

    for (let i = 1; i < bootOrder.length; i += 1) {
      const codec = bootOrder[i];
      const next = this.createDecoderWithCodec(codec);
      if (!next.configured) {
        try {
          next.decoder.close();
        } catch {
          // ignore close races
        }
        continue;
      }
      try {
        this.decoder.close();
      } catch {
        // ignore close races
      }
      this.decoder = next.decoder;
      this.activeCodec = codec;
      this.configured = true;
      return;
    }

    this.configured = false;
    console.warn("VideoDecoder could not be configured for any candidate codec", {
      requested: config.codec,
      candidates: this.codecCandidates,
    });
  }

  private createDecoderWithCodec(codec: string): { decoder: VideoDecoder; configured: boolean } {
    const decoder = new VideoDecoder({
      output: (frame) => {
        if (this.isClosed) {
          frame.close();
          return;
        }
        this.needsKeyFrame = false;
        this.onFrame(frame);
      },
      error: (error) => {
        if (this.isClosed) {
          return;
        }
        // Decoder runtime errors are often recoverable on next keyframe using codec fallback.
        this.needsKeyFrame = true;
        this.fallbackRequested = true;
        console.warn("VideoDecoder error (will retry/fallback on next keyframe)", error);
      },
    });

    try {
      decoder.configure({
        codec,
        hardwareAcceleration: this.config.hardwareAcceleration ?? "no-preference",
      });
      return { decoder, configured: true };
    } catch (error) {
      console.warn("VideoDecoder configure rejected codec", { codec, error });
      return { decoder, configured: false };
    }
  }

  private isDecoderStateError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const err = error as Error & { name?: string };
    return (
      err.name === "InvalidStateError" ||
      err.name === "NotSupportedError" ||
      err.message.includes("Decoder must be configured first") ||
      err.message.includes("encoding is not supported")
    );
  }

  private buildChunk(payload: EncodedChunkPayload): EncodedVideoChunk {
    return new EncodedVideoChunk({
      type: payload.type,
      timestamp: payload.timestamp,
      duration: payload.duration ?? undefined,
      data: payload.data,
    });
  }

  private isDataError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (("name" in error && (error as { name?: string }).name === "DataError") ||
        error.message.includes("wasn't a key frame"))
    );
  }

  private recreateDecoderWithCodec(codec: string): boolean {
    try {
      this.decoder.close();
    } catch {
      // ignore close races
    }
    const { decoder, configured } = this.createDecoderWithCodec(codec);
    this.activeCodec = codec;
    this.decoder = decoder;
    this.configured = configured;
    this.needsKeyFrame = true;
    return configured;
  }

  isConfigured(): boolean {
    return this.configured;
  }

  private tryFallbackCodecs(payload: EncodedChunkPayload): boolean {
    if (payload.type !== "key") return false;

    for (const codec of this.codecCandidates) {
      if (codec === this.activeCodec) continue;
      try {
        const configured = this.recreateDecoderWithCodec(codec);
        if (!configured) {
          continue;
        }
        this.decoder.decode(this.buildChunk(payload));
        // Decoder accepted the keyframe with this codec.
        return true;
      } catch {
        // Try the next codec candidate.
      }
    }

    return false;
  }

  decode(payload: EncodedChunkPayload): void {
    if (this.isClosed) return;
    if (this.needsKeyFrame && payload.type !== "key") {
      return;
    }

    if (payload.type === "key" && this.fallbackRequested) {
      this.fallbackRequested = false;
      if (this.tryFallbackCodecs(payload)) {
        return;
      }
      // Keep waiting for a decodable keyframe if no fallback candidate accepted this one.
      this.needsKeyFrame = true;
    }

    const chunk = this.buildChunk(payload);
    try {
      this.decoder.decode(chunk);
    } catch (error) {
      // Decoder may reject after reset/flush until next keyframe.
      this.needsKeyFrame = true;
      this.fallbackRequested = true;

      // A keyframe DataError usually means decoder state drifted (e.g. renegotiation/teardown race).
      // Recreate decoder so the next real keyframe can bootstrap playback cleanly.
      if (!this.isClosed && payload.type === "key" && (this.isDataError(error) || this.isDecoderStateError(error))) {
        if (this.tryFallbackCodecs(payload)) {
          this.fallbackRequested = false;
          return;
        }
        void this.recreateDecoderWithCodec(this.config.codec);
      }

      console.warn("VideoDecoder dropped chunk while waiting for keyframe", error);
    }
  }

  async flush(): Promise<void> {
    if (this.isClosed) return;
    try {
      await this.decoder.flush();
    } catch {
      // Some browsers may throw if flush runs before a successful configure/initial keyframe.
      // Recreate the decoder so the next real keyframe can bootstrap playback.
      const configured = this.recreateDecoderWithCodec(this.activeCodec);
      if (!configured) {
        void this.recreateDecoderWithCodec(this.config.codec);
      }
      // `recreateDecoderWithCodec` sets `needsKeyFrame = true` for us.
      return;
    }
    this.needsKeyFrame = true;
  }

  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    try {
      this.decoder.close();
    } catch {
      // ignore abort/close races during teardown
    }
  }
}
