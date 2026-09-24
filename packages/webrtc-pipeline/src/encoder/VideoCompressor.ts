import type { EncodedChunkPayload, VideoConfig } from "../types";

type OutputHandler = (payload: EncodedChunkPayload) => void;

export class VideoCompressor {
  private readonly encoder: VideoEncoder;
  private sequenceNumber = 0;

  constructor(private readonly config: VideoConfig, private readonly onOutput: OutputHandler) {
    this.encoder = this.createEncoderWithFallback();
  }

  encode(frame: VideoFrame, keyFrame = false): void {
    this.encoder.encode(frame, { keyFrame });
  }

  async flush(): Promise<void> {
    await this.encoder.flush();
  }

  close(): void {
    this.encoder.close();
  }

  private createEncoderWithFallback(): VideoEncoder {
    try {
      return this.createConfiguredEncoder(this.config.hardwareAcceleration ?? "prefer-hardware");
    } catch (error) {
      if (this.config.hardwareAcceleration === "prefer-software") {
        throw error;
      }
      return this.createConfiguredEncoder("prefer-software");
    }
  }

  private createConfiguredEncoder(hardwareAcceleration: HardwareAcceleration): VideoEncoder {
    const encoder = new VideoEncoder({
      output: (chunk) => this.handleChunk(chunk),
      error: (error) => {
        console.error("VideoEncoder error", error);
      },
    });

    const config: VideoEncoderConfig = {
      codec: this.config.codec,
      width: this.config.width,
      height: this.config.height,
      bitrate: this.config.bitrate,
      framerate: this.config.framerate,
      latencyMode: "quality",
      hardwareAcceleration,
    };

    // Use Annex B for AVC so decoder does not require out-of-band description blobs.
    if (this.config.codec.startsWith("avc1")) {
      (config as VideoEncoderConfig & { avc: { format: "annexb" | "avc" } }).avc = {
        format: "annexb",
      };
    }

    encoder.configure(config);

    return encoder;
  }

  private handleChunk(chunk: EncodedVideoChunk): void {
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    this.onOutput({
      sequenceNumber: this.sequenceNumber++,
      type: chunk.type,
      timestamp: chunk.timestamp,
      duration: chunk.duration ?? null,
      data,
    });
  }
}

type HardwareAcceleration = "prefer-hardware" | "prefer-software" | "no-preference";
