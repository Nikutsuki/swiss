import type { AudioConfig, MediaChunkPayload } from "../types";

type OutputHandler = (payload: MediaChunkPayload) => void;

export class AudioCompressor {
  private readonly encoder: AudioEncoder;
  private sequenceNumber = 0;
  private isClosed = false;

  constructor(private readonly config: AudioConfig, private readonly onOutput: OutputHandler) {
    this.encoder = new AudioEncoder({
      output: (chunk) => this.handleChunk(chunk),
      error: (error) => console.error("AudioEncoder error", error),
    });
    this.encoder.configure({
      codec: config.codec,
      sampleRate: config.sampleRate,
      numberOfChannels: config.numberOfChannels,
      bitrate: config.bitrate,
    });
  }

  encode(data: AudioData): void {
    if (this.isClosed) return;
    try {
      this.encoder.encode(data);
    } catch (error) {
      // Runtime can race with teardown or reject malformed frames.
      console.warn("AudioEncoder dropped frame", error);
    }
  }

  async flush(): Promise<void> {
    if (this.isClosed) return;
    await this.encoder.flush();
  }

  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.encoder.close();
  }

  private handleChunk(chunk: EncodedAudioChunk): void {
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    this.onOutput({
      sequenceNumber: this.sequenceNumber++,
      trackKind: "audio",
      type: chunk.type,
      timestamp: chunk.timestamp,
      duration: chunk.duration ?? null,
      data,
    });
  }
}
