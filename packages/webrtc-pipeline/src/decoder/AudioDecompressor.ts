import type { AudioConfig, MediaChunkPayload } from "../types";

type AudioHandler = (data: AudioData) => void;

export class AudioDecompressor {
  private decoder: AudioDecoder;
  private readonly config: AudioConfig;
  private readonly onAudio: AudioHandler;
  private needsKeyFrame = true;
  private isClosed = false;

  constructor(config: AudioConfig, onAudio: AudioHandler) {
    this.config = config;
    this.onAudio = onAudio;
    this.decoder = this.createDecoder();
  }

  private createDecoder(): AudioDecoder {
    const decoder = new AudioDecoder({
      output: (data) => {
        if (this.isClosed) {
          data.close();
          return;
        }
        this.needsKeyFrame = false;
        this.onAudio(data);
      },
      error: (error) => {
        if (this.isClosed) {
          return;
        }
        this.needsKeyFrame = true;
        console.warn("AudioDecoder error (recoverable)", error);
      },
    });

    try {
      decoder.configure({
        codec: this.config.codec,
        sampleRate: this.config.sampleRate,
        numberOfChannels: this.config.numberOfChannels,
      });
    } catch (error) {
      console.warn("AudioDecoder configure failed", { codec: this.config.codec, error });
    }

    return decoder;
  }

  private recreateDecoder(): void {
    try {
      this.decoder.close();
    } catch {
      // ignore close races
    }
    this.decoder = this.createDecoder();
    this.needsKeyFrame = true;
  }

  decode(payload: MediaChunkPayload): void {
    if (this.isClosed) return;
    if (payload.trackKind !== "audio") return;
    if (this.needsKeyFrame && payload.type !== "key") return;

    const chunk = new EncodedAudioChunk({
      type: payload.type,
      timestamp: payload.timestamp,
      duration: payload.duration ?? undefined,
      data: payload.data,
    });

    try {
      this.decoder.decode(chunk);
    } catch (error) {
      this.needsKeyFrame = true;

      const err = error as Error & { name?: string };
      if (
        payload.type === "key" &&
        (err?.name === "InvalidStateError" ||
          err?.name === "NotSupportedError" ||
          err?.message?.includes("Decoder must be configured first") ||
          err?.message?.includes("encoding is not supported"))
      ) {
        this.recreateDecoder();
      }

      console.warn("AudioDecoder dropped chunk while waiting for keyframe", error);
    }
  }

  async flush(): Promise<void> {
    if (this.isClosed) return;
    try {
      await this.decoder.flush();
    } catch {
      // Firefox may throw if flush is called before successful configure/initial decode.
      this.recreateDecoder();
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
      // ignore close races
    }
  }
}
