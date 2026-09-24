import type { DataFragment, EncodedChunkPayload } from "../types";
import { deserializeEncodedChunk, serializeEncodedChunk } from "./serialization";

const FRAGMENT_KIND = 1;
const WHOLE_CHUNK_KIND = 0;
const FRAGMENT_HEADER_BYTES = 13;
const DEFAULT_MAX_MESSAGE_SIZE = 64 * 1024;

interface ReassemblyEntry {
  receivedCount: number;
  fragmentCount: number;
  parts: Array<Uint8Array | undefined>;
}

interface DataChannelLike {
  readyState: RTCDataChannelState;
  send(data: ArrayBufferLike | ArrayBufferView): void;
}

export class DataChannelPipeline {
  private readonly maxMessageSize: number;
  private readonly channel: DataChannelLike;
  private readonly onChunkReceived: (payload: EncodedChunkPayload) => void;
  private nextMessageId = 1;
  private readonly reassembly = new Map<number, ReassemblyEntry>();

  constructor(
    channel: DataChannelLike,
    onChunkReceived: (payload: EncodedChunkPayload) => void,
    maxMessageSize?: number,
  ) {
    this.channel = channel;
    this.onChunkReceived = onChunkReceived;
    this.maxMessageSize = Math.max(1024, maxMessageSize ?? DEFAULT_MAX_MESSAGE_SIZE);
  }

  sendChunk(payload: EncodedChunkPayload): void {
    this.assertChannelOpen();

    const encoded = serializeEncodedChunk(payload);
    if (encoded.byteLength <= this.maxMessageSize) {
      const packet = new Uint8Array(1 + encoded.byteLength);
      packet[0] = WHOLE_CHUNK_KIND;
      packet.set(encoded, 1);
      this.channel.send(packet);
      return;
    }

    const maxFragmentPayloadBytes = this.maxMessageSize - FRAGMENT_HEADER_BYTES;
    if (maxFragmentPayloadBytes <= 0) {
      throw new Error("Invalid maxMessageSize for fragmentation");
    }

    const fragmentCount = Math.ceil(encoded.byteLength / maxFragmentPayloadBytes);
    const messageId = this.nextMessageId++;
    for (let fragmentIndex = 0; fragmentIndex < fragmentCount; fragmentIndex += 1) {
      const start = fragmentIndex * maxFragmentPayloadBytes;
      const end = Math.min(start + maxFragmentPayloadBytes, encoded.byteLength);
      const fragmentPayload = encoded.subarray(start, end);
      const fragmentMessage = this.serializeFragment({
        kind: "fragment",
        messageId,
        fragmentIndex,
        fragmentCount,
        payload: fragmentPayload,
      });
      this.channel.send(fragmentMessage);
    }
  }

  receiveBinary(data: ArrayBuffer | Uint8Array): void {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (bytes.byteLength === 0) {
      return;
    }

    const kind = bytes[0];
    if (kind === WHOLE_CHUNK_KIND) {
      const payload = deserializeEncodedChunk(bytes.subarray(1));
      this.onChunkReceived(payload);
      return;
    }

    if (kind !== FRAGMENT_KIND) {
      throw new Error("Unknown data channel packet kind");
    }

    const fragment = this.deserializeFragment(bytes);
    this.receiveFragment(fragment);
  }

  private receiveFragment(fragment: DataFragment): void {
    const existing = this.reassembly.get(fragment.messageId);
    const entry: ReassemblyEntry = existing ?? {
      receivedCount: 0,
      fragmentCount: fragment.fragmentCount,
      parts: new Array(fragment.fragmentCount),
    };

    if (fragment.fragmentCount !== entry.fragmentCount) {
      this.reassembly.delete(fragment.messageId);
      throw new Error("Fragment count mismatch during reassembly");
    }

    if (!entry.parts[fragment.fragmentIndex]) {
      entry.parts[fragment.fragmentIndex] = fragment.payload;
      entry.receivedCount += 1;
    }

    this.reassembly.set(fragment.messageId, entry);

    if (entry.receivedCount < entry.fragmentCount) {
      return;
    }

    const totalLength = entry.parts.reduce((acc, part) => acc + (part?.byteLength ?? 0), 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of entry.parts) {
      if (!part) {
        this.reassembly.delete(fragment.messageId);
        throw new Error("Incomplete fragments after completion");
      }
      merged.set(part, offset);
      offset += part.byteLength;
    }

    this.reassembly.delete(fragment.messageId);
    this.onChunkReceived(deserializeEncodedChunk(merged));
  }

  private serializeFragment(fragment: DataFragment): Uint8Array {
    const out = new Uint8Array(FRAGMENT_HEADER_BYTES + fragment.payload.byteLength);
    const view = new DataView(out.buffer);
    view.setUint8(0, FRAGMENT_KIND);
    view.setUint32(1, fragment.messageId, true);
    view.setUint16(5, fragment.fragmentIndex, true);
    view.setUint16(7, fragment.fragmentCount, true);
    view.setUint32(9, fragment.payload.byteLength, true);
    out.set(fragment.payload, FRAGMENT_HEADER_BYTES);
    return out;
  }

  private deserializeFragment(bytes: Uint8Array): DataFragment {
    if (bytes.byteLength < FRAGMENT_HEADER_BYTES) {
      throw new Error("Fragment packet too small");
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const messageId = view.getUint32(1, true);
    const fragmentIndex = view.getUint16(5, true);
    const fragmentCount = view.getUint16(7, true);
    const payloadLength = view.getUint32(9, true);
    const payload = bytes.subarray(FRAGMENT_HEADER_BYTES);

    if (payloadLength !== payload.byteLength) {
      throw new Error("Fragment payload length mismatch");
    }
    if (fragmentCount === 0 || fragmentIndex >= fragmentCount) {
      throw new Error("Invalid fragment coordinates");
    }

    return {
      kind: "fragment",
      messageId,
      fragmentIndex,
      fragmentCount,
      payload,
    };
  }

  private assertChannelOpen(): void {
    if (this.channel.readyState !== "open") {
      throw new Error(`DataChannel is not open (state: ${this.channel.readyState})`);
    }
  }
}
